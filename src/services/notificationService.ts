import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import { sessionYmd } from "../core/time/sessionDate";
import { getSessionStatus } from "../sessionStatus";

export type NotificationSettings = {
  enabled: boolean;
  hour: number; // 0-23
  minute: number; // 0-59
};

const STORAGE_KEY = "myrace-notification-settings";

/**
 * Trainings-Erinnerungen: je eine einmalige Notification pro Tag mit offener Einheit in den nächsten
 * `REMINDER_HORIZON_DAYS` Tagen, IDs `REMINDER_BASE_ID + Tagesoffset`. Früher war es eine einzige, täglich
 * wiederholte Notification (id 1001) — sie feuerte auch an Ruhetagen und nach Plan-Ende weiter.
 * Neu geplant wird bei jedem App-Start und jeder Änderung an Plan, Einträgen oder Einstellung (AppMain);
 * nach Plan-Ende gibt es keine offenen Einheiten mehr und damit keine Erinnerung.
 */
export const REMINDER_BASE_ID = 1001;
export const REMINDER_HORIZON_DAYS = 14;
const REMINDER_IDS = Array.from({ length: REMINDER_HORIZON_DAYS }, (_, i) => REMINDER_BASE_ID + i);

export function loadNotificationSettings(): NotificationSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { enabled: false, hour: 8, minute: 0 };
}

export function saveNotificationSettings(settings: NotificationSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;
  const { display } = await LocalNotifications.requestPermissions();
  return display === "granted";
}

export type ReminderSession = {
  id: string;
  type?: string | null;
  title?: string | null;
  date?: string | null;
  dateIso?: string | null;
};
export type ReminderLog = { done?: boolean; skipped?: boolean; assignedRun?: { runId?: string } | null } | null | undefined;
export type TrainingReminder = { id: number; at: Date; body: string };

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function localYmd(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * Reiner Zeitplan: für heute (falls die Uhrzeit noch kommt) und die folgenden Tage bis zum Horizont je eine
 * Erinnerung, wenn an dem Tag mindestens eine offene Einheit (kein Ruhetag, nicht erledigt, nicht ausgelassen) liegt.
 */
export function buildTrainingReminders(args: {
  sessions: readonly ReminderSession[];
  logs: Readonly<Record<string, ReminderLog>>;
  settings: NotificationSettings;
  now: Date;
}): TrainingReminder[] {
  const { sessions, logs, settings, now } = args;
  if (!settings.enabled) return [];

  const titlesByYmd = new Map<string, string[]>();
  for (const session of sessions) {
    if (!session || session.type === "rest") continue;
    if (getSessionStatus(logs[session.id]) !== "open") continue;
    const ymd = sessionYmd(session);
    if (!ymd) continue;
    const title = (session.title ?? "").trim() || "Training";
    const list = titlesByYmd.get(ymd) ?? [];
    list.push(title);
    titlesByYmd.set(ymd, list);
  }

  const reminders: TrainingReminder[] = [];
  for (let offset = 0; offset < REMINDER_HORIZON_DAYS; offset += 1) {
    const at = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset, settings.hour, settings.minute, 0, 0);
    if (at.getTime() <= now.getTime()) continue;
    const titles = titlesByYmd.get(localYmd(at));
    if (!titles?.length) continue;
    reminders.push({ id: REMINDER_BASE_ID + offset, at, body: `Heute: ${titles.join(" und ")}` });
  }
  return reminders;
}

/** Ersetzt alle geplanten Trainings-Erinnerungen durch `reminders` (leer = alle abbestellen). */
export async function syncTrainingReminders(reminders: readonly TrainingReminder[]): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  await cancelTrainingReminder();
  if (reminders.length === 0) return;

  const permission = await requestNotificationPermission();
  if (!permission) return;

  await LocalNotifications.schedule({
    notifications: reminders.map((reminder) => ({
      id: reminder.id,
      title: "MyRace",
      body: reminder.body,
      schedule: { at: reminder.at, allowWhileIdle: true },
      sound: undefined,
      smallIcon: "ic_stat_icon_config_sample",
      iconColor: "#3b82f6",
    })),
  });
}

/** Bestellt alle Trainings-Erinnerungen ab (inkl. der früheren, täglich wiederholten id 1001). */
export async function cancelTrainingReminder(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await LocalNotifications.cancel({
      notifications: REMINDER_IDS.map((id) => ({ id })),
    });
  } catch {}
}

/** Stabiler Schlüssel des Zeitplans: AppMain plant nur neu, wenn er sich ändert (nicht bei jedem Render). */
export function reminderScheduleKey(reminders: readonly TrainingReminder[]): string {
  return reminders.map((r) => `${r.id}@${r.at.getTime()}:${r.body}`).join("|");
}

/**
 * Bestellt ALLE ausstehenden lokalen Notifications der App ab (Abmelden, Konto löschen) —
 * nicht nur die Trainings-Erinnerung, damit nach dem Ende der Sitzung nichts mehr feuert.
 */
export async function cancelAllPendingNotifications(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const pending = await LocalNotifications.getPending();
    const ids = (pending?.notifications ?? []).map((n) => ({ id: n.id }));
    if (ids.length > 0) await LocalNotifications.cancel({ notifications: ids });
  } catch {}
  await cancelTrainingReminder();
}


/**
 * Check-in-Erinnerung (Readiness Spec §6.1): eine tägliche Notification mit eigener ID, neutraler Text ohne
 * Gesundheitsinhalt (Sperrbildschirm), keine zweite, keine Mahnung. Geplant nur, wenn der Check-in aktiv ist und
 * der Nutzer den Gesundheitsangaben zugestimmt hat (AppMain).
 */
export const CHECKIN_REMINDER_ID = 2001;
export const CHECKIN_REMINDER_TEXT = "Wie geht es dir heute?";
const CHECKIN_REMINDER_KEY = "myrace-checkin-reminder";

export function loadCheckInReminderSettings(): NotificationSettings {
  try {
    const raw = localStorage.getItem(CHECKIN_REMINDER_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { enabled: true, hour: 7, minute: 30 };
}

export function saveCheckInReminderSettings(settings: NotificationSettings): void {
  try {
    localStorage.setItem(CHECKIN_REMINDER_KEY, JSON.stringify(settings));
  } catch {}
}

/** Plant die tägliche Check-in-Erinnerung neu bzw. bestellt sie ab (`enabled: false`). */
export async function syncCheckInReminder(settings: NotificationSettings): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await LocalNotifications.cancel({ notifications: [{ id: CHECKIN_REMINDER_ID }] });
  } catch {}
  if (!settings.enabled) return;
  const permission = await requestNotificationPermission();
  if (!permission) return;
  await LocalNotifications.schedule({
    notifications: [
      {
        id: CHECKIN_REMINDER_ID,
        title: "MyRace",
        body: CHECKIN_REMINDER_TEXT,
        schedule: { on: { hour: settings.hour, minute: settings.minute }, repeats: true, allowWhileIdle: true },
        smallIcon: "ic_stat_icon_config_sample",
        iconColor: "#3b82f6",
      },
    ],
  });
}
