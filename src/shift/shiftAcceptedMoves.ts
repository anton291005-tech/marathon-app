/**
 * Vom Nutzer bestätigte Verschiebungen im Schicht-Modus („Übernehmen“, Einzel-Vorschlag oder „Trotzdem Tag wählen“).
 *
 * Problem: Ein Vorschlag darf eine Einheit auf einen eingeschränkten Tag legen (kein freier Tag möglich). Der nächste
 * Scan sah dort sofort wieder einen weichen Konflikt und meldete „… bleibt – …, und es gibt keinen freien Tag“, direkt
 * nach dem Bestätigen. Eine bestätigte Verschiebung gilt deshalb als akzeptiert, bis sich der Dienstplan an diesem Tag
 * oder am Vortag ändert — oder die Eignung des Tages selbst (etwa durch eine Nacht zwei Tage vorher). Akzeptiert heißt
 * nur: kein weicher Konflikt mehr. Ein starker Konflikt (ungeeignet, Kalendertermin) wird weiter gemeldet.
 *
 * Gespeichert lokal je Konto (`marathonShiftAcceptedMoves:<userId>`, beim Abmelden gelöscht), nur Session-ID, Tag und
 * ein Fingerabdruck der Dienste — nichts davon geht an den Server oder an ein Sprachmodell.
 */
import type { PlanPatch } from "../lib/ai/types";
import type { StoredShiftEntry } from "../lib/supabase/services/shiftEntriesService";
import type { ShiftCapacityContext } from "../scheduling/capacityScore";
import { SHIFT_ACCEPTED_MOVES_KEY } from "../persistence/marathonLocalStorageKeys";
import { safeReadLocalStorageJson, safeWriteLocalStorageJson } from "../persistence/safeLocalStorage";
import { addDays, isYmd } from "../planCore/dates";

export type AcceptedShiftMove = { sessionId: string; dayYmd: string; fingerprint: string };

/** Höchstens so viele Einträge; ältere fallen weg (eine Saison an Verschiebungen reicht). */
const MAX_ENTRIES = 200;

export function acceptedMovesKey(userId: string): string {
  return `${SHIFT_ACCEPTED_MOVES_KEY}:${userId}`;
}

function entryPart(entry: StoredShiftEntry | undefined): string {
  return entry ? `${entry.kind}/${entry.start ?? ""}/${entry.end ?? ""}` : "-";
}

/** Fingerabdruck eines Tages: Dienste am Vortag und am Tag selbst plus die Eignung des Tages. */
export function shiftDayFingerprint(
  dayYmd: string,
  entriesByDate: Readonly<Record<string, StoredShiftEntry>>,
  context: ShiftCapacityContext | null,
): string {
  const day = context?.byDate[dayYmd];
  const assessment = day ? `${day.hard}/${day.long}/${day.easy}/${day.reasons.hard}/${day.reasons.long}/${day.reasons.easy}` : "-";
  return `${entryPart(entriesByDate[addDays(dayYmd, -1)])}|${entryPart(entriesByDate[dayYmd])}|${assessment}`;
}

export function readAcceptedShiftMoves(userId: string | null | undefined): AcceptedShiftMove[] {
  if (!userId) return [];
  const raw = safeReadLocalStorageJson<unknown>(acceptedMovesKey(userId), []);
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (m): m is AcceptedShiftMove =>
      !!m && typeof m === "object" && typeof m.sessionId === "string" && isYmd(m.dayYmd) && typeof m.fingerprint === "string",
  );
}

/**
 * Bestätigte Patches merken: jede Einheit, deren Tag sich ändert (`changes.dateIso`), gilt an ihrem neuen Tag als
 * akzeptiert. Patches ohne Tageswechsel („locker statt hart“) werden übergangen. Ein neuer Eintrag ersetzt den alten
 * derselben Einheit.
 */
export function recordAcceptedShiftMoves(
  userId: string | null | undefined,
  patches: readonly PlanPatch[],
  entriesByDate: Readonly<Record<string, StoredShiftEntry>>,
  context: ShiftCapacityContext | null,
): void {
  if (!userId) return;
  const moved = patches
    .map((p) => ({ sessionId: p.sessionId, dayYmd: typeof p.changes.dateIso === "string" ? p.changes.dateIso.slice(0, 10) : "" }))
    .filter((m) => isYmd(m.dayYmd));
  if (moved.length === 0) return;
  const ids: Record<string, boolean> = {};
  moved.forEach((m) => (ids[m.sessionId] = true));
  const next = readAcceptedShiftMoves(userId)
    .filter((m) => !ids[m.sessionId])
    .concat(moved.map((m) => ({ ...m, fingerprint: shiftDayFingerprint(m.dayYmd, entriesByDate, context) })));
  safeWriteLocalStorageJson(acceptedMovesKey(userId), next.slice(-MAX_ENTRIES));
}

/** Schlüssel `<sessionId>@<YYYY-MM-DD>` der Bestätigungen, deren Fingerabdruck noch stimmt. */
export function validAcceptedShiftKeys(
  accepted: readonly AcceptedShiftMove[],
  entriesByDate: Readonly<Record<string, StoredShiftEntry>>,
  context: ShiftCapacityContext | null,
): ReadonlySet<string> {
  const out = new Set<string>();
  accepted.forEach((m) => {
    if (m.fingerprint === shiftDayFingerprint(m.dayYmd, entriesByDate, context)) out.add(acceptedShiftKey(m.sessionId, m.dayYmd));
  });
  return out;
}

export function acceptedShiftKey(sessionId: string, dayYmd: string): string {
  return `${sessionId}@${dayYmd}`;
}
