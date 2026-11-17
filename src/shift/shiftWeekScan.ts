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
import { buildShiftCapacityContext, sortedEntries } from "./shiftAdapter";
import { isShiftModeEnabled } from "./shiftModeFlag";
import { getShiftState } from "./shiftStore";

export const SHIFT_BLOCKED_HINT = "Ein Tausch würde hier eine Trainingsregel verletzen. Dein Plan bleibt, wie er ist.";

/** Form des AppMain-State `weekCalendarBatchProposal` (plus `source`/`hints` für den Schicht-Pfad). */
export type ShiftBatchState =
  | { action: null; patches: []; status: "no-conflicts"; source: "shift" }
  | { action: null; patches: []; status: "shift-hints"; hints: string[]; source: "shift" }
  | { action: AiAssistantAction; patches: PlanPatch[]; status: "proposal"; source: "shift"; moves: number; softened: number };

export function toShiftBatchState(result: ShiftWeekProposal): ShiftBatchState {
  switch (result.status) {
    case "no-conflicts":
      return { action: null, patches: [], status: "no-conflicts", source: "shift" };
    case "blocked":
      // Interne Prüf-Codes (z. B. „taper-later:<id>“) nie anzeigen: ein ruhiger Satz statt der Verstoß-Liste.
      return { action: null, patches: [], status: "shift-hints", hints: [SHIFT_BLOCKED_HINT], source: "shift" };
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

/**
 * Nach dem Speichern des Dienstplans (Seite → AppMain): Kontext frisch aus dem Store, dann aktuelle und nächste Woche.
 * Ergebnis: Woche + Vorschlag zum Anzeigen im Woche-Tab, oder ein Satz für die Seite.
 */
export function planAfterShiftSave(args: {
  plan: AiPlanWeek[];
  scheduleBlocks: WeeklyScheduleBlock[];
  todayYmd: string;
  lockedSessionIds: ReadonlySet<string>;
  enabled?: boolean;
}): { weekIndex: number; batch: ShiftBatchState } | { message: string | null } {
  const state = getShiftState();
  const shiftContext = buildShiftCapacityContext({
    enabled: args.enabled ?? isShiftModeEnabled(),
    worksShifts: state.worksShifts,
    entries: sortedEntries(state.entriesByDate),
    todayYmd: args.todayYmd,
  });
  if (!shiftContext || args.plan.length === 0) return { message: null };
  const found = scanAfterShiftSave({ plan: args.plan, scheduleBlocks: args.scheduleBlocks, shiftContext, todayYmd: args.todayYmd, lockedSessionIds: args.lockedSessionIds });
  return found ?? { message: "Diese und nächste Woche passen zu deinem Dienstplan." };
}

/** Kleiner Hash (djb2) über Inhalt der Termine (ID, Tag, Zeiten) und die gesperrten IDs — nicht nur deren Anzahl. */
function contentHash(blocks: WeeklyScheduleBlock[], locked: ReadonlySet<string>): string {
  const parts: string[] = blocks.map((b) =>
    [b.id, b.isRecurring ? `r${b.dayOfWeek}:${b.recurrenceStartDate ?? ""}-${b.recurrenceEndDate ?? ""}` : b.specificDate, b.startTime, b.endTime, b.title].join("/"),
  );
  parts.sort();
  const lockedIds: string[] = [];
  locked.forEach((id) => lockedIds.push(id));
  lockedIds.sort();
  const text = `${parts.join("|")}#${lockedIds.join(",")}`;
  let hash = 5381;
  for (let i = 0; i < text.length; i += 1) hash = ((hash << 5) + hash + text.charCodeAt(i)) | 0;
  return `${text.length}:${hash >>> 0}`;
}

let todayProposalCache: { key: string; plan: AiPlanWeek[]; ctx: ShiftCapacityContext; value: boolean } | null = null;

/**
 * Gibt es diese Woche einen bestätigbaren Vorschlag, der die heutige Einheit betrifft? Für den Satz auf „Heute“
 * („im Woche-Tab findest du einen Vorschlag“ nur, wenn es stimmt). Ohne Nutzungsereignis; gemerkt je Plan/Kontext/Tag.
 */
export function shiftTodayHasProposal(args: Omit<ShiftScanArgs, "weekIndex"> & { sessionId: string | null }): boolean {
  if (!args.sessionId) return false;
  const key = `${args.todayYmd}|${args.sessionId}|${contentHash(args.scheduleBlocks, args.lockedSessionIds)}`;
  if (todayProposalCache && todayProposalCache.key === key && todayProposalCache.plan === args.plan && todayProposalCache.ctx === args.shiftContext) {
    return todayProposalCache.value;
  }
  const weekIndex = findWeekIndexForYmd(args.plan, args.todayYmd);
  const result = weekIndex >= 0 ? proposeShiftWeek({ ...args, weekIndex }) : null;
  const value = !!result && result.status === "proposal" && result.patches.some((p) => p.sessionId === args.sessionId);
  todayProposalCache = { key, plan: args.plan, ctx: args.shiftContext, value };
  return value;
}
