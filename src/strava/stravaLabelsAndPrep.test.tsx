/**
 * Prüfungs-Nachbesserung W2: Strava-Herkunft an Zielzeit-Vorschlag, Coach-Kontext und Beschriftungen;
 * lokale Strava-Läufe nur 7 Tage und nur mit Verbindung.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { freezeTimeForTests } from "../core/time/timeSystem";
import type { StoredHealthRun } from "../healthRuns";
import type { PlanSession, PlanWeek } from "../marathonPrediction";
import { detectRaceFinishTime } from "../prepRecap/detectRaceFinishTime";
import { getPrepCompletionState } from "../prepRecap/prepCompletionState";
import { finishTimeSourceNote } from "../prepRecap/raceResultPresentation";
import { buildCoachPrepStatus } from "../lib/ai/coachPrepStatus";
import FinishTimeInputStep from "../components/prepRecap/FinishTimeInputStep";
import { buildRecapSlides } from "../components/prepRecap/buildRecapSlides";
import { SessionEntrySheet } from "../features/session/SessionEntrySheet";
import { buildHealthRunSuggestion } from "../features/session/sessionDetailModel";
import { StravaRunAttribution } from "../features/strava/StravaRunAttribution";
import { dropExpiredLocalStravaRuns, replaceStravaRuns } from "./crossSourceRunDedup";
import { selectRunsForAutoAssignment } from "./stravaRunSource";
import { decidePrepRecapAction } from "../prepRecap/prepRecapRecord";
import { resolvePrepFinishDisplay } from "../prepRecap/resolvePrepFinishDisplay";
import PrepRecapExperience from "../components/prepRecap/PrepRecapExperience";
import PrepCompleteHeroCard from "../components/prepRecap/PrepCompleteHeroCard";
import { fullRecapStats, recapRecord } from "../components/prepRecap/recapTestFixtures";

jest.mock("../native/haptics", () => ({
  hapticImpactLight: jest.fn().mockResolvedValue(undefined),
  hapticSuccess: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("../components/prepRecap/celebration", () => ({
  launchCelebration: () => ({ done: new Promise(() => {}), cancel: () => {} }),
}));

const raceSession = {
  id: "w25-so",
  day: "So",
  date: "27. Sep",
  dateIso: "2026-09-27",
  type: "race",
  title: "WARSCHAU MARATHON",
  km: 42.2,
} as PlanSession;

function run(partial: Partial<StoredHealthRun>): StoredHealthRun {
  return {
    runId: "hk_x",
    // Lokale Uhrzeit am 27.09. – unabhängig von der Zeitzone der Testumgebung.
    startDate: new Date(2026, 8, 27, 9, 0, 19).toISOString(),
    duration: 11637,
    distanceMeters: 42629,
    distanceUnknown: false,
    workoutType: "running",
    ...partial,
  } as StoredHealthRun;
}

describe("Zielzeit-Vorschlag aus Strava", () => {
  test("detectRaceFinishTime: Herkunft strava aus zugeordnetem Lauf oder Renntag-Lauf, Apple Health ohne origin", () => {
    const fromLog = detectRaceFinishTime({
      raceSession,
      raceYmd: "2026-09-27",
      raceLog: {
        done: true,
        assignedRun: { runId: "strava:77", startDate: "2026-09-27T07:00:19Z", duration: 11637, distanceKm: 42.63 },
      } as any,
      healthRuns: [],
    });
    expect(fromLog).toEqual({ seconds: 11637, distanceKm: 42.63, source: "health", origin: "strava" });
    const fromRuns = detectRaceFinishTime({
      raceSession,
      raceYmd: "2026-09-27",
      raceLog: undefined,
      healthRuns: [run({ runId: "strava:78" })],
    });
    expect(fromRuns?.origin).toBe("strava");
    const apple = detectRaceFinishTime({ raceSession, raceYmd: "2026-09-27", raceLog: undefined, healthRuns: [run({})] });
    expect(apple).toEqual({ seconds: 11637, distanceKm: 42.629, source: "health" });
  });

  test("Hinweis „laut Strava“ statt „laut Apple Health“", () => {
    expect(finishTimeSourceNote({ seconds: 1, confirmed: false, origin: "strava" })).toBe("laut Strava");
    expect(finishTimeSourceNote({ seconds: 1, confirmed: false })).toBe("laut Apple Health");
    expect(finishTimeSourceNote({ seconds: 1, confirmed: true, origin: "strava" })).toBeNull();
  });

  test("FinishTimeInputStep: „Laut Strava: …“", () => {
    render(
      <FinishTimeInputStep
        raceName="Warschau Marathon"
        current={{ seconds: 11637, source: "health", confirmed: false }}
        dismissLabel="Überspringen"
        onSubmit={jest.fn()}
        onDismiss={jest.fn()}
        suggestionOrigin="strava"
      />,
    );
    expect(screen.getByText("Laut Strava: 3:13:57 — stimmt das?")).toBeInTheDocument();
    expect(screen.getByAltText("Powered by Strava")).toBeInTheDocument();
  });

  test("Rückblick-Slides tragen die Herkunft", () => {
    const stats = {
      race: { completedBy: "race_done", ymd: "2026-09-27", name: "Warschau", distanceKm: 42.195, goalSeconds: null },
    } as any;
    const slides = buildRecapSlides({
      stats,
      raceName: "Warschau",
      finishSeconds: 11637,
      finishConfirmed: false,
      finishOrigin: "strava",
      todayYmd: "2026-11-16",
    });
    expect(JSON.stringify(slides)).toContain("laut Strava");
    expect(JSON.stringify(slides)).not.toContain("laut Apple Health");
    // Logo-Kennzeichnung an Rennen- und Outro-Slide.
    expect(slides.filter((sl) => sl.attribution === "strava").map((sl) => sl.id)).toEqual(["race", "outro"]);
    const apple = buildRecapSlides({ stats, raceName: "Warschau", finishSeconds: 11637, finishConfirmed: false, todayYmd: "2026-11-16" });
    expect(apple.some((sl) => sl.attribution)).toBe(false);
  });

  test("Rückblick-Datensatz speichert einen Strava-Vorschlag nie (Policy §6.2/§5.3)", () => {
    const strava = { seconds: 11637, distanceKm: 42.63, source: "health" as const, origin: "strava" as const };
    const created = decidePrepRecapAction({
      existing: null,
      buildStats: () => fullRecapStats(),
      detectedFinish: strava,
      planId: "p",
      raceName: "Warschau",
      raceDate: "2026-09-27",
    });
    expect(created.kind).toBe("create");
    expect(created.kind === "create" && created.record).toMatchObject({
      finishTimeSeconds: null,
      finishTimeSource: null,
      finishTimeConfirmed: false,
    });
    const existing = recapRecord({ finishTimeSeconds: null, finishTimeSource: null, finishTimeConfirmed: false });
    expect(
      decidePrepRecapAction({ existing, buildStats: () => fullRecapStats(), detectedFinish: strava, planId: "p", raceName: null, raceDate: "2026-09-27" }),
    ).toEqual({ kind: "none" });
    // Apple Health wird wie bisher als Vorschlag übernommen.
    const fromApple = decidePrepRecapAction({
      existing: null,
      buildStats: () => fullRecapStats(),
      detectedFinish: { seconds: 11637, distanceKm: 42.63, source: "health" },
      planId: "p",
      raceName: null,
      raceDate: "2026-09-27",
    });
    expect(fromApple.kind === "create" && fromApple.record.finishTimeSeconds).toBe(11637);
  });

  test("Datensatz vorhanden, Strava-Lauf weg, keine Zuordnung am Rennen → keine Zeit, kein „laut Apple Health“, nichts an den Coach", () => {
    // Datensatz entstand, als der Strava-Lauf noch da war → ohne Zeit gespeichert.
    const created = decidePrepRecapAction({
      existing: null,
      buildStats: () => fullRecapStats(),
      detectedFinish: { seconds: 11637, distanceKm: 42.63, source: "health", origin: "strava" },
      planId: "p",
      raceName: "Warschau Marathon",
      raceDate: "2026-09-27",
    });
    if (created.kind !== "create") throw new Error("expected create");
    const record = created.record;
    expect(record.finishTimeSeconds).toBeNull();
    // Später: Strava-Lauf weg (Trennen / 7 Tage), Rennen ohne Zuordnung → nichts erkannt.
    const display = resolvePrepFinishDisplay({ record, raceYmd: "2026-09-27", detected: null });
    expect(display).toBeNull();

    const plan = [
      { wn: 12, s: [{ id: "w12-so", type: "race", title: "WARSCHAU MARATHON", km: 42.2, date: "27. Sep", dateIso: "2026-09-27" }] },
    ] as unknown as PlanWeek[];
    const completion = getPrepCompletionState({
      plan,
      logs: { "w12-so": { done: true } } as any,
      todayYmd: "2026-09-29",
      preferences: { raceDate: "27.09.2026" } as any,
    });
    const status = buildCoachPrepStatus({ completion, finish: display, goalSeconds: null, raceDistanceKm: 42.195, todayYmd: "2026-09-29" });
    expect(status?.result).toMatchObject({ finishTime: null, finishTimeSeconds: null, pacePerKm: null });

    render(<PrepCompleteHeroCard raceName="Warschau Marathon" raceYmd="2026-09-27" goalSeconds={null} finish={display} raceDistanceKm={42.195} />);
    expect(screen.queryByText(/laut Apple Health/)).toBeNull();
  });

  test("gespeicherter unbestätigter Apple-Health-Vorschlag geht mit Herkunft apple_health weiter", () => {
    const record = recapRecord({ finishTimeSeconds: 11500, finishTimeSource: "health", finishTimeConfirmed: false });
    expect(resolvePrepFinishDisplay({ record, raceYmd: "2026-09-27", detected: null })).toEqual({
      seconds: 11500,
      confirmed: false,
      origin: "apple_health",
    });
    expect(
      resolvePrepFinishDisplay({ record: { ...record, finishTimeConfirmed: true }, raceYmd: "2026-09-27", detected: null }),
    ).toEqual({ seconds: 11500, confirmed: true });
  });

  test("solange der Strava-Lauf da ist: live „laut Strava“ + Logo, Datensatz bleibt leer", () => {
    const record = recapRecord({ finishTimeSeconds: null, finishTimeSource: null, finishTimeConfirmed: false });
    const display = resolvePrepFinishDisplay({
      record,
      raceYmd: "2026-09-27",
      detected: { seconds: 11637, distanceKm: 42.63, source: "health", origin: "strava" },
    });
    expect(display).toEqual({ seconds: 11637, confirmed: false, origin: "strava" });
    render(<PrepCompleteHeroCard raceName="Warschau Marathon" raceYmd="2026-09-27" goalSeconds={null} finish={display} raceDistanceKm={42.195} />);
    expect(screen.getByText(/laut Strava/)).toBeInTheDocument();
    expect(screen.getByAltText("Powered by Strava")).toBeInTheDocument();
  });

  test("Rückblick: Strava-Vorschlag bestätigen speichert die Zeit als eigene Angabe", async () => {
    const onSaveFinish = jest.fn().mockResolvedValue(undefined);
    render(
      <PrepRecapExperience
        record={recapRecord({ finishTimeSeconds: null, finishTimeSource: null, finishTimeConfirmed: false })}
        entry="story"
        onSaveFinish={onSaveFinish}
        onClose={jest.fn()}
        stravaSuggestion={{ seconds: 11637 }}
      />,
    );
    expect(screen.getByText("Laut Strava: 3:13:57 — stimmt das?")).toBeInTheDocument();
    expect(screen.getByAltText("Powered by Strava")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Stimmt" }));
    await waitFor(() => expect(onSaveFinish).toHaveBeenCalledWith({ seconds: 11637, source: "manual", confirmed: true }));
  });

  test("Rückblick: Datensatz mit eigener Zeit ignoriert den Strava-Vorschlag", () => {
    render(
      <PrepRecapExperience
        record={recapRecord({ finishTimeSeconds: 11500, finishTimeSource: "health", finishTimeConfirmed: false })}
        entry="story"
        onSaveFinish={jest.fn()}
        onClose={jest.fn()}
        stravaSuggestion={{ seconds: 11637 }}
      />,
    );
    expect(screen.getByText(/Laut Apple Health: 3:11:40/)).toBeInTheDocument();
    expect(screen.queryByAltText("Powered by Strava")).toBeNull();
  });

  test("Coach: unbestätigte Strava-Zeit fehlt im prepStatus, bestätigte bleibt", () => {
    const plan = [
      { wn: 12, s: [{ id: "w12-so", type: "race", title: "WARSCHAU MARATHON", km: 42.2, date: "27. Sep", dateIso: "2026-09-27" }] },
    ] as unknown as PlanWeek[];
    const completion = getPrepCompletionState({
      plan,
      logs: { "w12-so": { done: true } } as any,
      todayYmd: "2026-09-29",
      preferences: { raceDate: "27.09.2026" } as any,
    });
    const build = (finish: any) =>
      buildCoachPrepStatus({ completion, finish, goalSeconds: null, raceDistanceKm: 42.195, todayYmd: "2026-09-29" });
    const strava = build({ seconds: 11637, confirmed: false, origin: "strava" });
    expect(strava?.status).toBe("completed");
    expect(strava?.result).toMatchObject({ finishTime: null, finishTimeSeconds: null, pacePerKm: null });
    expect(JSON.stringify(strava)).not.toContain("3:13:57");
    expect(build({ seconds: 11637, confirmed: true, origin: "strava" })?.result.finishTimeSeconds).toBe(11637);
    // Whitelist: unbestätigt nur mit Herkunft Apple Health; unbekannte Herkunft geht nicht mit.
    expect(build({ seconds: 11637, confirmed: false, origin: "apple_health" })?.result.finishTimeSeconds).toBe(11637);
    expect(build({ seconds: 11637, confirmed: false })?.result.finishTimeSeconds).toBeNull();
  });
});

describe("Beschriftung von Strava-Läufen", () => {
  test("Vorschlag im Eintragen-Sheet: „Lauf aus Strava“ + Powered by Strava", () => {
    const suggestion = buildHealthRunSuggestion(
      { runId: "strava:9", startDate: "2026-11-16T07:00:00.000Z", duration: 3000, distanceMeters: 10000 },
      new Date("2026-11-16T12:00:00.000Z"),
    );
    expect(suggestion.source).toBe("strava");
    render(
      <SessionEntrySheet
        mode="create"
        subtitle="Lauf"
        initialKm={10}
        initialFeeling={null}
        initialNotes=""
        suggestion={suggestion}
        onSave={jest.fn()}
        onClose={jest.fn()}
      />,
    );
    expect(screen.getByText("Lauf aus Strava")).toBeInTheDocument();
    expect(screen.getByAltText("Powered by Strava")).toBeInTheDocument();
    expect(screen.queryByText("Lauf aus Apple Health")).toBeNull();
  });

  test("Apple-Health-Vorschlag unverändert", () => {
    const suggestion = buildHealthRunSuggestion(
      { runId: "hk_1", startDate: "2026-11-16T07:00:00.000Z", duration: 3000, distanceMeters: 10000 },
      new Date("2026-11-16T12:00:00.000Z"),
    );
    expect(suggestion).not.toHaveProperty("source");
  });

  test("Liste in Einstellungen → Zuordnung: Strava-Lauf mit Quelle + Logo, Apple Health ohne", () => {
    const { rerender } = render(<StravaRunAttribution runId="strava:1" />);
    expect(screen.getByText("Quelle: Strava")).toBeInTheDocument();
    expect(screen.getByAltText("Powered by Strava")).toBeInTheDocument();
    rerender(<StravaRunAttribution runId="hk_1" />);
    expect(screen.queryByTestId("strava-run-attribution")).toBeNull();
  });
});

describe("Lokale Strava-Läufe: 7 Tage und nur mit Verbindung", () => {
  const NOW = Date.parse("2026-11-16T12:00:00.000Z");
  const fresh = run({ runId: "strava:fresh", startDate: "2026-11-12T07:00:00.000Z" });
  const old = run({ runId: "strava:old", startDate: "2026-11-08T07:00:00.000Z" });
  const appleOld = run({ runId: "hk_old", startDate: "2026-10-01T07:00:00.000Z" });

  afterEach(() => freezeTimeForTests(null));

  test("dropExpiredLocalStravaRuns: Strava-Läufe mit Start > 7 Tage fallen weg, Apple Health bleibt", () => {
    expect(dropExpiredLocalStravaRuns([fresh, old, appleOld], NOW).map((r) => r.runId)).toEqual(["strava:fresh", "hk_old"]);
    const list = [fresh, appleOld];
    expect(dropExpiredLocalStravaRuns(list, NOW)).toBe(list);
  });

  test("replaceStravaRuns verwirft alte Strava-Läufe auch direkt nach dem Import", () => {
    freezeTimeForTests(new Date(NOW));
    expect(replaceStravaRuns([appleOld], [fresh, old]).map((r) => r.runId)).toEqual(["hk_old", "strava:fresh"]);
  });

  test("selectRunsForAutoAssignment: Strava-Läufe nur bei bestätigter Verbindung", () => {
    const runs = [fresh, appleOld];
    expect(selectRunsForAutoAssignment(runs, true)).toBe(runs);
    expect(selectRunsForAutoAssignment(runs, false).map((r) => r.runId)).toEqual(["hk_old"]);
    expect(selectRunsForAutoAssignment(runs, null).map((r) => r.runId)).toEqual(["hk_old"]);
    const appleOnly = [appleOld];
    expect(selectRunsForAutoAssignment(appleOnly, false)).toBe(appleOnly);
  });
});
