/**
 * Vorher/Nachher-Zeile einer Verschiebung für die `AiActionCard`:
 * „Intervalle: Do – nach dem Dienst (17:00–0:30 Uhr) → Fr (4. Dez)“.
 *
 * Der Grund gehört zum Ausgangstag (links, vor dem Pfeil), nicht zum Zieltag. Der Zieltag bekommt nur einen eigenen
 * Hinweis, wenn er selbst eingeschränkt ist („→ Fr (27. Nov) – erster freier Tag nach den Nachtdiensten“).
 * `AiActionCard` streicht links nur „Titel: Tag“ durch, der Grund bleibt lesbar.
 */
export const REASSIGNMENT_NOTE_SEPARATOR = " – ";

export function formatReassignmentRow(args: {
  title: string;
  fromDay: string;
  toDay: string;
  toDate: string;
  /** Grund am Ausgangstag (nur für die Einheit, die wegen des Konflikts zieht). */
  cause?: string | null;
  /** Eigener Hinweis des Zieltags, nur wenn er selbst eingeschränkt ist. */
  targetNote?: string | null;
}): string {
  const from = `${args.title}: ${args.fromDay}${args.cause ? `${REASSIGNMENT_NOTE_SEPARATOR}${args.cause}` : ""}`;
  const to = `${args.toDay} (${args.toDate})${args.targetNote ? `${REASSIGNMENT_NOTE_SEPARATOR}${args.targetNote}` : ""}`;
  return `${from} → ${to}`;
}
