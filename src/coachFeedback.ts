/**
 * Kurze, datenbasierte Coach-Hinweise (2–4) für unter die Prognose.
 * Nutzt 42-Tage-Fenster wie die Prognose + getConsistencyStats vom Aufrufer.
 */

import { isSessionLogDone } from "./appSmartFeatures";
import { getTrainingWindowData, isScheduledOnOrBeforeToday, getEffectiveKm, type PlanWeek, type SessionLog } from "./marathonPrediction";
import { getAppNow } from "./core/time/timeSystem";

export type ConsistencyStats = {
  weeklyStreak: number;
  sessionStreak: number;
};

/** Obergrenze der Long-Run-Schwelle für den Marathon-Hinweis (marathonrelevantes Volumen). */
const MARATHON_LONG_RUN_HINT_KM = 28;

/**
 * Schwelle für den Long-Run-Hinweis: höchstens 28 km, aber nie mehr als der längste geplante Long Run des ganzen Plans
 * (Plan-Kern Schritt 11). `null` = kein Hinweis: keine Marathon-Vorbereitung oder kein Long Run im Plan.
 */
export function longRunHintThresholdKm(plan: PlanWeek[], raceDistanceKm: number | null | undefined): number | null {
  if (typeof raceDistanceKm !== "number" || raceDistanceKm < 42) return null;
  let longest = 0;
  plan.forEach((week) =>
    (week.s ?? []).forEach((session) => {
      if (session.type === "long" && typeof session.km === "number") longest = Math.max(longest, session.km);
    }),
  );
  return longest > 0 ? Math.min(MARATHON_LONG_RUN_HINT_KM, longest) : null;
}

const formatKmDe = (km: number): string => String(Math.round(km * 10) / 10).replace(".", ",");

export function getCoachFeedback(args: {
  plan: PlanWeek[];
  logs: Record<string, SessionLog>;
  consistencyStats: ConsistencyStats;
  /** Renndistanz der Vorbereitung (Preferences); der Long-Run-Hinweis gilt nur für den Marathon. */
  raceDistanceKm?: number | null;
  now?: Date;
}): string[] {
  const now = args.now ?? getAppNow();
  const entries = getTrainingWindowData(args.plan, args.logs, now);
  const hints: string[] = [];

  const pastTrainable = entries.filter(
    (e) => e.session.type !== "rest" && isScheduledOnOrBeforeToday(e.date, now)
  );

  // Long Runs ab der Schwelle im Fenster: nur beim Marathon, Schwelle aus dem Plan (höchstens 28 km).
  const longThreshold = longRunHintThresholdKm(args.plan, args.raceDistanceKm);
  if (longThreshold !== null) {
    const longPlanned = pastTrainable.some((e) => e.session.type === "long" && e.session.km >= longThreshold);
    const longDone = pastTrainable.filter(
      (e) => e.session.type === "long" && e.session.km >= longThreshold && isSessionLogDone(e.log)
    ).length;
    const label = formatKmDe(longThreshold);
    if (longPlanned && longDone === 0) {
      hints.push(`Dir fehlt aktuell ein abgeschlossener Long Run ab ${label} km im 42-Tage-Fenster.`);
    } else if (!longPlanned && pastTrainable.some((e) => e.session.type === "long")) {
      const maxLong = Math.max(
        0,
        ...pastTrainable.filter((e) => e.session.type === "long").map((e) => e.session.km || 0)
      );
      if (maxLong > 0 && maxLong < longThreshold && longDone === 0) {
        hints.push(`Deine Long Runs liegen noch unter ${label} km — für die Marathonbasis lohnt sich mehr Distanz.`);
      }
    }
  }

  // Letzte 14 Tage: Konstanz
  const cutoff14 = new Date(now);
  cutoff14.setHours(0, 0, 0, 0);
  cutoff14.setDate(cutoff14.getDate() - 14);
  const e14 = pastTrainable.filter((e) => e.date.getTime() >= cutoff14.getTime());
  if (e14.length >= 4) {
    const done14 = e14.filter((e) => isSessionLogDone(e.log)).length;
    const rate = done14 / e14.length;
    if (rate >= 0.82) {
      hints.push("Gute Konstanz in den letzten 14 Tagen.");
    } else if (rate < 0.55) {
      hints.push("In den letzten 14 Tagen war die Erledigungsquote niedrig — Rhythmus suchen.");
    }
  }

  // Verpasste Einheiten (fällig, weder done noch skipped)
  if (pastTrainable.length > 0) {
    const missed = pastTrainable.filter((e) => !isSessionLogDone(e.log) && !e.log?.skipped).length;
    const missRatio = missed / pastTrainable.length;
    if (missRatio > 0.2) {
      hints.push("Viele geplante Einheiten sind noch offen — das drückt Formgefühl und Prognose.");
    }
  }

  // Ist-km vs. geplant (nur erledigte Laufrubriken mit km)
  let plannedKm = 0;
  let actualKm = 0;
  for (const e of pastTrainable) {
    if (e.plannedKmEquiv <= 0) continue;
    plannedKm += e.plannedKmEquiv;
    if (isSessionLogDone(e.log)) {
      actualKm += getEffectiveKm(e.session, e.log);
    }
  }
  if (plannedKm > 35 && actualKm < plannedKm * 0.78) {
    hints.push("Deine Ist-Kilometer liegen im Fenster deutlich unter dem Plan.");
  }

  // Intensiv vs. Easy (erledigt, 14 Tage)
  const doneSessions14 = e14.filter((e) => isSessionLogDone(e.log));
  const intense14 = doneSessions14.filter((e) =>
    ["interval", "tempo", "race"].includes(e.session.type)
  ).length;
  const easy14 = doneSessions14.filter((e) => e.session.type === "easy").length;
  if (intense14 >= 2 && easy14 <= 1 && doneSessions14.length >= 3) {
    hints.push("Relativ viele intensive Einheiten im Verhältnis zu Easy — auf leichte Tage achten.");
  }

  // Streak aus bestehender App-Logik
  if (args.consistencyStats.sessionStreak >= 6) {
    hints.push(`${args.consistencyStats.sessionStreak} Tage in Folge mit erledigtem Plan — solide Serie.`);
  }

  // Fallback, damit nie komplett leer (wenn Prognose schon da ist)
  if (hints.length === 0) {
    hints.push("Halte Easy-Tage wirklich leicht und Qualitätseinheiten präzise.");
  }

  return hints.slice(0, 4);
}
