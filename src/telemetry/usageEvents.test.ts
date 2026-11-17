import { freezeTimeForTests } from "../core/time/timeSystem";
import {
  __setUsageEventSinkForTests,
  countNewlyCompletedSessions,
  isUsageEventsEnabled,
  sanitizeUsageEventProps,
  setUsageEventsEnabled,
  trackCompletedSessions,
  trackUsageEvent,
  USAGE_EVENT_NAMES,
  type UsageEventRow,
} from "./usageEvents";

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("trackUsageEvent", () => {
  let sent: UsageEventRow[];

  beforeEach(() => {
    localStorage.clear();
    sent = [];
    __setUsageEventSinkForTests(async (row) => {
      sent.push(row);
    });
    freezeTimeForTests(new Date("2026-11-17T08:00:00"));
  });

  afterEach(() => {
    __setUsageEventSinkForTests(null);
    freezeTimeForTests(null);
  });

  it("kennt genau die vereinbarten Ereignisse", () => {
    expect([...USAGE_EVENT_NAMES].sort()).toEqual(
      [
        "app_open",
        "feedback_sent",
        "onboarding_done",
        "session_completed",
        "shift_entries_saved",
        "shift_proposal_accepted",
        "shift_proposal_declined",
        "shift_proposal_shown",
      ].sort(),
    );
  });

  it("sendet Ereignis mit gekürzten Props", async () => {
    trackUsageEvent("session_completed", { source: "manual" });
    trackUsageEvent("shift_entries_saved", { count: 28 });
    trackUsageEvent("onboarding_done");
    await flush();
    expect(sent).toEqual([
      { name: "session_completed", props: { source: "manual" } },
      { name: "shift_entries_saved", props: { count: 28 } },
      { name: "onboarding_done", props: {} },
    ]);
  });

  it("lässt keinen Freitext und keine Gesundheitswerte durch", () => {
    expect(
      sanitizeUsageEventProps("session_completed", { source: "apple_health", heartRate: 150, notes: "Knie tut weh" }),
    ).toEqual({ source: "apple_health" });
    expect(sanitizeUsageEventProps("feedback_sent", { message: "geheim" })).toEqual({});
    expect(sanitizeUsageEventProps("session_completed", { source: "garmin" })).toBeNull();
    expect(sanitizeUsageEventProps("shift_entries_saved", { count: "viele" })).toBeNull();
  });

  it("verwirft unbekannte Namen", async () => {
    (trackUsageEvent as (name: string) => void)("screen_view");
    await flush();
    expect(sent).toEqual([]);
  });

  it("drosselt app_open auf einmal pro Stunde", async () => {
    trackUsageEvent("app_open");
    freezeTimeForTests(new Date("2026-11-17T08:59:00"));
    trackUsageEvent("app_open");
    freezeTimeForTests(new Date("2026-11-17T09:00:01"));
    trackUsageEvent("app_open");
    await flush();
    expect(sent.map((r) => r.name)).toEqual(["app_open", "app_open"]);
  });

  it("ist abschaltbar und merkt sich die Wahl", async () => {
    expect(isUsageEventsEnabled()).toBe(true);
    setUsageEventsEnabled(false);
    trackUsageEvent("onboarding_done");
    await flush();
    expect(sent).toEqual([]);
    expect(isUsageEventsEnabled()).toBe(false);
    setUsageEventsEnabled(true);
    trackUsageEvent("onboarding_done");
    await flush();
    expect(sent).toHaveLength(1);
  });

  it("wirft nie, auch wenn das Senden scheitert", async () => {
    __setUsageEventSinkForTests(async () => {
      throw new Error("offline");
    });
    expect(() => trackUsageEvent("feedback_sent")).not.toThrow();
    await flush();
  });

  it("wirft nie, wenn der Speicher gesperrt ist", () => {
    const spy = jest.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    expect(() => trackUsageEvent("app_open")).not.toThrow();
    spy.mockRestore();
  });

  it("zählt neu erledigte Einheiten je Quelle", async () => {
    const before = { a: { done: true }, b: { done: false }, c: {} };
    const after = { a: { done: true }, b: { done: true }, c: { done: true }, d: { skipped: true } };
    expect(countNewlyCompletedSessions(before, after)).toBe(2);
    trackCompletedSessions(before, after, "apple_health");
    await flush();
    expect(sent).toEqual([
      { name: "session_completed", props: { source: "apple_health" } },
      { name: "session_completed", props: { source: "apple_health" } },
    ]);
  });
});
