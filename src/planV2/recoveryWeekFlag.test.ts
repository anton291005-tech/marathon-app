// Entlastungswoche: Quelle der Wahrheit ist das Flag (`meta.isRecoveryWeek` → `PlanWeek.isRecoveryWeek`).
// Nur normalizeTrainingPlan zieht das Flag für Altpläne aus dem Fokus-Text nach; danach liest die App nur das Flag.
import { deriveDisplayPlan } from "../displayPlan/deriveDisplayPlan";
import { PROFILES } from "../planCore/__fixtures__/profiles";
import { buildPlan } from "../planCore/buildPlan";
import { EMPTY_RULES } from "../planCore/types";
import { isRecoveryPlanWeek } from "../trainingIntelligence/sessionPlanTargets";
import { normalizeTrainingPlan, normalizeWeekMeta } from "./normalizeTrainingPlan";
import { toPlanWeeks } from "./toPlanWeeks";

const workout = (id: string, ymd: string, sessionType: string, km: number) => ({
  id,
  dateIso: `${ymd}T12:00:00.000Z`,
  sport: "run",
  sessionType,
  title: id,
  km,
});

describe("normalizeWeekMeta: Flag für Altpläne nachziehen", () => {
  it("setzt das Flag aus dem Fokus-Text, wenn es fehlt (Altplan)", () => {
    expect(normalizeWeekMeta({ focus: "Entlastungswoche – Adaptationen festigen" }, 0).isRecoveryWeek).toBe(true);
    expect(normalizeWeekMeta({ focus: "Recovery week" }, 0).isRecoveryWeek).toBe(true);
  });

  it("lässt normale Wochen und Wochen ohne Fokus ohne Flag", () => {
    expect(normalizeWeekMeta({ focus: "Aerobe Basis aufbauen" }, 0).isRecoveryWeek).toBeUndefined();
    expect(normalizeWeekMeta({}, 0).isRecoveryWeek).toBeUndefined();
  });

  it("ein ausdrückliches Flag gewinnt über den Text (true wie false)", () => {
    expect(normalizeWeekMeta({ focus: "Aufbau", isRecoveryWeek: true }, 0).isRecoveryWeek).toBe(true);
    const once = normalizeWeekMeta({ focus: "Entlastungswoche", isRecoveryWeek: false }, 0);
    expect(once.isRecoveryWeek).toBe(false);
    // idempotent: ein zweiter Durchlauf darf false nicht per Text-Backfill zu true machen
    expect(normalizeWeekMeta(once, 0).isRecoveryWeek).toBe(false);
  });
});

describe("Flag bis in die Anzeige (normalizeTrainingPlan → toPlanWeeks → isRecoveryPlanWeek)", () => {
  const w1 = [workout("a", "2026-11-09", "easy", 8)];
  const w2 = [workout("b", "2026-11-16", "easy", 6)];
  const w3 = [workout("c", "2026-11-23", "easy", 9)];
  const plan = normalizeTrainingPlan({
    version: 2,
    workouts: [...w1, ...w2, ...w3],
    weeks: [
      // Plan-Kern: Flag gesetzt.
      { startIso: "2026-11-09", totalKm: 8, meta: { wn: 1, phase: "base", focus: "Aufbau" }, workouts: w1 },
      { startIso: "2026-11-16", totalKm: 6, meta: { wn: 2, phase: "base", focus: "Entlastungswoche", isRecoveryWeek: true }, workouts: w2 },
      // Altplan: nur Text.
      { startIso: "2026-11-23", totalKm: 9, meta: { wn: 3, phase: "base", focus: "Entlastungswoche vor dem Peak" }, workouts: w3 },
    ],
  });
  const weeks = toPlanWeeks(plan);

  it("PlanWeek trägt das Flag nur bei Entlastungswochen", () => {
    expect(weeks.map((w) => w.isRecoveryWeek)).toEqual([undefined, true, true]);
  });

  it("isRecoveryPlanWeek liest das Flag (Kern-Plan und nachgezogener Altplan)", () => {
    expect(weeks.map((w) => isRecoveryPlanWeek(w))).toEqual([false, true, true]);
  });
});

describe("Flag auf dem echten Anzeigeweg (deriveDisplayPlan: V2 → PlanWeek → AiPlanWeek → Patches)", () => {
  // Regression: normalizePlanWeekToAi reicht nur Whitelist-Felder durch; ohne das Flag war jede Entlastungswoche unerkannt.
  const profile = PROFILES.filter((p) => p.name === "P5")[0];
  const corePlan = buildPlan(profile.inputs, EMPTY_RULES, profile.todayYmd);
  const flagged = corePlan.weeks.map((w) => w.meta?.isRecoveryWeek === true);

  it("der Kern liefert Entlastungswochen (sonst wäre der Test leer)", () => {
    expect(flagged.some(Boolean)).toBe(true);
  });

  it("jede Entlastungswoche des Kerns kommt in der Anzeige als Entlastungswoche an", () => {
    const weeks = deriveDisplayPlan(corePlan as never, []);
    expect(weeks.map((w) => isRecoveryPlanWeek(w as never))).toEqual(flagged);
  });

  it("auch mit Patches bleibt das Flag erhalten", () => {
    const recoveryWeek = corePlan.weeks.filter((w) => w.meta?.isRecoveryWeek === true)[0];
    const target = recoveryWeek.workouts.filter((w) => w.sessionType === "easy")[0];
    const patches = [{ sessionId: target.id, changes: { title: "Angepasst" }, reason: "test" }];
    const weeks = deriveDisplayPlan(corePlan as never, patches);
    expect(weeks.map((w) => isRecoveryPlanWeek(w as never))).toEqual(flagged);
    expect(weeks.flatMap((w) => w.s).find((x) => x.id === target.id)?.title).toBe("Angepasst");
  });

  it("Altplan nur mit Fokus-Text: das Flag wird beim Einlesen nachgezogen und kommt an", () => {
    const legacy = JSON.parse(JSON.stringify(corePlan));
    legacy.weeks.forEach((w: { meta?: { isRecoveryWeek?: boolean } }) => {
      if (w.meta) delete w.meta.isRecoveryWeek;
    });
    const weeks = deriveDisplayPlan(legacy, []);
    expect(weeks.map((w) => isRecoveryPlanWeek(w as never))).toEqual(flagged);
  });
});
