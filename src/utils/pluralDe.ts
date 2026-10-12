/** Zahl mit passender Einzahl-/Mehrzahlform: `pluralDe(1, "Woche", "Wochen")` → „1 Woche". */
export function pluralDe(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}
