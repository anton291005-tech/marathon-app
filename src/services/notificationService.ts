import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import { getAppNow } from "../core/time/timeSystem";

export type NotificationSettings = {
  enabled: boolean;
  hour: number; // 0-23
  minute: number; // 0-59
};

const STORAGE_KEY = "myrace-notification-settings";
const NOTIFICATION_ID = 1001;

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

export async function scheduleTrainingReminder(
  settings: NotificationSettings,
  todayWorkoutTitle?: string
): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;

  await cancelTrainingReminder();

  if (!settings.enabled) return;

  const permission = await requestNotificationPermission();
  if (!permission) return;

  const body = todayWorkoutTitle
    ? `Heute: ${todayWorkoutTitle}`
    : "Dein Training wartet auf dich 💪";

  const now = getAppNow();
  const scheduled = new Date(now.getTime());
  scheduled.setHours(settings.hour, settings.minute, 0, 0);
  if (scheduled <= now) {
    scheduled.setDate(scheduled.getDate() + 1);
  }

  await LocalNotifications.schedule({
    notifications: [
      {
        id: NOTIFICATION_ID,
        title: "MyRace 🏃",
        body,
        schedule: {
          at: scheduled,
          repeats: true,
          every: "day",
        },
        sound: undefined,
        smallIcon: "ic_stat_icon_config_sample",
        iconColor: "#3b82f6",
      },
    ],
  });
}

export async function cancelTrainingReminder(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await LocalNotifications.cancel({
      notifications: [{ id: NOTIFICATION_ID }],
    });
  } catch {}
}
