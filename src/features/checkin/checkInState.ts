/**
 * Morgen-Check-in (Readiness Spec §6.1, Plan Schritt 3): Typen, Gültigkeit und lokaler Cache.
 * Der Check-in hat in diesem Schritt noch keine Wirkung auf den Plan (keine Stufe, kein Vorschlag).
 */

import { DAILY_CHECKINS_CACHE_KEY } from "../../persistence/marathonLocalStorageKeys";
import { safeReadLocalStorageJson, safeWriteLocalStorageJson } from "../../persistence/safeLocalStorage";

export type PainArea = "foot" | "calf" | "shin" | "knee" | "thigh" | "hip" | "back" | "other";
export type IllnessSymptom = "nose_throat" | "chest" | "fever" | "gastro";

export type CheckInPain = { area: PainArea; severity: number; alteredGait: boolean };
export type CheckInIllness = { symptoms: IllnessSymptom[]; redFlag?: boolean };

/** Ein Check-in je Kalendertag; Antworten 1–5, höher = besser. */
export type CheckInEntry = {
  day: string;
  sleepQuality: number | null;
  energy: number | null;
  legs: number | null;
  mind: number | null;
  sleepHoursSelf: number | null;
  pain: CheckInPain | null;
  illness: CheckInIllness | null;
};

export const CHECKIN_QUESTIONS = [
  { key: "sleepQuality", text: "Wie hast du geschlafen?", labels: ["sehr schlecht", "schlecht", "okay", "gut", "sehr gut"] },
  { key: "energy", text: "Wie viel Energie hast du heute?", labels: ["völlig platt", "müde", "normal", "frisch", "voller Energie"] },
  { key: "legs", text: "Wie fühlen sich deine Beine an?", labels: ["sehr schwer", "schwer", "normal", "locker", "sehr locker"] },
  { key: "mind", text: "Wie geht es dir im Kopf?", labels: ["sehr gestresst", "angespannt", "okay", "entspannt", "sehr entspannt"] },
] as const;

export type CheckInQuestionKey = (typeof CHECKIN_QUESTIONS)[number]["key"];

export const PAIN_AREAS: ReadonlyArray<{ value: PainArea; label: string }> = [
  { value: "foot", label: "Fuß/Sprunggelenk" },
  { value: "calf", label: "Wade/Achillessehne" },
  { value: "shin", label: "Schienbein" },
  { value: "knee", label: "Knie" },
  { value: "thigh", label: "Oberschenkel" },
  { value: "hip", label: "Hüfte/Leiste" },
  { value: "back", label: "Rücken" },
  { value: "other", label: "anderes" },
];

export const ILLNESS_SYMPTOMS: ReadonlyArray<{ value: IllnessSymptom; label: string }> = [
  { value: "nose_throat", label: "nur Hals/Nase" },
  { value: "chest", label: "Husten, Brust" },
  { value: "fever", label: "Fieber, Gliederschmerzen" },
  { value: "gastro", label: "Magen-Darm" },
];

/** Ab dieser Uhrzeit wirkt ein neuer Check-in nicht mehr auf den heutigen Vorschlag (Spec §6.1). */
export const CHECKIN_VALID_UNTIL_HOUR = 14;
const CACHE_DAYS = 14;

export function emptyCheckIn(day: string): CheckInEntry {
  return { day, sleepQuality: null, energy: null, legs: null, mind: null, sleepHoursSelf: null, pain: null, illness: null };
}

/** Alle vier Pflichtfragen beantwortet. */
export function isCheckInComplete(entry: CheckInEntry | null | undefined): boolean {
  return !!entry && CHECKIN_QUESTIONS.every((q) => typeof entry[q.key] === "number");
}

/**
 * Die Home-Karte zeigt den Check-in, solange heute keiner vollständig ist und es vor 14:00 ist und noch keine
 * Einheit heute erledigt wurde (Spec §6.1: gültig bis zum Start der ersten Einheit oder 14:00).
 */
export function shouldOfferCheckIn(args: {
  today: CheckInEntry | null | undefined;
  hour: number;
  sessionDoneToday: boolean;
}): boolean {
  if (isCheckInComplete(args.today)) return false;
  return args.hour < CHECKIN_VALID_UNTIL_HOUR && !args.sessionDoneToday;
}

/** „Zwickt es noch?“: Schmerz von gestern wird heute vorausgewählt (Spec §6.1). */
export function carryOverPain(yesterday: CheckInEntry | null | undefined): CheckInPain | null {
  return yesterday?.pain ? { ...yesterday.pain } : null;
}

type CacheShape = { entries: Record<string, CheckInEntry>; pending: string[] };

export function readCheckInCache(): CacheShape {
  const raw = safeReadLocalStorageJson<CacheShape>(DAILY_CHECKINS_CACHE_KEY, { entries: {}, pending: [] });
  return {
    entries: raw && typeof raw.entries === "object" && raw.entries ? raw.entries : {},
    pending: Array.isArray(raw?.pending) ? raw.pending.filter((d) => typeof d === "string") : [],
  };
}

/** Speichert lokal, behält die letzten 14 Tage; `pending` markiert noch nicht nach Supabase geschriebene Tage. */
export function writeCheckInCache(cache: CacheShape, todayYmd: string): void {
  const cutoff = shiftYmd(todayYmd, -CACHE_DAYS);
  const entries: Record<string, CheckInEntry> = {};
  Object.keys(cache.entries).forEach((day) => {
    if (day >= cutoff) entries[day] = cache.entries[day];
  });
  const pending = cache.pending.filter((day, i, all) => all.indexOf(day) === i && entries[day]);
  safeWriteLocalStorageJson(DAILY_CHECKINS_CACHE_KEY, { entries, pending });
}

export function shiftYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map((x) => Number.parseInt(x, 10));
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}
