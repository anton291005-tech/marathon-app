/**
 * Per-calendar-day training load from completed plan sessions (Belastungskontext, nicht dominant).
 * Erwartet den **aktuellen** `logs`-Stand (nach Save) — gleiche Reihenfolge wie UI: zuerst Log speichern, dann Score.
 */

import { isSessionLogDone, parseSessionDateLabel } from "../appSmartFeatures";
import type { PlanSession, PlanWeek, SessionLog } from "../marathonPrediction";
import { getEffectiveKm } from "../marathonPrediction";
import { sanitizeDistance } from "../sanitizeDistance";
import { weekPlannedRunningKm } from "../weeklyAnalysis";
import { ymd } from "./recoveryCalendarUtils";

function intensityFactor(type: PlanSession["type"]): number {
  if (type === "interval" || type === "tempo" || type === "race") return 1.38;
  if (type === "long") return 1.12;
  if (type === "strength") return 0.85;
  if (type === "bike") return 0.75;
  return 1;
}

/** Summiert km-gewichtete Tageslast (ungefähr 0–50+). */
export function buildDailyTrainingLoadByDate(plan: PlanWeek[], logs: Record<string, SessionLog>): Map<string, number> {
  const m = new Map<string, number>();
  const rolling = { value: 8 };
  for (const week of plan) {
    const weekSessions = week.s ?? [];
    const wk = weekPlannedRunningKm(week);
    const weeklyAvgKm = wk > 0 ? wk / Math.max(1, weekSessions.filter((s) => s.type !== "rest").length) : wk;
    for (const session of weekSessions) {
      if (session.type === "rest") continue;
      const d = parseSessionDateLabel(session.date);
      if (!d) continue;
      if (!isSessionLogDone(logs[session.id])) continue;
      const raw = getEffectiveKm(session, logs[session.id]);
      const km = sanitizeDistance(raw, { weeklyAvgKm, rollingRef: rolling });
      const load = km * intensityFactor(session.type);
      const key = ymd(d);
      m.set(key, (m.get(key) ?? 0) + load);
    }
  }
  return m;
}

/** 0–100: höher = leichterer Tag / mehr Reserve im Belastungsfenster. */
export function trainingLoadSubscoreForDay(dailyLoad: number): number {
  return Math.max(36, Math.min(100, 100 - Math.min(48, dailyLoad * 1.05)));
}
