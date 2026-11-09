// Auswertung nach dem Training zeigt dieselbe Zone wie die Trainingsziel-Karte (Plan-Kern Schritt 11):
// `kind` aus dem Plan-Kern und `easy` in Entlastungswochen.

import { getPostWorkoutPlannedHr, getSessionHrZoneShort, isRecoveryPlanWeek } from "./sessionPlanTargets";
import { plannedHrRangeForSessionType } from "./hrZones";
import { buildLogOnlyConclusion } from "../hooks/usePostWorkoutSummary";
import { RECOVERY_WEEK_FOCUS_DE } from "../planCore";
import type { CoreKind } from "../planCore";
import type { PlanSession, PlanWeek } from "../marathonPrediction";

const CASES: Array<[string, CoreKind | undefined]> = [
  ["easy", "REC"],
  ["easy", "E"],
  ["easy", "MLR"],
  ["long", "LR"],
  ["long", "LR+M"],
  ["tempo", "M"],
  ["tempo", "T"],
  ["interval", "I"],
  ["interval", "R"],
  ["easy", undefined],
  ["long", undefined],
  ["tempo", undefined],
  ["interval", undefined],
];

const recoveryWeek = { wn: 4, phase: "base", km: 30, focus: RECOVERY_WEEK_FOCUS_DE, isRecoveryWeek: true, s: [] } as unknown as PlanWeek;
const normalWeek = { wn: 3, phase: "base", km: 36, focus: "Aerobe Basis aufbauen", s: [] } as unknown as PlanWeek;

describe("Zone in der Auswertung = Zone auf der Karte", () => {
  it("erkennt die Entlastungswoche des Plan-Kerns am Flag, nicht am Fokus-Text", () => {
    expect(isRecoveryPlanWeek(recoveryWeek)).toBe(true);
    expect(isRecoveryPlanWeek(normalWeek)).toBe(false);
    // Text allein reicht nicht mehr: Altpläne bekommen das Flag beim Einlesen (normalizeTrainingPlan).
    expect(isRecoveryPlanWeek({ ...recoveryWeek, isRecoveryWeek: undefined })).toBe(false);
    expect(isRecoveryPlanWeek(undefined)).toBe(false);
  });

  test.each(CASES)("%s / kind %s, mit und ohne Entlastungswoche", (type, kind) => {
    const session = { type, kind } as PlanSession;
    [
      [normalWeek, false],
      [recoveryWeek, true],
    ].forEach(([week, recovery]) => {
      const card = getSessionHrZoneShort(session, week as PlanWeek);
      const post = getPostWorkoutPlannedHr({ type, kind }, 190, { recoveryWeek: recovery as boolean });
      expect(post.hrZoneLabel).toBe(card);
    });
  });

  it("konkrete Zonen: REC Zone 1, M Zone 3, T Zone 4, E in der Entlastungswoche Zone 1", () => {
    expect(getPostWorkoutPlannedHr({ type: "easy", kind: "REC" }, 190).hrZoneLabel).toBe("Zone 1");
    expect(getPostWorkoutPlannedHr({ type: "tempo", kind: "M" }, 190).hrZoneLabel).toBe("Zone 3");
    expect(getPostWorkoutPlannedHr({ type: "tempo", kind: "T" }, 190).hrZoneLabel).toBe("Zone 4");
    expect(getPostWorkoutPlannedHr({ type: "easy", kind: "E" }, 190).hrZoneLabel).toBe("Zone 2");
    expect(getPostWorkoutPlannedHr({ type: "easy", kind: "E" }, 190, { recoveryWeek: true }).hrZoneLabel).toBe("Zone 1");
    expect(getPostWorkoutPlannedHr({ type: "easy" }, 190, { recoveryWeek: true }).hrZoneLabel).toBe("Zone 1");
  });

  it("bpm-Spanne folgt derselben Zone; ohne kind und ohne Entlastung wie bisher", () => {
    expect(getPostWorkoutPlannedHr({ type: "tempo", kind: "M" }, 190).hrBpm).toEqual(plannedHrRangeForSessionType("tempo", 190, "M"));
    expect(plannedHrRangeForSessionType("tempo", 190, "M")).not.toEqual(plannedHrRangeForSessionType("tempo", 190, "T"));
    expect(plannedHrRangeForSessionType("easy", 190, undefined, true)).not.toEqual(plannedHrRangeForSessionType("easy", 190));
    expect(plannedHrRangeForSessionType("tempo", 190, undefined, true)).toEqual(plannedHrRangeForSessionType("tempo", 190));
  });

  it("Rückblick ohne Health-Lauf (buildLogOnlyConclusion) nutzt kind und Entlastungswoche", () => {
    const log = { done: true, assignedRun: { distanceKm: 10, duration: 3600, avgHeartRateBpm: 150 } };
    const base = { id: "s1", date: "10. Nov", title: "Lauf", km: 10 };
    expect(buildLogOnlyConclusion({ ...base, type: "tempo", kind: "M" }, log, 190)?.planned.hrZoneLabel).toBe("Zone 3");
    expect(buildLogOnlyConclusion({ ...base, type: "easy", kind: "E" }, log, 190, { recoveryWeek: true })?.planned.hrZoneLabel).toBe(
      "Zone 1",
    );
  });
});
