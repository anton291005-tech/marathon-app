/**
 * Property-Test (Seed): zufällige Dienstpläne × Referenzpläne P1–P6 (Plan-Kern). Kein angenommener Vorschlag erzeugt
 * zwei harte Tage in Folge, verschiebt einen Long Run aus seiner Kalenderwoche, berührt ein Rennen oder eine gesperrte
 * Einheit, oder erhöht die Zahl harter Einheiten einer Woche.
 */
import { EMPTY_RULES, buildCheckedPlan } from "../../planCore";
import { PROFILES } from "../../planCore/__fixtures__/profiles";
import { addDays, diffDays, mondayOf } from "../../planCore/dates";
import { createRng } from "../../planCore/random";
import { deriveDisplayPlan } from "../../displayPlan/deriveDisplayPlan";
import { normalizeTrainingPlan } from "../../planV2/normalizeTrainingPlan";
import type { TrainingPlanV2 } from "../../planV2/types";
import { applyPlanPatches } from "../../lib/ai/actions";
import type { AiPlanWeek } from "../../lib/ai/types";
import { buildLockedSessionIds } from "../../ai/mutations/lockedSessions";
import { sessionDayIso } from "../../ai/mutations/sessionDayIso";
import type { StoredShiftEntry } from "../../lib/supabase/services/shiftEntriesService";
import { buildShiftCapacityContext } from "../shiftAdapter";
import { isHardDayType, proposeShiftWeek } from "../proposeShiftWeek";
import { findWeekIndexForYmd } from "../shiftWeekScan";

function displayPlanOf(profileIndex: number): { plan: AiPlanWeek[]; startYmd: string } {
  const profile = PROFILES[profileIndex];
  const { plan } = buildCheckedPlan(profile.inputs, EMPTY_RULES, profile.todayYmd);
  return { plan: deriveDisplayPlan(normalizeTrainingPlan(plan as unknown as TrainingPlanV2), []), startYmd: profile.inputs.startYmd };
}

function hardDaySet(plan: AiPlanWeek[]): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  plan.forEach((w) => w.s.forEach((s) => {
    const d = sessionDayIso(s);
    if (d && isHardDayType(s.type)) out[d] = true;
  }));
  return out;
}

function adjacentPairs(plan: AiPlanWeek[]): string[] {
  const hard = hardDaySet(plan);
  return Object.keys(hard)
    .filter((d) => hard[addDays(d, 1)])
    .sort();
}

function randomSchedule(rng: ReturnType<typeof createRng>, fromYmd: string, days: number): StoredShiftEntry[] {
  const out: StoredShiftEntry[] = [];
  // Rotationen wie im echten Dienst: Blöcke gleicher Art, dazwischen frei.
  let i = 0;
  while (i < days) {
    const kind = rng.pick(["early", "late", "night", "off", "none", "custom"] as const);
    const len = rng.int(1, 4);
    for (let k = 0; k < len && i < days; k += 1, i += 1) {
      const dateYmd = addDays(fromYmd, i);
      if (kind === "none") continue;
      if (kind === "off") out.push({ dateYmd, kind, start: null, end: null, label: null });
      else if (kind === "early") out.push({ dateYmd, kind, start: "06:00", end: "14:00", label: null });
      else if (kind === "late") out.push({ dateYmd, kind, start: rng.pick(["14:00", "16:00", "17:00"]), end: rng.pick(["22:00", "23:30", "00:30"]), label: null });
      else if (kind === "night") out.push({ dateYmd, kind, start: "22:00", end: "06:00", label: null });
      else out.push({ dateYmd, kind, start: `${String(rng.int(5, 12)).padStart(2, "0")}:00`, end: `${String(rng.int(13, 23)).padStart(2, "0")}:30`, label: null });
    }
  }
  return out;
}

describe("Schicht-Wochenvorschlag – Property-Test über P1–P6", () => {
  const plans = PROFILES.map((_, index) => displayPlanOf(index));

  it("kein angenommener Vorschlag bricht eine Schutzregel", () => {
    const rng = createRng(4711);
    let proposals = 0;
    for (let round = 0; round < 240; round += 1) {
      const { plan, startYmd } = plans[round % plans.length];
      const allDays = plan.flatMap((w) => w.s.map((s) => sessionDayIso(s) as string)).sort();
      const lastYmd = allDays[allDays.length - 1];
      const todayYmd = addDays(startYmd, rng.int(0, Math.max(0, diffDays(lastYmd, startYmd) - 1)));
      const entries = randomSchedule(rng, addDays(todayYmd, -7), 42);
      const shiftContext = buildShiftCapacityContext({ enabled: true, worksShifts: true, entries, todayYmd });
      if (!shiftContext) continue;
      const locked = buildLockedSessionIds(plan, {}, todayYmd);
      const first = findWeekIndexForYmd(plan, todayYmd);
      for (let weekIndex = first; weekIndex >= 0 && weekIndex <= first + 1 && weekIndex < plan.length; weekIndex += 1) {
        const result = proposeShiftWeek({ plan, weekIndex, scheduleBlocks: [], shiftContext, todayYmd, lockedSessionIds: locked });
        if (result.status !== "proposal") continue;
        proposals += 1;
        const after = applyPlanPatches(plan, result.patches);

        // 1. keine neuen harten Tage hintereinander (auch über die Wochengrenze)
        const before = adjacentPairs(plan);
        adjacentPairs(after).forEach((pair) => expect(before).toContain(pair));

        const byIdBefore: Record<string, { type: string; ymd: string }> = {};
        plan.forEach((w) => w.s.forEach((s) => (byIdBefore[s.id] = { type: s.type, ymd: sessionDayIso(s) as string })));
        after.forEach((w) =>
          w.s.forEach((s) => {
            const was = byIdBefore[s.id];
            const now = sessionDayIso(s) as string;
            // 2. Long Run bleibt in seiner Kalenderwoche
            if (was.type === "long") expect(mondayOf(now)).toBe(mondayOf(was.ymd));
            // 3. Rennen und gesperrte Einheiten bleiben unangetastet
            if (was.type === "race" || locked.has(s.id)) {
              expect(now).toBe(was.ymd);
              expect(s.type).toBe(was.type);
            }
            // 4. nichts wird härter
            if (!isHardDayType(was.type)) expect(isHardDayType(s.type)).toBe(false);
          }),
        );
        expect(result.patches.some((p) => locked.has(p.sessionId))).toBe(false);
      }
    }
    // Der Test soll auch wirklich Vorschläge prüfen.
    expect(proposals).toBeGreaterThan(30);
  });
});
