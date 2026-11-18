import { stripStravaDerivedLogFields } from "../lib/ai/getAiContext";
import { detachAssignedRun } from "./detachAssignedRun";

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
