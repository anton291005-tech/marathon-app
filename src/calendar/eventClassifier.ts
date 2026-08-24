import type { ScheduleBlockCategory } from "../lib/supabase/services/weeklyScheduleBlocksService";

/**
 * Stille Keyword-Heuristik für den EventKit-Import (Phase-2-Schritt 4).
 * Die Kategorie ist für die Capacity-Engine aktuell rein informativ (sie rechnet nur mit
 * Zeitfenstern) — die Klassifikation ist Vorarbeit für die Load-Tag-Presets (Schritt 5).
 * Titel wird vor dem Kalendernamen geprüft; erster Treffer in der Listen-Reihenfolge gewinnt,
 * Fallback "other".
 */
const CATEGORY_KEYWORDS: ReadonlyArray<[ScheduleBlockCategory, ReadonlyArray<string>]> = [
  ["study", ["uni", "vorlesung", "lecture", "seminar", "klausur", "prüfung", "tutorium", "kurs", "schule", "lernen", "study"]],
  ["volunteer", ["ehrenamt", "freiwillig", "volunteer", "feuerwehr", "thw", "drk", "jugendgruppe"]],
  ["sport", ["training", "gym", "fitness", "yoga", "verein", "spiel", "match", "schwimmen", "klettern"]],
  ["job", ["arbeit", "work", "schicht", "dienst", "meeting", "standup", "büro", "office", "jour fixe", "kunde"]],
];

export function classifyEventCategory(title: string, calendarName: string): ScheduleBlockCategory {
  for (const haystack of [title, calendarName]) {
    const text = haystack.trim().toLowerCase();
    if (!text) continue;
    for (const [category, keywords] of CATEGORY_KEYWORDS) {
      if (keywords.some((kw) => text.includes(kw))) return category;
    }
  }
  return "other";
}
