/**
 * Welche Trainings-Erinnerungen stehen an? Reine Planung, ohne Capacitor.
 *
 * Früher lief EINE täglich wiederholende Notification (id 1001) — die kennt den Plan nicht und feuert
 * an Ruhetagen und nach Plan-Ende weiter. Jetzt: eine Einzel-Notification pro Tag mit offener,
 * geplanter Session des aktiven Plans, für ein rollendes Fenster. iOS hält höchstens 64 ausstehende
 * Local Notifications pro App; das Fenster bleibt mit 14 weit darunter.
 */

import { isSessionLogDone } from "../appSmartFeatures";
import { sessionDayIso } from "../ai/mutations/sessionDayIso";
import type { PlanWeek, SessionLog } from "../marathonPrediction";
import { getAppCalendarYmd } from "../core/time/timeSystem";

/** Rollendes Fenster in Tagen (heute = Tag 0). Neu geplant bei App-Start, Resume und jeder Planänderung. */
export const TRAINING_REMINDER_WINDOW_DAYS = 14;

/** Die alte, täglich wiederholende Erinnerung — wird bei jeder Neuplanung storniert. */
export const LEGACY_DAILY_REMINDER_ID = 1001;

/** Einzel-Erinnerungen belegen `BASE … BASE + WINDOW - 1`. */
export const TRAINING_REMINDER_ID_BASE = 1100;

export type TrainingReminderTime = { hour: number; minute: number };

export type PlannedTrainingReminder = { id: number; ymd: string; at: Date };

/** Alle IDs, die je eine Trainings-Erinnerung tragen kann (alt + Fenster). */
export function allTrainingReminderIds(): number[] {
  const ids = [LEGACY_DAILY_REMINDER_ID];
  for (let i = 0; i < TRAINING_REMINDER_WINDOW_DAYS; i += 1) ids.push(TRAINING_REMINDER_ID_BASE + i);
  return ids;
}

/**
 * Tage (YYYY-MM-DD, aufsteigend, ohne Duplikate) mit mindestens einer offenen, geplanten Session des
 * aktiven Plans. Ruhetage, erledigte und übersprungene Sessions zählen nicht. Ist die Vorbereitung
 * abgeschlossen (`getPrepCompletionState`), gibt es keine Erinnerungstage mehr.
 */
export function collectOpenSessionDays(args: {
  plan: readonly PlanWeek[];
  logs: Readonly<Record<string, SessionLog>>;
  prepCompleted: boolean;
}): string[] {
  if (args.prepCompleted) return [];
  const days = new Set<string>();
  for (const week of args.plan ?? []) {
    if (!week || typeof week !== "object") continue;
    for (const session of week.s ?? []) {
      if (!session || session.type === "rest") continue;
      const log = args.logs?.[session.id];
      if (isSessionLogDone(log) || log?.skipped) continue;
      const ymd = sessionDayIso(session);
      if (ymd) days.add(ymd);
    }
  }
  return Array.from(days).sort();
}

function atLocalTime(ymd: string, time: TrainingReminderTime): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), time.hour, time.minute, 0, 0);
}

/**
 * Einzel-Erinnerungen für die Session-Tage im Fenster `heute … heute + WINDOW - 1`. Ein Zeitpunkt, der
 * schon vorbei ist (heute nach der Erinnerungszeit), entfällt — er wird nicht auf morgen geschoben.
 */
export function planTrainingReminders(args: {
  sessionDays: readonly string[];
  time: TrainingReminderTime;
  now: Date;
  windowDays?: number;
}): PlannedTrainingReminder[] {
  const windowDays = Math.min(args.windowDays ?? TRAINING_REMINDER_WINDOW_DAYS, TRAINING_REMINDER_WINDOW_DAYS);
  const { now } = args;
  const todayYmd = getAppCalendarYmd(now);
  const lastYmd = getAppCalendarYmd(
    new Date(now.getFullYear(), now.getMonth(), now.getDate() + windowDays - 1, 12, 0, 0, 0),
  );
  const planned: PlannedTrainingReminder[] = [];
  for (const ymd of Array.from(new Set(args.sessionDays)).sort()) {
    if (ymd < todayYmd || ymd > lastYmd) continue;
    const at = atLocalTime(ymd, args.time);
    if (!at || at.getTime() <= now.getTime()) continue;
    planned.push({ id: TRAINING_REMINDER_ID_BASE + planned.length, ymd, at });
  }
  return planned;
}
