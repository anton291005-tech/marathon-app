import type { PersistedMarathonPreferences } from "../app/runtime/runtimePersistenceTypes";

export type RaceGoal = "finish" | "time";

export type DistanceShortcutId = "5" | "10" | "15" | "half" | "marathon";

export type DistanceShortcut = {
  id: DistanceShortcutId;
  label: string;
  displayLabel: string;
  km: number;
};

export const DISTANCE_SHORTCUTS: readonly DistanceShortcut[] = [
  { id: "5", label: "5 km", displayLabel: "5 km", km: 5 },
  { id: "10", label: "10 km", displayLabel: "10 km", km: 10 },
  { id: "15", label: "15 km", displayLabel: "15 km", km: 15 },
  {
    id: "half",
    label: "Halbmarathon",
    displayLabel: "Halbmarathon (21,1 km)",
    km: 21.1,
  },
  {
    id: "marathon",
    label: "Marathon",
    displayLabel: "Marathon (42,2 km)",
    km: 42.2,
  },
] as const;

export const WEEKLY_KM_RANGES: readonly string[] = [
  "0–20 km",
  "20–40 km",
  "40–60 km",
  "60–80 km",
  "80+ km",
] as const;

const MARATHON_KM_THRESHOLD = 42.2;

/** Parses km from free text; returns null when not confidently numeric (e.g. "Leadville 100"). */
export function parseRaceDistanceKm(text: string): number | null {
  const raw = text.trim();
  if (!raw) return null;

  const lower = raw.toLowerCase().replace(",", ".");

  const mileMatch = lower.match(/(\d+(?:\.\d+)?)\s*(?:meilen|miles|mi)\b/);
  if (mileMatch) {
    const miles = Number(mileMatch[1]);
    return Number.isFinite(miles) && miles > 0 ? Math.round(miles * 1.60934 * 10) / 10 : null;
  }

  const kmMatch = lower.match(/(\d+(?:\.\d+)?)\s*km\b/);
  if (kmMatch) {
    const km = Number(kmMatch[1]);
    return Number.isFinite(km) && km > 0 ? km : null;
  }

  const bare = lower.match(/^(\d+(?:\.\d+)?)$/);
  if (bare) {
    const km = Number(bare[1]);
    return Number.isFinite(km) && km > 0 ? km : null;
  }

  return null;
}

export function usesMarathonTimeFormat(km: number | null, label: string): boolean {
  if (km != null && Number.isFinite(km)) return km >= MARATHON_KM_THRESHOLD;
  const l = label.toLowerCase();
  return /\b(ultra|meilen|miles|100|240|leadville)\b/.test(l) || /\bmarathon\b/.test(l);
}

export function normalizeRaceTargetTime(raw: string, marathonFormat: boolean): string | null {
  const t = raw.trim();
  if (!t) return null;
  const parts = t.split(":").map((p) => p.trim());
  if (marathonFormat) {
    if (parts.length === 2) {
      const [h, m] = parts.map(Number);
      if ([h, m].some((n) => Number.isNaN(n))) return null;
      return `${h}:${String(m).padStart(2, "0")}:00`;
    }
    if (parts.length === 3) {
      const [h, m, s] = parts.map(Number);
      if ([h, m, s].some((n) => Number.isNaN(n))) return null;
      return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    }
    return null;
  }
  if (parts.length === 2) {
    const [h, m] = parts.map(Number);
    if ([h, m].some((n) => Number.isNaN(n))) return null;
    return `${h}:${String(m).padStart(2, "0")}`;
  }
  if (parts.length === 3) {
    const [h, m, s] = parts.map(Number);
    if ([h, m, s].some((n) => Number.isNaN(n))) return null;
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return null;
}

export function resolveDistanceSelection(
  shortcutId: DistanceShortcutId | null,
  customText: string,
): { label: string; km: number | null } | null {
  if (customText.trim()) {
    const label = customText.trim();
    return { label, km: parseRaceDistanceKm(label) };
  }
  if (!shortcutId) return null;
  const sc = DISTANCE_SHORTCUTS.find((d) => d.id === shortcutId);
  if (!sc) return null;
  return { label: sc.displayLabel, km: sc.km };
}

export function formatGoalSummary(goal: RaceGoal, targetTime: string | null): string {
  if (goal === "finish") return "Finishen";
  return targetTime ? `Unter ${targetTime}` : "Unter einer Zielzeit";
}

export type PlanStartChoice = "today" | "nextMonday" | "custom";

/** Local midnight for a calendar day. */
export function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** Formats a local date as TT.MM.JJJJ for preferences storage. */
export function formatOnboardingDateGerman(date: Date): string {
  const day = date.getDate();
  const month = date.getMonth() + 1;
  const year = date.getFullYear();
  return `${day}.${String(month).padStart(2, "0")}.${year}`;
}

/** Upcoming Monday; if today is Monday, returns the following Monday. */
export function getNextMonday(from: Date): Date {
  const d = startOfLocalDay(from);
  const dow = d.getDay();
  let add = (8 - dow) % 7;
  if (add === 0) add = 7;
  d.setDate(d.getDate() + add);
  return d;
}

export function resolvePlanStartDate(
  choice: PlanStartChoice,
  customText: string,
  now: Date,
): { date: Date | null; planStartDate: string | null } {
  if (choice === "today") {
    const d = startOfLocalDay(now);
    return { date: d, planStartDate: formatOnboardingDateGerman(d) };
  }
  if (choice === "nextMonday") {
    const d = getNextMonday(now);
    return { date: d, planStartDate: formatOnboardingDateGerman(d) };
  }
  const parsed = parseOnboardingRaceDate(customText);
  if (!parsed) return { date: null, planStartDate: null };
  return { date: parsed, planStartDate: formatOnboardingDateGerman(parsed) };
}

/** Parses TT.MM.JJJJ (German onboarding input) to a local Date, or null if invalid. */
export function parseOnboardingRaceDate(text: string): Date | null {
  const trimmed = text.trim();
  const match = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(trimmed);
  if (!match) return null;

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1970) return null;

  const parsed = new Date(year, month - 1, day);
  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    return null;
  }
  return parsed;
}

export const RESET_ONBOARDING_STORAGE_KEY = "reset_onboarding";

export type NeedsOnboardingInput = {
  prefs: PersistedMarathonPreferences | null | undefined;
  hasUserTrainingPlan: boolean;
  resetOnboarding?: boolean;
};

/** True when onboarding overlay should show (after remote hydration). */
export function needsOnboarding(input: NeedsOnboardingInput): boolean {
  if (input.resetOnboarding) return true;
  if (input.prefs?.onboardingComplete === true) return false;
  if (input.hasUserTrainingPlan) return false;
  return true;
}

export type OnboardingSubmitPayload = {
  raceDistanceLabel: string;
  raceDistanceKm: number | null;
  raceGoal: RaceGoal;
  raceTargetTime: string | null;
  raceName: string | null;
  raceDate: string | null;
  planStartDate: string | null;
  weeklyKmRange: string;
  userPreferences: string[];
};

export function buildOnboardingPreferencesPatch(
  payload: OnboardingSubmitPayload,
): PersistedMarathonPreferences {
  const marathonFmt = usesMarathonTimeFormat(payload.raceDistanceKm, payload.raceDistanceLabel);
  let raceTargetTime: string | null = payload.raceTargetTime;
  let targetTime: string | null = null;

  if (payload.raceGoal === "finish") {
    raceTargetTime = null;
    targetTime = null;
  } else if (payload.raceGoal === "time" && raceTargetTime) {
    const normalized = normalizeRaceTargetTime(raceTargetTime, marathonFmt);
    if (normalized) {
      raceTargetTime = normalized;
      const parts = normalized.split(":");
      targetTime = parts.length === 2 ? `${normalized}:00` : normalized;
    } else {
      raceTargetTime = null;
    }
  } else {
    raceTargetTime = null;
  }

  const userPreferences = payload.userPreferences.map((p) => p.trim()).filter(Boolean);

  return {
    raceDistanceLabel: payload.raceDistanceLabel,
    raceDistanceKm: payload.raceDistanceKm,
    raceGoal: payload.raceGoal,
    raceTargetTime,
    raceName: payload.raceName,
    raceDate: payload.raceDate,
    planStartDate: payload.planStartDate,
    weeklyKmRange: payload.weeklyKmRange,
    ...(userPreferences.length ? { userPreferences } : {}),
    onboardingComplete: true,
    targetTime,
  };
}
