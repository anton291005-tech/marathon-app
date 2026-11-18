import { stripStravaDerivedLogFields } from "../lib/ai/getAiContext";
import { attachAssignedRun, detachAssignedRun } from "./detachAssignedRun";

const { stripStravaDerivedLogFields: stripOnServer } = require("../../api/_lib/coachHealthRunFields");

const evaluation = { status: "too_fast", label: "Zu schnell", feedback: "0,4 km über Plan, Pace 4:50", distanceDeltaKm: 0.4 };

describe("detachAssignedRun", () => {
  it("Strava-Lauf gelöst: Zuordnung, Auswertung, km und Dauer fallen weg; Haken, Gefühl und Notiz bleiben", () => {
    const log = {
      done: true,
      at: "2026-11-18T07:00:00.000Z",
      feeling: 4,
      rpe: 6,
      notes: "lief gut",
      actualKm: 10.4,
      durationMin: 50,
      assignedRun: { runId: "strava:123", distanceKm: 10.4, avgHeartRateBpm: 151 },
      runEvaluation: evaluation,
    };
    expect(detachAssignedRun(log)).toEqual({ done: true, at: "2026-11-18T07:00:00.000Z", feeling: 4, rpe: 6, notes: "lief gut" });
    // Eingabe bleibt unverändert
    expect(log.assignedRun.runId).toBe("strava:123");
  });

  it("Apple-Health-Lauf gelöst: Auswertung fällt weg, eigene km/Dauer bleiben", () => {
    const log = { done: true, actualKm: 12, durationMin: 61, assignedRun: { runId: "hk_abc" }, runEvaluation: evaluation };
    expect(detachAssignedRun(log)).toEqual({ done: true, actualKm: 12, durationMin: 61 });
  });

  it("Log ohne Zuordnung bleibt inhaltlich gleich", () => {
    expect(detachAssignedRun({ done: true, notes: "x" })).toEqual({ done: true, notes: "x" });
  });

  it("nach dem Lösen geht keine Strava-Auswertung mehr an den Coach (Client- und Server-Filter)", () => {
    const assigned = { done: true, at: "t", assignedRun: { runId: "strava:9" }, runEvaluation: evaluation, actualKm: 10.4 };
    // Der alte Zustand nach dem Lösen: nur `assignedRun` fehlte — die Filter ließen die Auswertung durch.
    const leaked = { done: true, at: "t", runEvaluation: evaluation, actualKm: 10.4 };
    expect(stripStravaDerivedLogFields(leaked)).toHaveProperty("runEvaluation");
    const detached = detachAssignedRun(assigned);
    for (const out of [stripStravaDerivedLogFields(detached), stripOnServer({ sessionId: "s", log: detached }).log]) {
      expect(out).toEqual({ done: true, at: "t" });
      expect(JSON.stringify(out)).not.toMatch(/too_fast|über Plan|10\.4/);
    }
  });
});

describe("attachAssignedRun (Zuordnung ersetzen)", () => {
  const coachViews = (log: unknown) => [stripStravaDerivedLogFields(log), stripOnServer({ sessionId: "s", log }).log];

  it("Strava-Zuordnung durch einen Apple-Health-Lauf ersetzt: keine Strava-Auswertung unter der neuen ID", () => {
    const before = { done: true, at: "t", actualKm: 10.4, durationMin: 50, assignedRun: { runId: "strava:9" }, runEvaluation: evaluation };
    const after = attachAssignedRun(before, { runId: "hk_1", distanceKm: 10.1 });
    expect(after).toEqual({ done: true, at: "t", suggestedHealthRunId: undefined, assignedRun: { runId: "hk_1", distanceKm: 10.1 } });
    for (const out of coachViews(after)) expect(JSON.stringify(out)).not.toMatch(/too_fast|über Plan|10\.4/);
  });

  it("Strava-Vorschlag verworfen, anderer Lauf zugeordnet: die Auswertung des Vorschlags fällt weg", () => {
    const before = { suggestedHealthRunId: "strava:9", runEvaluation: evaluation };
    const after = attachAssignedRun(before, { runId: "hk_1" });
    expect(after).not.toHaveProperty("runEvaluation");
    expect(after.suggestedHealthRunId).toBeUndefined();
    for (const out of coachViews(after)) expect(JSON.stringify(out)).not.toMatch(/too_fast|über Plan/);
  });

  it("der vorgeschlagene Lauf selbst wird übernommen: seine Auswertung bleibt", () => {
    const after = attachAssignedRun({ suggestedHealthRunId: "hk_1", runEvaluation: evaluation, notes: "x" }, { runId: "hk_1" });
    expect(after).toMatchObject({ runEvaluation: evaluation, notes: "x", assignedRun: { runId: "hk_1" } });
  });

  it("derselbe Lauf erneut zugeordnet: nichts geht verloren", () => {
    const before = { done: true, actualKm: 12, assignedRun: { runId: "hk_1" }, runEvaluation: evaluation };
    expect(attachAssignedRun(before, { runId: "hk_1" })).toMatchObject({ done: true, actualKm: 12, runEvaluation: evaluation });
  });

  it("leeres Log: nur die Zuordnung", () => {
    expect(attachAssignedRun({}, { runId: "hk_2" })).toEqual({ suggestedHealthRunId: undefined, assignedRun: { runId: "hk_2" } });
  });
});
