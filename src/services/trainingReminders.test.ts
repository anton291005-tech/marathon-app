// Trainings-Erinnerungen: nur Tage mit offener Einheit, keine Ruhetage, nichts nach Plan-Ende.
import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import {
  REMINDER_BASE_ID,
  REMINDER_HORIZON_DAYS,
  buildTrainingReminders,
  cancelTrainingReminder,
  reminderScheduleKey,
  syncTrainingReminders,
  type ReminderSession,
} from "./notificationService";

jest.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: jest.fn() } }));
jest.mock("@capacitor/local-notifications", () => ({
  LocalNotifications: { getPending: jest.fn(), cancel: jest.fn(), schedule: jest.fn(), requestPermissions: jest.fn() },
}));

const ON = { enabled: true, hour: 8, minute: 0 };
const NOW = new Date(2026, 10, 11, 7, 0, 0); // Mi 11.11., 7 Uhr lokal

const s = (id: string, ymd: string, type: string, title: string): ReminderSession => ({ id, type, title, dateIso: `${ymd}T12:00:00.000Z` });

const PLAN: ReminderSession[] = [
  s("mo", "2026-11-09", "easy", "Lockerer Lauf"), // Vergangenheit
  s("mi", "2026-11-11", "rest", "Ruhetag"),
  s("do", "2026-11-12", "easy", "Lockerer Dauerlauf"),
  s("fr", "2026-11-13", "interval", "Intervalle 5 × 1000 m"),
  s("fr2", "2026-11-13", "strength", "Krafttraining"),
  s("so", "2026-11-15", "long", "Langer Lauf 18 km"),
  s("weit", "2026-12-20", "long", "Langer Lauf 30 km"), // jenseits des Horizonts
];

describe("buildTrainingReminders", () => {
  test("nur Tage mit offener Einheit, Titel im Text, Ruhetage und Vergangenheit ausgelassen", () => {
    const reminders = buildTrainingReminders({ sessions: PLAN, logs: {}, settings: ON, now: NOW });
    expect(reminders.map((r) => [r.id, r.at.getDate(), r.at.getHours(), r.body])).toEqual([
      [REMINDER_BASE_ID + 1, 12, 8, "Heute: Lockerer Dauerlauf"],
      [REMINDER_BASE_ID + 2, 13, 8, "Heute: Intervalle 5 × 1000 m und Krafttraining"],
      [REMINDER_BASE_ID + 4, 15, 8, "Heute: Langer Lauf 18 km"],
    ]);
  });

  test("heute nur, wenn die Uhrzeit noch kommt", () => {
    const today = [s("heute", "2026-11-11", "easy", "Lauf")];
    expect(buildTrainingReminders({ sessions: today, logs: {}, settings: ON, now: NOW })).toHaveLength(1);
    const late = new Date(2026, 10, 11, 9, 0, 0);
    expect(buildTrainingReminders({ sessions: today, logs: {}, settings: ON, now: late })).toEqual([]);
  });

  test("erledigte und ausgelassene Einheiten lösen keine Erinnerung aus", () => {
    const reminders = buildTrainingReminders({
      sessions: PLAN,
      logs: { do: { done: true }, fr: { skipped: true } },
      settings: ON,
      now: NOW,
    });
    expect(reminders.map((r) => r.body)).toEqual(["Heute: Krafttraining", "Heute: Langer Lauf 18 km"]);
  });

  test("nach Plan-Ende und bei ausgeschalteter Erinnerung: keine", () => {
    const afterRace = new Date(2027, 0, 5, 7, 0, 0);
    expect(buildTrainingReminders({ sessions: PLAN, logs: {}, settings: ON, now: afterRace })).toEqual([]);
    expect(buildTrainingReminders({ sessions: PLAN, logs: {}, settings: { ...ON, enabled: false }, now: NOW })).toEqual([]);
  });

  test("IDs bleiben im Bereich der Erinnerungen, Schlüssel ändert sich mit dem Zeitplan", () => {
    const daily = Array.from({ length: 30 }, (_, i) => s(`d${i}`, `2026-11-${String(12 + (i % 18)).padStart(2, "0")}`, "easy", "Lauf"));
    const reminders = buildTrainingReminders({ sessions: daily, logs: {}, settings: ON, now: NOW });
    for (const r of reminders) {
      expect(r.id).toBeGreaterThanOrEqual(REMINDER_BASE_ID);
      expect(r.id).toBeLessThan(REMINDER_BASE_ID + REMINDER_HORIZON_DAYS);
    }
    const a = reminderScheduleKey(buildTrainingReminders({ sessions: PLAN, logs: {}, settings: ON, now: NOW }));
    const b = reminderScheduleKey(buildTrainingReminders({ sessions: PLAN, logs: { do: { done: true } }, settings: ON, now: NOW }));
    expect(a).not.toBe(b);
  });
});

describe("syncTrainingReminders", () => {
  const isNative = Capacitor.isNativePlatform as jest.Mock;
  const cancel = LocalNotifications.cancel as jest.Mock;
  const schedule = LocalNotifications.schedule as jest.Mock;
  const permissions = LocalNotifications.requestPermissions as jest.Mock;

  beforeEach(() => {
    isNative.mockReturnValue(true);
    cancel.mockResolvedValue(undefined);
    schedule.mockResolvedValue(undefined);
    permissions.mockResolvedValue({ display: "granted" });
  });

  test("bestellt alle Erinnerungs-IDs ab (inkl. der alten täglichen 1001) und plant einmalig ohne Wiederholung", async () => {
    const reminders = buildTrainingReminders({ sessions: PLAN, logs: {}, settings: ON, now: NOW });
    await syncTrainingReminders(reminders);
    const cancelled = cancel.mock.calls[0][0].notifications.map((n: { id: number }) => n.id);
    expect(cancelled).toContain(1001);
    expect(cancelled).toHaveLength(REMINDER_HORIZON_DAYS);
    const scheduled = schedule.mock.calls[0][0].notifications;
    expect(scheduled).toHaveLength(3);
    for (const n of scheduled) expect(n.schedule).not.toHaveProperty("repeats");
  });

  test("leerer Zeitplan: nur abbestellen, keine Berechtigungsabfrage", async () => {
    await syncTrainingReminders([]);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(permissions).not.toHaveBeenCalled();
    expect(schedule).not.toHaveBeenCalled();
  });

  test("cancelTrainingReminder im Web: nichts", async () => {
    isNative.mockReturnValue(false);
    await cancelTrainingReminder();
    expect(cancel).not.toHaveBeenCalled();
  });
});
