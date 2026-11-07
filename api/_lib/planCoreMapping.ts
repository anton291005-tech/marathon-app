/**
 * Server-Seite der Übersetzung Profil → `CoreInputs`. Die Übersetzung selbst liegt im Kern (`src/planCore/profileInputs.ts`),
 * damit App und Server dieselbe nutzen; hier bleibt nur der Kalendertag in Europe/Berlin.
 */

export {
  coreDistanceOfKm,
  germanDateToYmd,
  goalSecondsOf,
  profileToCoreInputs,
} from "../../src/planCore";
export type { MappingFailure, MappingNote, MappingResult, PlanProfile } from "../../src/planCore";
import type { Ymd } from "../../src/planCore";

/** Kalendertag in Europe/Berlin (die App rechnet in deutscher Ortszeit; Vercel läuft in UTC). */
export function berlinTodayYmd(now: Date): Ymd {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
