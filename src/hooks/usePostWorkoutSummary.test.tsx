import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { freezeTimeForTests } from "../core/time/timeSystem";
import { isEligibleWorkout, usePostWorkoutSummary } from "./usePostWorkoutSummary";
import { PostWorkoutSummaryCard } from "../components/PostWorkoutSummaryCard";
import type { StoredHealthRun } from "../healthRuns";

function Harness(props: {
  activeView?: string;
  planSessions: any[];
  logs: Record<string, any>;
  healthRuns?: StoredHealthRun[];
  maxHeartRateBpm?: number;
  aiAnalysisEnabled?: boolean;
  recoveryPoints?: Array<{ date: string; score0_100: number }>;
}) {
  const { visible, summary, dismiss } = usePostWorkoutSummary({
    activeView: props.activeView ?? "home",
    planSessions: props.planSessions,
    logs: props.logs,
    healthRuns: props.healthRuns ?? [],
    maxHeartRateBpm: props.maxHeartRateBpm ?? 190,
    aiAnalysisEnabled: props.aiAnalysisEnabled,
    recoveryPoints: props.recoveryPoints ?? null,
  });
  return summary ? <PostWorkoutSummaryCard open={visible} summary={summary} onDone={dismiss} /> : null;
}

describe("usePostWorkoutSummary trigger logic", () => {
  beforeEach(() => {
    localStorage.clear();
    freezeTimeForTests(null);
  });

  test("isEligibleWorkout is strict (no silent fallback)", () => {
    expect(isEligibleWorkout("running")).toBe(true);
    expect(isEligibleWorkout("cycling")).toBe(true);
    expect(isEligibleWorkout("runningtreadmill")).toBe(false);
    expect(isEligibleWorkout("")).toBe(false);
    expect(isEligibleWorkout("strengthTraining")).toBe(false);
  });

  test("card appears exactly once on first open after workout (same day)", async () => {
    // App opens at 12:00
    freezeTimeForTests(new Date("2026-05-01T12:00:00.000Z"));

    const planSessions = [{ id: "s1", date: "1. Mai", type: "easy", title: "Easy", pace: "5:00–5:20/km", km: 10 }];
    const logs = {
      s1: {
        done: true,
        at: "2026-05-01T08:00:00.000Z", // completed BEFORE app open
        assignedRun: { runId: "hk_run_1", duration: 3000, distanceKm: 10 },
      },
    };
    const healthRuns: StoredHealthRun[] = [
      {
        runId: "hk_run_1",
        startDate: "2026-05-01T07:10:00.000Z",
        duration: 3000,
        distanceMeters: 10_000,
        distanceUnknown: false,
        workoutType: "running",
        sourceName: "Apple Health",
        avgHeartRateBpm: 150,
      },
    ];

    const { rerender } = render(<Harness planSessions={planSessions} logs={logs} healthRuns={healthRuns} />);
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(await screen.findByText(/AI Coach/i)).toBeInTheDocument();

    fireEvent.click(screen.getByText("Fertig"));
    expect(screen.queryByRole("dialog")).toBeNull();

    // Same app open / rerender should not show again (persisted immediately on show)
    rerender(<Harness planSessions={planSessions} logs={logs} healthRuns={healthRuns} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  test("does not show card again on app resume (persistent evaluated/shown state)", async () => {
    freezeTimeForTests(new Date("2026-05-01T12:00:00.000Z"));

    const planSessions = [{ id: "s1", date: "1. Mai", type: "easy", title: "Easy", pace: "5:00–5:20/km", km: 10 }];
    const logs = {
      s1: {
        done: true,
        at: "2026-05-01T08:00:00.000Z",
        assignedRun: { runId: "hk_run_1", duration: 3000, distanceKm: 10 },
      },
    };
    const healthRuns: StoredHealthRun[] = [
      {
        runId: "hk_run_1",
        startDate: "2026-05-01T07:10:00.000Z",
        duration: 3000,
        distanceMeters: 10_000,
        distanceUnknown: false,
        workoutType: "running",
        sourceName: "Apple Health",
      },
    ];

    const { unmount } = render(<Harness planSessions={planSessions} logs={logs} healthRuns={healthRuns} />);
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Fertig"));
    expect(screen.queryByRole("dialog")).toBeNull();

    // Simulate app background/resume: full unmount + remount, localStorage preserved.
    unmount();
    render(<Harness planSessions={planSessions} logs={logs} healthRuns={healthRuns} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  test("does not appear next day even if workout was done yesterday", () => {
    freezeTimeForTests(new Date("2026-05-02T12:00:00.000Z"));

    const planSessions = [{ id: "s1", date: "1. Mai", type: "easy", title: "Easy", pace: "5:00–5:20/km", km: 10 }];
    const logs = { s1: { done: true, at: "2026-05-01T08:00:00.000Z", assignedRun: { runId: "hk_run_1", duration: 3000, distanceKm: 10 } } };
    const healthRuns: StoredHealthRun[] = [
      { runId: "hk_run_1", startDate: "2026-05-01T07:10:00.000Z", duration: 3000, distanceMeters: 10_000, distanceUnknown: false, workoutType: "running", sourceName: "Apple Health" },
    ];

    render(<Harness planSessions={planSessions} logs={logs} healthRuns={healthRuns} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  test("does not appear without workout", () => {
    freezeTimeForTests(new Date("2026-05-01T12:00:00.000Z"));
    const planSessions = [{ id: "s1", date: "1. Mai", type: "easy", title: "Easy", pace: "5:00–5:20/km", km: 10 }];
    const logs = { s1: { done: false, at: "2026-05-01T08:00:00.000Z", actualKm: "10" } };
    render(<Harness planSessions={planSessions} logs={logs} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  test("strength/unknown workout types never trigger", () => {
    freezeTimeForTests(new Date("2026-05-01T12:00:00.000Z"));
    const planSessions = [{ id: "s1", date: "1. Mai", type: "strength", title: "Gym", pace: null, km: 0 }];
    const logs = { s1: { done: true, at: "2026-05-01T08:00:00.000Z", assignedRun: { runId: "hk_x", duration: 1800 } } };
    const healthRuns: StoredHealthRun[] = [
      { runId: "hk_x", startDate: "2026-05-01T07:10:00.000Z", duration: 1800, distanceMeters: null, distanceUnknown: true, workoutType: "strengthTraining", sourceName: "Apple Health" },
    ];
    render(<Harness planSessions={planSessions} logs={logs} healthRuns={healthRuns} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  test("cycling workout triggers once (eligible)", async () => {
    freezeTimeForTests(new Date("2026-05-01T12:00:00.000Z"));
    const planSessions = [{ id: "b1", date: "1. Mai", type: "bike", title: "Bike", pace: "locker", km: 0 }];
    const logs = { b1: { done: true, at: "2026-05-01T08:00:00.000Z", assignedRun: { runId: "hk_bike", duration: 3600, distanceKm: 35 } } };
    const healthRuns: StoredHealthRun[] = [
      { runId: "hk_bike", startDate: "2026-05-01T07:10:00.000Z", duration: 3600, distanceMeters: 35_000, distanceUnknown: false, workoutType: "cycling", sourceName: "Apple Health", avgHeartRateBpm: 135 },
    ];
    render(<Harness planSessions={planSessions} logs={logs} healthRuns={healthRuns} />);
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(await screen.findByText(/AI Coach/i)).toBeInTheDocument();
  });

  test("multiple workouts same day -> shows latest only", async () => {
    freezeTimeForTests(new Date("2026-05-01T12:00:00.000Z"));
    const planSessions = [
      { id: "a", date: "1. Mai", type: "easy", title: "A", pace: "5:00–5:20/km", km: 10 },
      { id: "b", date: "1. Mai", type: "interval", title: "B", pace: "4:00/km", km: 12 },
    ];
    const logs = {
      a: { done: true, at: "2026-05-01T06:00:00.000Z", assignedRun: { runId: "hk_a", duration: 3300, distanceKm: 10 } },
      b: { done: true, at: "2026-05-01T09:00:00.000Z", assignedRun: { runId: "hk_b", duration: 2800, distanceKm: 12 } },
    };
    const healthRuns: StoredHealthRun[] = [
      { runId: "hk_a", startDate: "2026-05-01T05:00:00.000Z", duration: 3300, distanceMeters: 10_000, distanceUnknown: false, workoutType: "running", sourceName: "Apple Health" },
      { runId: "hk_b", startDate: "2026-05-01T08:10:00.000Z", duration: 2800, distanceMeters: 12_000, distanceUnknown: false, workoutType: "running", sourceName: "Apple Health" },
    ];
    render(<Harness planSessions={planSessions} logs={logs} healthRuns={healthRuns} />);
    // Title "B" is now on its own line — match exact text to avoid collision with "bpm".
    expect(await screen.findByText("B", { exact: true })).toBeInTheDocument();
    expect(screen.queryByText("A", { exact: true })).toBeNull();
  });

  test("does not appear without Apple Health sourceName (strict Apple Health only)", () => {
    freezeTimeForTests(new Date("2026-05-01T12:00:00.000Z"));
    const planSessions = [{ id: "s1", date: "1. Mai", type: "easy", title: "Easy", pace: "5:00–5:20/km", km: 10 }];
    const logs = { s1: { done: true, at: "2026-05-01T08:00:00.000Z", assignedRun: { runId: "hk_run_1", duration: 3000, distanceKm: 10 } } };
    const healthRuns: StoredHealthRun[] = [
      { runId: "hk_run_1", startDate: "2026-05-01T07:10:00.000Z", duration: 3000, distanceMeters: 10_000, distanceUnknown: false, workoutType: "running" },
    ];
    render(<Harness planSessions={planSessions} logs={logs} healthRuns={healthRuns} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  test("home unchanged when AI disabled (no real AI message, fallback shown)", async () => {
    freezeTimeForTests(new Date("2026-05-01T12:00:00.000Z"));
    const planSessions = [{ id: "s1", date: "1. Mai", type: "easy", title: "Easy", pace: "5:00–5:20/km", km: 10 }];
    const logs = { s1: { done: true, at: "2026-05-01T08:00:00.000Z", assignedRun: { runId: "hk_run_1", duration: 3000, distanceKm: 10 } } };
    const healthRuns: StoredHealthRun[] = [
      { runId: "hk_run_1", startDate: "2026-05-01T07:10:00.000Z", duration: 3000, distanceMeters: 10_000, distanceUnknown: false, workoutType: "running", sourceName: "Apple Health" },
    ];
    render(<Harness planSessions={planSessions} logs={logs} healthRuns={healthRuns} aiAnalysisEnabled={false} />);
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    // AI section still renders but shows fallback when AI is disabled.
    expect(await screen.findByText(/AI Coach/i)).toBeInTheDocument();
    expect(await screen.findByText(/Zu wenig Daten/i)).toBeInTheDocument();
  });

  test("AI section renders with l2-based message when Level 3 is insufficient_data", async () => {
    freezeTimeForTests(new Date("2026-05-01T12:00:00.000Z"));

    const planSessions = [{ id: "s1", date: "1. Mai", type: "easy", title: "Easy", pace: "5:00–5:20/km", km: 10 }];
    const logs = {
      s1: {
        done: true,
        at: "2026-05-01T08:00:00.000Z",
        assignedRun: { runId: "hk_run_1", duration: 3000, distanceKm: 10 },
      },
    };
    const healthRuns: StoredHealthRun[] = [
      {
        runId: "hk_run_1",
        startDate: "2026-05-01T07:10:00.000Z",
        duration: 3000,
        distanceMeters: 10_000,
        distanceUnknown: false,
        workoutType: "running",
        sourceName: "Apple Health",
        avgHeartRateBpm: 150,
      },
    ];

    // Provide too few recovery points to force L3 insufficient_data.
    // With avgHeartRateBpm=150 and maxHr=190, L2 should succeed → real message shown.
    render(<Harness planSessions={planSessions} logs={logs} healthRuns={healthRuns} recoveryPoints={[{ date: "2026-05-01", score0_100: 80 }]} />);
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(await screen.findByText(/AI Coach/i)).toBeInTheDocument();
    // Raw debug lines ("Nicht genug Daten für Trendanalyse") must not appear.
    expect(screen.queryByText(/Nicht genug Daten für Trendanalyse/)).toBeNull();
    // A real l2-based insight should be present (not the fallback "Zu wenig Daten" text).
    expect(screen.queryByText(/Zu wenig Daten/i)).toBeNull();
  });
});

