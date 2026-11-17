/**
 * Verdrahtung des Schicht-Wochenvorschlags für die App: Scan über den bestehenden Woche-Knopf und nach dem Speichern
 * des Dienstplans (aktuelle und nächste Woche). Ergebnis im Format des bestehenden `weekCalendarBatchProposal`-State
 * in AppMain, damit dieselbe `AiActionCard` und dieselben Bestätigen/Verwerfen-Handler greifen.
 */
import type { AiAssistantAction, AiPlanWeek, PlanPatch } from "../lib/ai/types";
import type { WeeklyScheduleBlock } from "../lib/supabase/services/weeklyScheduleBlocksService";
import type { ShiftCapacityContext } from "../scheduling/capacityScore";
import { sessionDayIso } from "../ai/mutations/sessionDayIso";
import { proposeShiftWeek, type ShiftWeekProposal } from "./proposeShiftWeek";
import { reportShiftUsage } from "./shiftUsage";

/** Form des AppMain-State `weekCalendarBatchProposal` (plus `source`/`hints` für den Schicht-Pfad). */
export type ShiftBatchState =
  | { action: null; patches: []; status: "no-conflicts"; source: "shift" }
  | { action: null; patches: []; status: "blocked"; blockedReasons: string[]; source: "shift" }
  | { action: null; patches: []; status: "shift-hints"; hints: string[]; source: "shift" }
  | { action: AiAssistantAction; patches: PlanPatch[]; status: "proposal"; source: "shift"; moves: number; softened: number };

export function toShiftBatchState(result: ShiftWeekProposal): ShiftBatchState {
  switch (result.status) {
    case "no-conflicts":
      return { action: null, patches: [], status: "no-conflicts", source: "shift" };
    case "blocked":
      return { action: null, patches: [], status: "blocked", blockedReasons: result.reasons, source: "shift" };
    case "hint-only":
      return { action: null, patches: [], status: "shift-hints", hints: result.hints, source: "shift" };
    default:
      return {
        action: result.action,
        patches: result.patches,
        status: "proposal",
        source: "shift",
        moves: result.moves.length,
        softened: result.softened.length,
      };
  }
}

export type ShiftScanArgs = {
  plan: AiPlanWeek[];
  weekIndex: number;
  scheduleBlocks: WeeklyScheduleBlock[];
  shiftContext: ShiftCapacityContext;
  todayYmd: string;
  lockedSessionIds: ReadonlySet<string>;
};

/** Scan einer Woche; meldet `shift_proposal_shown`, wenn ein bestätigbarer Vorschlag entsteht. */
export function runShiftWeekScan(args: ShiftScanArgs): ShiftBatchState {
  const result = toShiftBatchState(proposeShiftWeek(args));
  if (result.status === "proposal") reportShiftUsage("shift_proposal_shown", { moves: result.moves, softened: result.softened });
  return result;
}

/** Aus AppMain bei „Übernehmen“ (true) bzw. „Verwerfen“ (false) eines Schicht-Vorschlags. */
export function reportShiftProposalDecision(batch: { source?: string; status?: string } | null | undefined, accepted: boolean): void {
  if (!batch || batch.source !== "shift" || batch.status !== "proposal") return;
  reportShiftUsage(accepted ? "shift_proposal_accepted" : "shift_proposal_declined");
}

/** Index der Woche, die `ymd` enthält; sonst die erste Woche danach; -1 ohne Plan. */
export function findWeekIndexForYmd(plan: AiPlanWeek[], ymd: string): number {
  let after = -1;
  for (let i = 0; i < plan.length; i += 1) {
    const days = (plan[i].s ?? []).map((s) => sessionDayIso(s)).filter((d): d is string => !!d);
    if (days.indexOf(ymd) >= 0) return i;
    if (after < 0 && days.length > 0 && days[0] > ymd) after = i;
  }
  return after;
}

/**
 * Nach dem Speichern: aktuelle Woche, dann die nächste. Die erste Woche mit einem Vorschlag (oder Hinweisen) gewinnt.
 * `null`, wenn es keine Woche gibt oder beide Wochen konfliktfrei sind.
 */
export function scanAfterShiftSave(args: Omit<ShiftScanArgs, "weekIndex">): { weekIndex: number; batch: ShiftBatchState } | null {
  const first = findWeekIndexForYmd(args.plan, args.todayYmd);
  if (first < 0) return null;
  for (let i = first; i <= first + 1 && i < args.plan.length; i += 1) {
    const batch = runShiftWeekScan({ ...args, weekIndex: i });
    if (batch.status === "proposal" || batch.status === "shift-hints") return { weekIndex: i, batch };
  }
  return null;
}
