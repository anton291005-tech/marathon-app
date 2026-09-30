import type { PrepRecapStats } from "./buildPrepRecapSnapshot";
import { ensurePrepRecapSnapshot, savePrepRecapFinishTime, type PrepRecapStore } from "./ensurePrepRecapSnapshot";
import { applyPrepRecapUpdate, decidePrepRecapAction, type PrepRecapRecord } from "./prepRecapRecord";

const RACE_DATE = "2026-09-27";
const detected = { seconds: 11637, distanceKm: 42.63, source: "health" as const };

function stats(tag: string, schemaVersion = 1): PrepRecapStats {
  return {
    schemaVersion,
    race: { name: tag, ymd: RACE_DATE, distanceKm: 42.195, goalSeconds: 10190, completedBy: "race_done" },
    weeks: null,
    volume: null,
    sessions: null,
    streak: null,
    longRuns: null,
    quality: null,
    strongestWeek: null,
    phases: null,
    body: null,
  };
}

function record(overrides: Partial<PrepRecapRecord> = {}): PrepRecapRecord {
  return {
    id: "row-1",
    planId: "plan-1",
    raceName: "Warschau Marathon",
    raceDate: RACE_DATE,
    finishTimeSeconds: null,
    finishTimeSource: null,
    finishTimeConfirmed: false,
    schemaVersion: 1,
    stats: stats("alt"),
    ...overrides,
  };
}

describe("decidePrepRecapAction", () => {
  const base = { planId: "plan-1", raceName: "Warschau Marathon", raceDate: RACE_DATE, currentSchemaVersion: 1 };

  it("legt ohne Snapshot einen an — Health-Zeit nur unbestätigt", () => {
    const build = jest.fn(() => stats("neu"));
    const action = decidePrepRecapAction({ ...base, existing: null, buildStats: build, detectedFinish: detected });
    expect(action).toEqual({
      kind: "create",
      record: expect.objectContaining({
        finishTimeSeconds: 11637,
        finishTimeSource: "health",
        finishTimeConfirmed: false,
        schemaVersion: 1,
        stats: stats("neu"),
      }),
    });
    expect(build).toHaveBeenCalledTimes(1);
  });

  it("legt ohne erkannte Zeit einen Snapshot ohne Zeit an", () => {
    const action = decidePrepRecapAction({ ...base, existing: null, buildStats: () => stats("neu"), detectedFinish: null });
    expect(action.kind === "create" && action.record).toMatchObject({
      finishTimeSeconds: null,
      finishTimeSource: null,
      finishTimeConfirmed: false,
    });
  });

  it("tut nichts bei aktuellem Snapshot mit Zeit — baut die Stats nicht neu", () => {
    const build = jest.fn(() => stats("neu"));
    const existing = record({ finishTimeSeconds: 11600, finishTimeSource: "manual", finishTimeConfirmed: true });
    expect(decidePrepRecapAction({ ...base, existing, buildStats: build, detectedFinish: detected })).toEqual({ kind: "none" });
    expect(build).not.toHaveBeenCalled();
  });

  it("K3a: baut bei älterer schemaVersion nur die Stats neu, Zeitfelder bleiben", () => {
    const existing = record({ schemaVersion: 1, finishTimeSeconds: 11600, finishTimeSource: "manual", finishTimeConfirmed: true });
    const action = decidePrepRecapAction({
      ...base,
      currentSchemaVersion: 2,
      existing,
      buildStats: () => stats("v2", 2),
      detectedFinish: detected,
    });
    expect(action).toEqual({ kind: "update", stats: stats("v2", 2), finish: null });
    if (action.kind !== "update") throw new Error("expected update");
    expect(applyPrepRecapUpdate(existing, action, 2)).toMatchObject({
      schemaVersion: 2,
      stats: stats("v2", 2),
      finishTimeSeconds: 11600,
      finishTimeSource: "manual",
      finishTimeConfirmed: true,
    });
  });

  it("K3b: trägt eine später erkannte Health-Zeit unbestätigt nach", () => {
    const action = decidePrepRecapAction({ ...base, existing: record(), buildStats: () => stats("x"), detectedFinish: detected });
    expect(action).toEqual({ kind: "update", stats: null, finish: { seconds: 11637, source: "health", confirmed: false } });
  });

  it("K3b: überschreibt eine vorhandene (auch unbestätigte) Zeit nie", () => {
    const existing = record({ finishTimeSeconds: 11700, finishTimeSource: "health", finishTimeConfirmed: false });
    expect(decidePrepRecapAction({ ...base, existing, buildStats: () => stats("x"), detectedFinish: detected })).toEqual({
      kind: "none",
    });
  });
});

function memoryStore(initialRemote: PrepRecapRecord[] | null, initialCache: Record<string, PrepRecapRecord> = {}) {
  let remote = initialRemote ? [...initialRemote] : null;
  let cache = { ...initialCache };
  const store: PrepRecapStore & { remote: () => PrepRecapRecord[] | null; cache: () => Record<string, PrepRecapRecord> } = {
    loadRemote: jest.fn(async () => (remote ? [...remote] : null)),
    insertRemote: jest.fn(async (r: PrepRecapRecord) => {
      if (!remote) return null;
      const found = remote.find((x) => x.raceDate === r.raceDate);
      if (found) return found;
      const stored = { ...r, id: "row-new" };
      remote.push(stored);
      return stored;
    }),
    updateRemoteStats: jest.fn(async (raceDate, s, schemaVersion) => {
      if (!remote) return false;
      remote = remote.map((x) => (x.raceDate === raceDate ? { ...x, stats: s, schemaVersion } : x));
      return true;
    }),
    updateRemoteFinish: jest.fn(async (raceDate, finish, opts) => {
      if (!remote) return false;
      remote = remote.map((x) =>
        x.raceDate === raceDate && (!opts.onlyIfEmpty || x.finishTimeSeconds == null)
          ? { ...x, finishTimeSeconds: finish.seconds, finishTimeSource: finish.source, finishTimeConfirmed: finish.confirmed }
          : x,
      );
      return true;
    }),
    readCache: () => cache,
    writeCache: (c) => {
      cache = c;
    },
    remote: () => remote,
    cache: () => cache,
  };
  return store;
}

const common = { planId: "plan-1", raceName: "Warschau Marathon", raceDate: RACE_DATE, currentSchemaVersion: 1 };

describe("ensurePrepRecapSnapshot", () => {
  it("legt beim ersten Öffnen genau einen Snapshot an und cached ihn", async () => {
    const store = memoryStore([]);
    const build = jest.fn(() => stats("neu"));
    const result = await ensurePrepRecapSnapshot({ ...common, store, buildStats: build, detectedFinish: detected });
    expect(result).toMatchObject({ id: "row-new", finishTimeSeconds: 11637, finishTimeConfirmed: false });
    expect(store.remote()).toHaveLength(1);
    expect(store.cache()[RACE_DATE]).toEqual(result);
  });

  it("ist idempotent — zweiter Aufruf baut nicht neu und legt keine zweite Zeile an", async () => {
    const store = memoryStore([]);
    await ensurePrepRecapSnapshot({ ...common, store, buildStats: () => stats("erst"), detectedFinish: detected });
    const build = jest.fn(() => stats("zweit"));
    const second = await ensurePrepRecapSnapshot({ ...common, store, buildStats: build, detectedFinish: detected });
    expect(build).not.toHaveBeenCalled();
    expect(second.stats).toEqual(stats("erst"));
    expect(store.remote()).toHaveLength(1);
    expect(store.insertRemote).toHaveBeenCalledTimes(1);
  });

  it("K3a: Schema-Upgrade überschreibt Stats remote, Zeit bleibt", async () => {
    const existing = record({ finishTimeSeconds: 11600, finishTimeSource: "manual", finishTimeConfirmed: true });
    const store = memoryStore([existing]);
    const result = await ensurePrepRecapSnapshot({
      ...common,
      currentSchemaVersion: 2,
      store,
      buildStats: () => stats("v2", 2),
      detectedFinish: detected,
    });
    expect(result).toMatchObject({ schemaVersion: 2, finishTimeSeconds: 11600, finishTimeConfirmed: true });
    expect(store.remote()?.[0]).toMatchObject({ schemaVersion: 2, stats: stats("v2", 2), finishTimeSeconds: 11600 });
    expect(store.updateRemoteFinish).not.toHaveBeenCalled();
  });

  it("K3b: Nachtrag schreibt remote nur, wenn dort noch keine Zeit steht", async () => {
    const store = memoryStore([record()]);
    const result = await ensurePrepRecapSnapshot({ ...common, store, buildStats: () => stats("x"), detectedFinish: detected });
    expect(result).toMatchObject({ finishTimeSeconds: 11637, finishTimeSource: "health", finishTimeConfirmed: false });
    expect(store.updateRemoteFinish).toHaveBeenCalledWith(
      RACE_DATE,
      { seconds: 11637, source: "health", confirmed: false },
      { onlyIfEmpty: true },
    );
  });

  it("offline: legt lokal an und reicht genau diesen Snapshot später nach", async () => {
    const offline = memoryStore(null);
    const local = await ensurePrepRecapSnapshot({ ...common, store: offline, buildStats: () => stats("offline"), detectedFinish: null });
    expect(local.stats).toEqual(stats("offline"));

    const online = memoryStore([], offline.cache());
    const build = jest.fn(() => stats("später"));
    const synced = await ensurePrepRecapSnapshot({ ...common, store: online, buildStats: build, detectedFinish: null });
    expect(build).not.toHaveBeenCalled();
    expect(synced.stats).toEqual(stats("offline"));
    expect(online.remote()).toHaveLength(1);
  });

  it("offline: Schema-Upgrade nur lokal, ohne Remote-Schreibversuche, Zeit bleibt", async () => {
    const cached = record({ finishTimeSeconds: 11600, finishTimeSource: "manual", finishTimeConfirmed: true });
    const store = memoryStore(null, { [RACE_DATE]: cached });
    const result = await ensurePrepRecapSnapshot({
      ...common,
      currentSchemaVersion: 2,
      store,
      buildStats: () => stats("v2", 2),
      detectedFinish: detected,
    });
    expect(result).toMatchObject({ schemaVersion: 2, stats: stats("v2", 2), finishTimeSeconds: 11600, finishTimeConfirmed: true });
    expect(store.updateRemoteStats).not.toHaveBeenCalled();
    expect(store.updateRemoteFinish).not.toHaveBeenCalled();
    expect(store.cache()[RACE_DATE]).toEqual(result);
  });

  it("offline bestätigte Zeit gewinnt gegen einen unbestätigten Remote-Stand", async () => {
    const cached = record({ finishTimeSeconds: 11500, finishTimeSource: "manual", finishTimeConfirmed: true });
    const store = memoryStore([record({ finishTimeSeconds: 11637, finishTimeSource: "health" })], { [RACE_DATE]: cached });
    const result = await ensurePrepRecapSnapshot({ ...common, store, buildStats: () => stats("x"), detectedFinish: detected });
    expect(result).toMatchObject({ finishTimeSeconds: 11500, finishTimeSource: "manual", finishTimeConfirmed: true });
    expect(store.remote()?.[0]).toMatchObject({ finishTimeSeconds: 11500, finishTimeConfirmed: true });
  });

  it("eine remote bereits bestätigte Zeit gewinnt gegen den Cache", async () => {
    const cached = record({ finishTimeSeconds: 11500, finishTimeSource: "manual", finishTimeConfirmed: true });
    const store = memoryStore([record({ finishTimeSeconds: 11637, finishTimeSource: "health", finishTimeConfirmed: true })], {
      [RACE_DATE]: cached,
    });
    const result = await ensurePrepRecapSnapshot({ ...common, store, buildStats: () => stats("x"), detectedFinish: null });
    expect(result).toMatchObject({ finishTimeSeconds: 11637, finishTimeConfirmed: true });
  });
});

describe("savePrepRecapFinishTime", () => {
  it("überschreibt bei bewusster Nutzereingabe immer und cached", async () => {
    const existing = record({ finishTimeSeconds: 11637, finishTimeSource: "health", finishTimeConfirmed: false });
    const store = memoryStore([existing]);
    const next = await savePrepRecapFinishTime({
      store,
      record: existing,
      finish: { seconds: 11590, source: "manual", confirmed: true },
    });
    expect(next).toMatchObject({ finishTimeSeconds: 11590, finishTimeSource: "manual", finishTimeConfirmed: true });
    expect(store.updateRemoteFinish).toHaveBeenCalledWith(RACE_DATE, { seconds: 11590, source: "manual", confirmed: true }, {});
    expect(store.cache()[RACE_DATE]).toEqual(next);
  });
});
