import type { AiPlanWeek, PlanPatch } from "../../lib/ai/types";
import type { WeekCalendarReassignmentProposal } from "./proposeWeekCalendarReassignments";
import type { ValidationContext } from "../validation/validationContext";
import type { TrainingPhase } from "../../planV2/trainingPhase";
import { deepClone } from "../../core/deepClone";
import { applyPlanPatches } from "../../lib/ai/actions";
import { validatePlanIntegrity } from "../validation/validatePlanIntegrity";
import { computeMicroStructureDelta, type MicroExternalLoadLookup } from "../validation/validateMicroStructure";
import { normalizeTrainingPlan } from "../../planV2/normalizeTrainingPlan";
import { swapWorkouts } from "./swapWorkouts";
import { NO_LOCKED_SESSION_IDS } from "./lockedSessions";
import { diffToPatches, findSessionById, FALLBACK_VALIDATION_CONTEXT } from "./assignSessionToBestCapacityDay";
import { buildPhaseLookup } from "./planPhaseLookup";
import { sessionDayIso } from "./sessionDayIso";

export type WeekReassignmentBatchResult =
  | {
      valid: true;
      patches: PlanPatch[];
      /** ⚠️-Warnung: neue Befunde ab 75 durch den Batch. */
      warning?: string;
      /** Neutraler Hinweis: neue Befunde 40–74. */
      hint?: string;
    }
  | { valid: false; patches: PlanPatch[]; violations: string[] };

type ResolvedProposal = Extract<WeekCalendarReassignmentProposal, { toDayIso: string }>;

function isResolvedProposal(p: WeekCalendarReassignmentProposal): p is ResolvedProposal {
  return "toDayIso" in p;
}

/** Reassignments sind Swaps ("jeder Kalendertag hat genau eine Session") — `toDayIso` muss auf die
 * Session zurückgeführt werden, die diesen Tag in der (unveränderten) Woche aktuell belegt, bevor ein
 * PlanPatch gebaut werden kann. Gleiches Muster wie `sessionDayIso` in
 * `scanWeekForCalendarConflicts.ts`/`buildCalendarReassignmentAction.ts`, nur umgekehrt aufgelöst. */
function findSessionIdForDayIso(week: AiPlanWeek, dayIso: string): string | null {
  for (const session of week.s ?? []) {
    if (sessionDayIso(session) === dayIso) return session.id;
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
 * Bewertet wird nur die Änderung (Delta gegen den unveränderten Plan, `computeMicroStructureDelta`), mit der
 * Phase je Tag aus dem Plan und über Wochengrenzen hinweg (dafür `fullPlan` mitgeben; ohne ihn sieht der
 * Batch nur die übergebene Woche). Neue Befunde 40–74 werden als neutraler `hint`, ab 75 als `warning`
 * angezeigt — der Athlet bestätigt aktiv. Ein NEUER Befund ab 95 (z. B. zwei harte Tage hintereinander durch
 * die Wechselwirkung zweier Verschiebungen) macht den Batch ungültig: das System schlägt so etwas nie selbst vor.
 * `externalLoadTitlesOf` (`buildPhysicalLoadDayLookup`) macht körperlich belastende Termine an Nachbartagen sichtbar.
 *
 * Erkennt außerdem eine Klasse von Widersprüchen, die Schritt 2 selbst nicht ausschließt: eine Session
 * kann gleichzeitig eigene Quelle EINES Proposals und Verdrängungsziel eines ANDEREN sein (Schritt 2
 * schließt beim Kandidaten-Bau nur die eigene Session aus, nicht andere bereits konfliktbehaftete
 * Sessions). `applyPlanPatches` würde das per "last write wins" kommentarlos auflösen — hier wird das
 * stattdessen als eigene Batch-Violation erkannt, bevor überhaupt gemergt wird.
 *
 * Guard: Berührt ein Swap eine gesperrte Session (erledigt/übersprungen/vergangen, `lockedSessionIds`),
 * ist das eine Batch-Violation — `swapWorkouts` prüft das selbst nicht.
 *
 * Wendet nichts auf echten State an (kein `applyPlanPatches`-Aufruf gegen den persistierten Plan) —
 * reine Berechnung/Prüfung. Bei jeder Violation werden nur die bereits unproblematisch aufgelösten
 * Patches zurückgegeben (zur Transparenz), nie teilweise angewendet.
 */
export function validateWeekReassignmentBatch(
  proposals: WeekCalendarReassignmentProposal[],
  week: AiPlanWeek,
  phase?: TrainingPhase,
  lockedSessionIds: ReadonlySet<string> = NO_LOCKED_SESSION_IDS,
  fullPlan?: AiPlanWeek[],
  externalLoadTitlesOf?: MicroExternalLoadLookup,
): WeekReassignmentBatchResult {
  const resolved = proposals.filter(isResolvedProposal);
  if (resolved.length === 0) return { valid: true, patches: [] };

  const original: AiPlanWeek[] = deepClone(fullPlan ?? [week]);
  const usedSessionIds = new Set<string>();
  const violations: string[] = [];
  const patches: PlanPatch[] = [];

  for (const proposal of resolved) {
    const movedSession = findSessionById(original, proposal.sessionId);
    if (!movedSession) {
      violations.push(`Session ${proposal.sessionId} wurde in der Woche nicht gefunden.`);
      continue;
    }
    if (lockedSessionIds.has(proposal.sessionId)) {
      violations.push(`Session ${proposal.sessionId} ist erledigt, übersprungen oder vergangen und darf nicht verschoben werden.`);
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
    if (lockedSessionIds.has(targetSessionId)) {
      violations.push(`Session ${targetSessionId} ist erledigt, übersprungen oder vergangen und darf nicht Zieltag einer Verschiebung sein.`);
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

  const context: ValidationContext = phase ? { ...FALLBACK_VALIDATION_CONTEXT, phase } : FALLBACK_VALIDATION_CONTEXT;
  const delta = computeMicroStructureDelta(normalizeTrainingPlan(original), normalizeTrainingPlan(patched), context, {
    phaseOf: buildPhaseLookup(original, phase),
    externalLoadTitlesOf,
  });
  if (delta.tier >= 3) {
    const reason = delta.reason ?? "Micro-Structure-Verletzung nach Anwendung aller Verschiebungen.";
    return { valid: false, patches, violations: [reason] };
  }

  const warning = delta.warnings.length ? delta.warnings.join(" ") : undefined;
  const hint = delta.hints.length ? delta.hints.join(" ") : undefined;
  return { valid: true, patches, ...(warning ? { warning } : {}), ...(hint ? { hint } : {}) };
}
