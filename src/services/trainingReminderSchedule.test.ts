import type { PlanWeek } from "../marathonPrediction";
import { getPrepCompletionState } from "../prepRecap/prepCompletionState";
import {
  allTrainingReminderIds,
  collectOpenSessionDays,
  LEGACY_DAILY_REMINDER_ID,
  planTrainingReminders,
  TRAINING_REMINDER_ID_BASE,
  TRAINING_REMINDER_WINDOW_DAYS,
} from "./trainingReminderSchedule";

const session = (id: string, dateIso: string, type = "easy") => ({ id, day: "", date: "", dateIso, type, title: id, km: 8 });

const plan = [
  {
    wn: 11,
    s: [
      session("a", "2026-09-21", "rest"),
      session("b", "2026-09-22"),
      session("c", "2026-09-23", "interval"),
      session("c2", "2026-09-23", "strength"),
      session("d", "2026-09-24", "rest"),
      session("e", "2026-09-25"),
    ],
  },
  { wn: 12, s: [session("f", "2026-09-26", "rest"), session("race", "2026-09-27", "race")] },
] as unknown as PlanWeek[];

const time = { hour: 8, minute: 0 };
const at = (y: number, m: number, d: number, h = 6, min = 0) => new Date(y, m - 1, d, h, min, 0, 0);
const completedOn = (todayYmd: string, logs = {}) =>
  getPrepCompletionState({ plan, logs, todayYmd, preferences: {} as any }).status === "completed";

describe("collectOpenSessionDays", () => {
  it("Plan läuft: nur Tage mit geplanter Session, Ruhetage nie, ein Tag nur einmal", () => {
    expect(collectOpenSessionDays({ plan, logs: {}, prepCompleted: false })).toEqual([
      "2026-09-22",
      "2026-09-23",
      "2026-09-25",
      "2026-09-27",
    ]);
  });

  it("erledigte und übersprungene Sessions sind nicht mehr offen", () => {
    const logs = { b: { done: true }, e: { skipped: true }, c: { assignedRun: { runId: "r1" } } } as any;
    // 23.09. bleibt: die zweite Session des Tages ist noch offen.
    expect(collectOpenSessionDays({ plan, logs, prepCompleted: false })).toEqual(["2026-09-23", "2026-09-27"]);
    expect(collectOpenSessionDays({ plan, logs: { ...logs, c2: { done: true } }, prepCompleted: false })).toEqual([
      "2026-09-27",
    ]);
  });

  it("Plan abgeschlossen (Renntag vorbei oder Rennen abgehakt): keine Erinnerungstage", () => {
    expect(completedOn("2026-09-27")).toBe(false);
    expect(completedOn("2026-09-28")).toBe(true);
    expect(collectOpenSessionDays({ plan, logs: {}, prepCompleted: completedOn("2026-09-28") })).toEqual([]);
    const raceDone = { race: { done: true } };
    expect(collectOpenSessionDays({ plan, logs: raceDone, prepCompleted: completedOn("2026-09-27", raceDone) })).toEqual([]);
  });

  it("kein Plan (gelöscht/leer): keine Erinnerungstage", () => {
    expect(collectOpenSessionDays({ plan: [], logs: {}, prepCompleted: false })).toEqual([]);
  });
});

describe("planTrainingReminders", () => {
  const days = collectOpenSessionDays({ plan, logs: {}, prepCompleted: false });

  it("eine Einzel-Erinnerung pro Session-Tag zur eingestellten Zeit, fortlaufende IDs", () => {
    const planned = planTrainingReminders({ sessionDays: days, time, now: at(2026, 9, 21) });
    expect(planned.map((r) => r.ymd)).toEqual(days);
    expect(planned.map((r) => r.id)).toEqual([0, 1, 2, 3].map((i) => TRAINING_REMINDER_ID_BASE + i));
    expect(planned[0].at).toEqual(at(2026, 9, 22, 8, 0));
  });

  it("heute nach der Erinnerungszeit: entfällt, wird nicht auf den nächsten Tag geschoben", () => {
    const before = planTrainingReminders({ sessionDays: days, time, now: at(2026, 9, 22, 7, 59) });
    expect(before[0].ymd).toBe("2026-09-22");
    const after = planTrainingReminders({ sessionDays: days, time, now: at(2026, 9, 22, 8, 0) });
    expect(after.map((r) => r.ymd)).toEqual(["2026-09-23", "2026-09-25", "2026-09-27"]);
  });

  it("nach dem Renntag: nichts mehr, auch ohne Abschluss-Flag", () => {
    expect(planTrainingReminders({ sessionDays: days, time, now: at(2026, 9, 28) })).toEqual([]);
  });

  it("rollendes Fenster: höchstens 14 Tage voraus, weit unter dem iOS-Limit von 64", () => {
    const daily: string[] = [];
    for (let i = 0; i < 120; i += 1) {
      const d = new Date(2026, 5, 1 + i, 12);
      daily.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
    }
    const planned = planTrainingReminders({ sessionDays: daily, time, now: at(2026, 6, 10) });
    expect(planned).toHaveLength(TRAINING_REMINDER_WINDOW_DAYS);
    expect(planned[0].ymd).toBe("2026-06-10");
    expect(planned[planned.length - 1].ymd).toBe("2026-06-23");
    expect(new Set(planned.map((r) => r.id)).size).toBe(planned.length);
    expect(allTrainingReminderIds()).toEqual(expect.arrayContaining(planned.map((r) => r.id)));
    expect(allTrainingReminderIds()).toContain(LEGACY_DAILY_REMINDER_ID);
    expect(allTrainingReminderIds().length).toBeLessThan(64);
  });

  it("über Monats- und Jahreswechsel", () => {
    const planned = planTrainingReminders({ sessionDays: ["2026-12-30", "2027-01-02", "2027-01-20"], time, now: at(2026, 12, 29) });
    expect(planned.map((r) => r.ymd)).toEqual(["2026-12-30", "2027-01-02"]);
    expect(planned[1].at).toEqual(at(2027, 1, 2, 8, 0));
  });
});
