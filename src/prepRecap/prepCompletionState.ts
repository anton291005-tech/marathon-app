/**
 * „Vorbereitung abgeschlossen" — der Zustand nach dem Zielrennen des aktiven Plans.
 *
 * Ohne diesen Zustand fiel Home nach der letzten Planwoche still auf „Ruhetag · Kein Training
 * geplant" zurück, und Leistung zeigte weiter eine Prognose für ein bereits gelaufenes Rennen.
 *
 * Zielrennen = die zeitlich LETZTE `race`-Session des Plans (ein Plan kann Vorbereitungsrennen
 * enthalten, z. B. einen Halbmarathon einige Wochen vorher). Datumsquelle ist `dateIso` über
 * `sessionDayIso` (echtes Jahr aus der TrainingPlanV2-SSOT), das Label nur als Legacy-Fallback.
 */

import { isSessionLogDone, parseTargetTimeToSeconds } from "../appSmartFeatures";
import { sessionDayIso } from "../ai/mutations/sessionDayIso";
import type { PlanSession, PlanWeek, SessionLog } from "../marathonPrediction";
import type { PersistedMarathonPreferences } from "../app/runtime/runtimePersistenceTypes";

export type PrepCompletedBy = "race_done" | "date_passed" | "plan_ended";

export type PrepCompletionState =
  | { status: "active" }
  | {
      status: "completed";
      completedBy: PrepCompletedBy;
      /** Zielrennen; null nur bei `plan_ended` (Plan ohne Race-Session). */
      raceSession: PlanSession | null;
      /** Renntag bzw. — ohne Race-Session — letzter Plan-Workout-Tag (YYYY-MM-DD). */
      raceYmd: string;
      raceName: string | null;
      /**
       * Zielvorgabe in exakten Sekunden; null bei „Finishen", fehlender/ungültiger Zielzeit oder wenn
       * die Preferences einem anderen Plan gehören.
       */
      goalSeconds: number | null;
      /** false: die Preferences beschreiben einen anderen Plan — Ziel/Distanz nicht daraus lesen. */
      preferencesOwned: boolean;
    };

type CompletionPreferences = Pick<PersistedMarathonPreferences, "raceName" | "raceDate" | "raceGoal" | "targetTime">;

function planSessions(plan: readonly PlanWeek[]): PlanSession[] {
  const out: PlanSession[] = [];
  for (const week of plan ?? []) {
    if (!week || typeof week !== "object") continue;
    for (const session of week.s ?? []) {
      if (session) out.push(session);
    }
  }
  return out;
}

/** Letzte `race`-Session nach Kalendertag; null wenn der Plan kein Rennen enthält. */
export function findGoalRaceSession(plan: readonly PlanWeek[]): { session: PlanSession; ymd: string } | null {
  let best: { session: PlanSession; ymd: string } | null = null;
  for (const session of planSessions(plan)) {
    if (session.type !== "race") continue;
    const ymd = sessionDayIso(session);
    if (!ymd) continue;
    if (best == null || ymd >= best.ymd) best = { session, ymd };
  }
  return best;
}

function lastWorkoutYmd(plan: readonly PlanWeek[]): string | null {
  let last: string | null = null;
  for (const session of planSessions(plan)) {
    if (session.type === "rest") continue;
    const ymd = sessionDayIso(session);
    if (ymd && (last == null || ymd > last)) last = ymd;
  }
  return last;
}

/**
 * Renntitel ohne Deko: Emoji/Symbole weg, Zielzusatz („– SUB 2:50!") weg, Großschreibung
 * des Plans („WARSCHAU MARATHON") in Wortschreibung („Warschau Marathon").
 */
export function cleanRaceTitle(title: string | null | undefined): string | null {
  if (typeof title !== "string") return null;
  let t = title.replace(/[^\p{L}\p{N}\s.\-–—:!'&/]/gu, " ");
  t = t.replace(/\s*[–—-]\s*sub\b.*$/i, "");
  t = t.replace(/[!:\s–—-]+$/u, "").replace(/^[\s–—-]+/u, "");
  t = t.replace(/\s+/g, " ").trim();
  if (!t) return null;
  if (t === t.toUpperCase() && /\p{L}/u.test(t)) {
    t = t
      .toLowerCase()
      .split(" ")
      .map((word) => (word ? word.charAt(0).toUpperCase() + word.slice(1) : word))
      .join(" ");
  }
  return t;
}

/**
 * Rennname aus `plan_name` („Marathon – Warschau Marathon – 27.09.2026"): Teil nach dem ersten
 * Gedankenstrich, abschließendes Datum abgeschnitten.
 */
export function raceNameFromPlanName(planName: string | null | undefined): string | null {
  if (typeof planName !== "string") return null;
  const parts = planName.split(/\s[–—-]\s/);
  if (parts.length < 2) return null;
  const rest = parts
    .slice(1)
    .filter((part) => !/^\s*\d{1,4}[./-]\d{1,2}([./-]\d{1,4})?\s*$/.test(part))
    .join(" – ")
    .trim();
  return rest || null;
}

/** `preferences.raceDate` („27.09.2026" aus dem Wizard, auch „2026-09-27") als YYYY-MM-DD; sonst null. */
function preferencesRaceYmd(raceDate: string | null | undefined): string | null {
  if (typeof raceDate !== "string") return null;
  const de = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(raceDate.trim());
  if (de) return `${de[3]}-${de[2].padStart(2, "0")}-${de[1].padStart(2, "0")}`;
  return /^\d{4}-\d{2}-\d{2}$/.test(raceDate.trim()) ? raceDate.trim() : null;
}

/**
 * Preferences sind global, nicht pro Plan. Gehören sie zu diesem Plan? Ja, wenn sie kein Renndatum
 * tragen (Alt-Bestand), ihr Renndatum der Renntag des Plans ist, oder ihr Rennname im `plan_name`
 * steht (der Wizard bildet ihn daraus — fängt KI-Pläne und verschobene Rennen).
 */
export function preferencesBelongToPlan(
  preferences: Pick<CompletionPreferences, "raceName" | "raceDate">,
  plan: { raceYmd?: string | null; planName?: string | null },
): boolean {
  const prefsYmd = preferencesRaceYmd(preferences.raceDate);
  if (prefsYmd == null || plan.raceYmd == null || prefsYmd === plan.raceYmd) return true;
  const name = typeof preferences.raceName === "string" ? preferences.raceName.trim() : "";
  return name !== "" && raceNameFromPlanName(plan.planName) === name;
}

export function resolveRaceName(args: {
  preferences: CompletionPreferences;
  raceSession: PlanSession | null;
  planName?: string | null;
  /** Renntag des Plans — `preferences.raceName` zählt nur, wenn die Preferences zu diesem Plan gehören. */
  raceYmd?: string | null;
}): string | null {
  const fromPrefs = typeof args.preferences.raceName === "string" ? args.preferences.raceName.trim() : "";
  if (fromPrefs && preferencesBelongToPlan(args.preferences, args)) return fromPrefs;
  const fromTitle = cleanRaceTitle(args.raceSession?.title);
  if (fromTitle) return fromTitle;
  return raceNameFromPlanName(args.planName);
}

export function resolveGoalSeconds(preferences: CompletionPreferences): number | null {
  if (preferences.raceGoal === "finish") return null;
  const sec = parseTargetTimeToSeconds(preferences.targetTime ?? null);
  return typeof sec === "number" && Number.isFinite(sec) && sec > 0 ? sec : null;
}

/** „Ziel: Sub 2:50" — auf die volle Minute AUFgerundet (2:49:50 → Sub 2:50, 3:00:00 → Sub 3:00). */
export function formatGoalLabel(goalSeconds: number): string {
  const totalMinutes = Math.ceil(goalSeconds / 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `Ziel: Sub ${h}:${String(m).padStart(2, "0")}`;
}

export function getPrepCompletionState(args: {
  plan: readonly PlanWeek[];
  logs: Readonly<Record<string, SessionLog>>;
  todayYmd: string;
  preferences: CompletionPreferences;
  planName?: string | null;
}): PrepCompletionState {
  const { plan, logs, todayYmd, preferences, planName } = args;
  const race = findGoalRaceSession(plan);

  if (race) {
    const raceDone = isSessionLogDone(logs?.[race.session.id]);
    const datePassed = todayYmd > race.ymd;
    if (!raceDone && !datePassed) return { status: "active" };
    const preferencesOwned = preferencesBelongToPlan(preferences, { raceYmd: race.ymd, planName });
    return {
      status: "completed",
      completedBy: raceDone ? "race_done" : "date_passed",
      raceSession: race.session,
      raceYmd: race.ymd,
      raceName: resolveRaceName({ preferences, raceSession: race.session, planName, raceYmd: race.ymd }),
      goalSeconds: preferencesOwned ? resolveGoalSeconds(preferences) : null,
      preferencesOwned,
    };
  }

  const lastYmd = lastWorkoutYmd(plan);
  if (!lastYmd || todayYmd <= lastYmd) return { status: "active" };
  const preferencesOwned = preferencesBelongToPlan(preferences, { raceYmd: lastYmd, planName });
  return {
    status: "completed",
    completedBy: "plan_ended",
    raceSession: null,
    raceYmd: lastYmd,
    raceName: resolveRaceName({ preferences, raceSession: null, planName, raceYmd: lastYmd }),
    goalSeconds: preferencesOwned ? resolveGoalSeconds(preferences) : null,
    preferencesOwned,
  };
}
