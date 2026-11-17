import { freezeTimeForTests } from "../core/time/timeSystem";
import { loadHealthRunsFromStorage, mergeHealthRuns, type StoredHealthRun } from "../healthRuns";
import {
  dedupeAppleHealthAndStravaRuns,
  isSameRunAcrossSources,
  replaceStravaRuns,
} from "./crossSourceRunDedup";

function apple(partial: Partial<StoredHealthRun> = {}): StoredHealthRun {
  return {
    runId: "hk_UUID-1",
    platformId: "UUID-1",
    startDate: "2026-11-16T06:30:00.000Z",
    duration: 3100,
    distanceMeters: 10000,
    distanceUnknown: false,
    workoutType: "running",
    sourceName: "Connect",
    avgHeartRateBpm: 150,
    ...partial,
  };
}

function strava(partial: Partial<StoredHealthRun> = {}): StoredHealthRun {
  return {
    runId: "strava:12000000001",
    startDate: "2026-11-16T06:32:30.000Z",
    duration: 3005,
    distanceMeters: 10240,
    distanceUnknown: false,
    workoutType: "running",
    sourceName: "Strava",
    avgHeartRateBpm: 149,
    ...partial,
  };
}

describe("isSameRunAcrossSources", () => {
  test("Start ±5 min und Distanz ±5 % → derselbe Lauf", () => {
    expect(isSameRunAcrossSources(apple(), strava())).toBe(true);
    expect(isSameRunAcrossSources(apple(), strava({ startDate: "2026-11-16T06:35:00.000Z" }))).toBe(true);
    expect(isSameRunAcrossSources(apple(), strava({ distanceMeters: 10500 }))).toBe(true);
  });

  test("Start > 5 min oder Distanz > 5 % auseinander → verschieden", () => {
    expect(isSameRunAcrossSources(apple(), strava({ startDate: "2026-11-16T06:35:01.000Z" }))).toBe(false);
    expect(isSameRunAcrossSources(apple(), strava({ distanceMeters: 10600 }))).toBe(false);
  });

  test("andere Sportart oder unbekannte Art → verschieden", () => {
    expect(isSameRunAcrossSources(apple({ workoutType: "cycling" }), strava())).toBe(false);
    expect(isSameRunAcrossSources(apple({ workoutType: "yoga" }), strava({ workoutType: "yoga" }))).toBe(false);
  });

  test("eine Seite ohne Distanz: Start reicht", () => {
    expect(isSameRunAcrossSources(apple({ distanceMeters: null, distanceUnknown: true }), strava())).toBe(true);
  });
});

describe("dedupeAppleHealthAndStravaRuns", () => {
  test("doppelte Quelle zählt einmal, Apple Health hat Vorrang und merkt sich die Strava-ID", () => {
    const out = dedupeAppleHealthAndStravaRuns([apple(), strava()]);
    expect(out).toHaveLength(1);
    expect(out[0].runId).toBe("hk_UUID-1");
    expect(out[0].mergedRunIds).toEqual(["strava:12000000001"]);
    // Keine Vermischung: Werte bleiben die von Apple Health.
    expect(out[0].distanceMeters).toBe(10000);
    expect(out[0].avgHeartRateBpm).toBe(150);
  });

  test("Reihenfolge egal (Strava zuerst)", () => {
    const out = dedupeAppleHealthAndStravaRuns([strava(), apple()]);
    expect(out.map((r) => r.runId)).toEqual(["hk_UUID-1"]);
  });

  test("ohne Treffer bleibt dieselbe Liste (Referenz) erhalten", () => {
    const list = [apple(), strava({ startDate: "2026-11-15T06:00:00.000Z" })];
    expect(dedupeAppleHealthAndStravaRuns(list)).toBe(list);
    const onlyApple = [apple(), apple({ runId: "hk_2", platformId: "2", startDate: "2026-11-14T06:00:00.000Z" })];
    expect(dedupeAppleHealthAndStravaRuns(onlyApple)).toBe(onlyApple);
  });

  test("zwei Strava-Läufe, ein Apple-Lauf: nur der nächstgelegene verschmilzt", () => {
    const near = strava({ runId: "strava:near", startDate: "2026-11-16T06:30:30.000Z" });
    const far = strava({ runId: "strava:far", startDate: "2026-11-16T06:34:00.000Z" });
    const out = dedupeAppleHealthAndStravaRuns([apple(), far, near]);
    expect(out.map((r) => r.runId).sort()).toEqual(["hk_UUID-1", "strava:far"]);
    expect(out.find((r) => r.runId === "hk_UUID-1")?.mergedRunIds).toEqual(["strava:near"]);
  });

  test("Strava allein (kein Apple Health, z. B. Garmin nur über Strava) bleibt", () => {
    const list = [strava()];
    expect(dedupeAppleHealthAndStravaRuns(list)).toEqual([strava()]);
  });
});

describe("an den Stellen, wo Läufe zusammengeführt werden", () => {
  // Strava-Läufe gelten lokal nur 7 Tage (dropExpiredLocalStravaRuns) – Uhr auf die Fixture-Daten.
  beforeEach(() => freezeTimeForTests(new Date("2026-11-16T12:00:00.000Z")));
  afterEach(() => freezeTimeForTests(null));

  test("mergeHealthRuns: Apple-Health-Lauf kommt zu einem vorhandenen Strava-Lauf → einmal, Apple Health", () => {
    const merged = mergeHealthRuns([strava()], [apple()]);
    expect(merged.map((r) => r.runId)).toEqual(["hk_UUID-1"]);
    expect(merged[0].mergedRunIds).toEqual(["strava:12000000001"]);
  });

  test("mergeHealthRuns: gleiche Startzeit und Dauer – Strava verliert trotz gleichem Score nicht die Alias-ID", () => {
    const s = strava({ startDate: apple().startDate, duration: apple().duration, distanceMeters: 10000 });
    const remoteApple = apple({ platformId: undefined });
    const merged = mergeHealthRuns([remoteApple], [s]);
    expect(merged).toHaveLength(1);
    expect(merged[0].runId).toBe("hk_UUID-1");
    expect(merged[0].mergedRunIds).toEqual(["strava:12000000001"]);
  });

  test("loadHealthRunsFromStorage dedupliziert gespeicherte Doppel", () => {
    const stored = JSON.stringify([apple(), strava()]);
    const runs = loadHealthRunsFromStorage(
      () => stored,
      (v, fb) => {
        try {
          return JSON.parse(v);
        } catch {
          return fb;
        }
      },
    );
    expect(runs.map((r) => r.runId)).toEqual(["hk_UUID-1"]);
  });

  test("replaceStravaRuns: ersetzt den Strava-Bestand (gelöschte fallen weg) und dedupliziert", () => {
    const stale = strava({ runId: "strava:old", startDate: "2026-11-01T06:00:00.000Z" });
    const next = replaceStravaRuns([apple(), stale], [strava(), strava({ runId: "strava:9", startDate: "2026-11-15T08:00:00.000Z" })]);
    expect(next.map((r) => r.runId)).toEqual(["strava:9", "hk_UUID-1"]);
    expect(replaceStravaRuns([apple(), stale], []).map((r) => r.runId)).toEqual(["hk_UUID-1"]);
  });
});

describe("HealthKit-Workout aus der Strava-App (hk_-ID, Quelle „Strava“) ist Apple Health", () => {
  beforeEach(() => freezeTimeForTests(new Date("2026-11-16T12:00:00.000Z")));
  afterEach(() => freezeTimeForTests(null));

  const watch = apple({ runId: "hk_WATCH", platformId: "WATCH", sourceName: "Apple Watch von Anton" });
  const fromStravaApp = apple({
    runId: "hk_STRAVA-APP",
    platformId: "STRAVA-APP",
    sourceName: "Strava",
    startDate: "2026-11-16T06:30:20.000Z",
    duration: 3080,
  });

  test("replaceStravaRuns behält es (kein Ersetzen durch den Import, kein 7-Tage-Aufräumen)", () => {
    expect(replaceStravaRuns([fromStravaApp], []).map((r) => r.runId)).toEqual(["hk_STRAVA-APP"]);
  });

  test("Watch + Strava-App-Kopie + Strava-Import zählen einmal (Dedup innerhalb HealthKit wie bisher)", () => {
    const merged = mergeHealthRuns([], [watch, fromStravaApp, strava()]);
    expect(merged).toHaveLength(1);
    expect(merged[0].runId.startsWith("hk_")).toBe(true);
    expect(merged.some((r) => r.runId.startsWith("strava:"))).toBe(false);
  });

  test("allein gegen den Import: Apple Health gewinnt", () => {
    const out = dedupeAppleHealthAndStravaRuns([strava(), fromStravaApp]);
    expect(out.map((r) => r.runId)).toEqual(["hk_STRAVA-APP"]);
    expect(out[0].mergedRunIds).toEqual(["strava:12000000001"]);
  });
});
