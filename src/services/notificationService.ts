import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import {
  allTrainingReminderIds,
  LEGACY_DAILY_REMINDER_ID,
  type PlannedTrainingReminder,
} from "./trainingReminderSchedule";

export type NotificationSettings = {
  enabled: boolean;
  hour: number; // 0-23
  minute: number; // 0-59
};

const STORAGE_KEY = "myrace-notification-settings";

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

async function hasNotificationPermission(): Promise<boolean> {
  const { display } = await LocalNotifications.checkPermissions();
  return display === "granted";
}

async function cancelIds(ids: number[]): Promise<void> {
  try {
    await LocalNotifications.cancel({ notifications: ids.map((id) => ({ id })) });
  } catch {}
}

/** Läufe nacheinander: ein Storno darf nie eine gerade laufende Neuplanung überholen. */
let queue: Promise<void> = Promise.resolve();

function enqueue(job: () => Promise<void>): Promise<void> {
  queue = queue.then(job).catch((e) => {
    // eslint-disable-next-line no-console
    console.warn("[trainingReminder] sync failed", e);
  });
  return queue;
}

/**
 * Ersetzt alle ausstehenden Trainings-Erinnerungen durch `reminders` (Einzel-Notifications, keine
 * Wiederholung). Storniert immer zuerst — auch die alte tägliche id 1001. Schalter aus, keine
 * Berechtigung oder leere Liste: es bleibt nichts ausstehend.
 */
export function syncTrainingReminders(
  settings: NotificationSettings,
  reminders: readonly PlannedTrainingReminder[],
): Promise<void> {
  if (!Capacitor.isNativePlatform()) return Promise.resolve();
  return enqueue(async () => {
    await cancelIds(allTrainingReminderIds());
    if (!settings.enabled || reminders.length === 0) return;
    if (!(await hasNotificationPermission())) return;
    await LocalNotifications.schedule({
      notifications: reminders.map((reminder) => ({
        id: reminder.id,
        title: "MyRace 🏃",
        body: "Dein Training wartet auf dich 💪",
        schedule: { at: reminder.at },
        sound: undefined,
        smallIcon: "ic_stat_icon_config_sample",
        iconColor: "#3b82f6",
      })),
    });
  });
}

/** Storniert alle Trainings-Erinnerungen (alt + Fenster). */
export function cancelTrainingReminder(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return Promise.resolve();
  return enqueue(() => cancelIds(allTrainingReminderIds()));
}

/** Nur die alte, täglich wiederholende Erinnerung stornieren (Altbestand, auch ohne geladenen Plan). */
export function cancelLegacyDailyReminder(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return Promise.resolve();
  return enqueue(() => cancelIds([LEGACY_DAILY_REMINDER_ID]));
}
