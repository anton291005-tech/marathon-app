import type { AiPlanWeek, PlanPatch } from "../../lib/ai/types";
import type { WeekCalendarReassignmentProposal } from "./proposeWeekCalendarReassignments";
import type { ValidationContext } from "../validation/validationContext";
import { deepClone } from "../../core/deepClone";
import { applyPlanPatches } from "../../lib/ai/actions";
import { validatePlanIntegrity } from "../validation/validatePlanIntegrity";
import { validateMicroStructure } from "../validation/validateMicroStructure";
import { normalizeTrainingPlan } from "../../planV2/normalizeTrainingPlan";
import { swapWorkouts } from "./swapWorkouts";
import { diffToPatches, findSessionById, NEUTRAL_VALIDATION_CONTEXT } from "./assignSessionToBestCapacityDay";
import { parseSessionDateLabel } from "../../appSmartFeatures";
import { getAppCalendarYmd } from "../../core/time/timeSystem";

export type WeekReassignmentBatchResult =
  | { valid: true; patches: PlanPatch[]; warning?: string }
  | { valid: false; patches: PlanPatch[]; violations: string[] };

type ResolvedProposal = Extract<WeekCalendarReassignmentProposal, { toDayIso: string }>;

function isResolvedProposal(p: WeekCalendarReassignmentProposal): p is ResolvedProposal {
  return "toDayIso" in p;
}

/** Reassignments sind Swaps ("jeder Kalendertag hat genau eine Session") — `toDayIso` muss auf die
 * Session zurückgeführt werden, die diesen Tag in der (unveränderten) Woche aktuell belegt, bevor ein
 * PlanPatch gebaut werden kann. Gleiches Muster wie `sessionDateIso` in
 * `scanWeekForCalendarConflicts.ts`/`buildCalendarReassignmentAction.ts`, nur umgekehrt aufgelöst. */
function findSessionIdForDayIso(week: AiPlanWeek, dayIso: string): string | null {
  for (const session of week.s ?? []) {
    const parsed = parseSessionDateLabel(session.date);
    if (!parsed) continue;
    if (getAppCalendarYmd(parsed) === dayIso) return session.id;
  }
  return null;
}

/**
 * Baut aus den `resolved`-Vorschlägen von `proposeWeekCalendarReassignments` (Schritt 2) einen
 * zusammenhängenden PlanPatch-Satz (wiederverwendet dieselbe Swap-Diff-Logik wie
 * `assignSessionToChosenDay`) und validiert das GESAMTE Set auf einmal gegen den daraus resultierenden
 * Wochen-Endzustand — nicht jeden Swap einzeln. Das ist der Unterschied zur Einzel-Swap-Validierung:
 * zwei für sich genommen unproblematische Verschiebungen können zusammen eine Micro-Structure-Regel
 * brechen, die keine der beiden Einzel-Prüfungen sehen kann, weil jede nur ihre eigenen zwei Sessions
 * gegen die andere, in dieser Prüfung noch unveränderte Hälfte des Batches simuliert.
 *
 * Jedes resolved Proposal aus Schritt 2 ist laut `rankCalendarReassignmentCandidates` bereits einzeln
 * micro-structure-geprüft (isConflict === false) — hier wird trotzdem zusätzlich der GESAMTE
 * Batch-Endzustand geprüft (Begründung oben: Interaktionseffekte zwischen zwei Swaps). Ein
 * Micro-Structure-Status "warn" macht den Batch NICHT ungültig (Schritt 4: der Diff-Screen zeigt die
 * Warnung an, der Athlet bestätigt aktiv trotzdem — gleiches Pattern wie bei der manuellen
 * Tageswahl/"⚠️ Ungünstig"). Nur ein echter "block"-Status (den `validateMicroStructure` aktuell nie
 * liefert, aber der System-Status-Typ erlaubt ihn) bleibt Hard-Block fürs ganze Batch.
 *
 * Erkennt außerdem eine Klasse von Widersprüchen, die Schritt 2 selbst nicht ausschließt: eine Session
 * kann gleichzeitig eigene Quelle EINES Proposals und Verdrängungsziel eines ANDEREN sein (Schritt 2
 * schließt beim Kandidaten-Bau nur die eigene Session aus, nicht andere bereits konfliktbehaftete
 * Sessions). `applyPlanPatches` würde das per "last write wins" kommentarlos auflösen — hier wird das
 * stattdessen als eigene Batch-Violation erkannt, bevor überhaupt gemergt wird.
 *
 * Wendet nichts auf echten State an (kein `applyPlanPatches`-Aufruf gegen den persistierten Plan) —
 * reine Berechnung/Prüfung. Bei jeder Violation werden nur die bereits unproblematisch aufgelösten
 * Patches zurückgegeben (zur Transparenz), nie teilweise angewendet.
 */
export function validateWeekReassignmentBatch(
  proposals: WeekCalendarReassignmentProposal[],
  week: AiPlanWeek,
  phase?: ValidationContext["phase"],
): WeekReassignmentBatchResult {
  const resolved = proposals.filter(isResolvedProposal);
  if (resolved.length === 0) return { valid: true, patches: [] };

  const original: AiPlanWeek[] = deepClone([week]);
  const usedSessionIds = new Set<string>();
  const violations: string[] = [];
  const patches: PlanPatch[] = [];

  for (const proposal of resolved) {
    const movedSession = findSessionById(original, proposal.sessionId);
    if (!movedSession) {
      violations.push(`Session ${proposal.sessionId} wurde in der Woche nicht gefunden.`);
      continue;
    }
    if (usedSessionIds.has(proposal.sessionId)) {
      violations.push(
        `Session ${proposal.sessionId} ist bereits Teil einer anderen Verschiebung in diesem Batch (widersprüchliche Zuordnung).`,
      );
      continue;
    }

    const targetSessionId = findSessionIdForDayIso(week, proposal.toDayIso);
    if (!targetSessionId) {
      violations.push(
        `Zieltag ${proposal.toDayIso} für Session ${proposal.sessionId} konnte keiner Session in der Woche zugeordnet werden.`,
      );
      continue;
    }
    if (targetSessionId === proposal.sessionId) {
      violations.push(`Session ${proposal.sessionId} kann nicht mit sich selbst getauscht werden.`);
      continue;
    }
    if (usedSessionIds.has(targetSessionId)) {
      violations.push(
        `Session ${targetSessionId} ist sowohl Ziel dieser Verschiebung als auch Teil einer anderen Verschiebung in diesem Batch (widersprüchliche Zuordnung).`,
      );
      continue;
    }

    usedSessionIds.add(proposal.sessionId);
    usedSessionIds.add(targetSessionId);

    const simulated = swapWorkouts(original, proposal.sessionId, targetSessionId);
    patches.push(...diffToPatches(original, simulated, [proposal.sessionId, targetSessionId]));
  }

  if (violations.length > 0) {
    return { valid: false, patches, violations };
  }

  const patched = applyPlanPatches(original, patches);
  if (!validatePlanIntegrity(patched)) {
    return { valid: false, patches, violations: ["Struktur-Integrität verletzt nach Anwendung aller Verschiebungen."] };
  }

  const context: ValidationContext = phase ? { ...NEUTRAL_VALIDATION_CONTEXT, phase } : NEUTRAL_VALIDATION_CONTEXT;
  const afterV2 = normalizeTrainingPlan(patched);
  const microResult = validateMicroStructure(afterV2, context);
  if (microResult.status === "block") {
    const reason = microResult.axes.micro?.reason ?? "Micro-Structure-Verletzung nach Anwendung aller Verschiebungen.";
    return { valid: false, patches, violations: [reason] };
  }
  if (microResult.status === "warn") {
    const reason = microResult.axes.micro?.reason ?? "Micro-Structure-Warnung nach Anwendung aller Verschiebungen.";
    return { valid: true, patches, warning: reason };
  }

  return { valid: true, patches };
}
