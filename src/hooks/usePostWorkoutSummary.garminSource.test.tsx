/**
 * W2 Weg A: Ein Lauf von einer Garmin-Uhr kommt über Garmin Connect nach Apple Health (Quellname
 * „Connect“). Früher verlangte die Auswertung nach dem Lauf einen Quellnamen mit „apple“ – Garmin-Läufe
 * bekamen deshalb nie die volle Auswertung. Strava-Importe bleiben beim Log-Pfad.
 */
import React from "react";
import { render, screen } from "@testing-library/react";
import { freezeTimeForTests } from "../core/time/timeSystem";
import { isHealthKitWorkoutSource, usePostWorkoutSummary } from "./usePostWorkoutSummary";
import { PostWorkoutSummaryCard } from "../components/PostWorkoutSummaryCard";
import type { StoredHealthRun } from "../healthRuns";

function Harness(props: { planSessions: any[]; logs: Record<string, any>; healthRuns: StoredHealthRun[] }) {
  const { visible, summary, dismiss } = usePostWorkoutSummary({
    activeView: "home",
    planSessions: props.planSessions,
    logs: props.logs,
    healthRuns: props.healthRuns,
    maxHeartRateBpm: 190,
    recoveryPoints: null,
  });
  return summary ? <PostWorkoutSummaryCard open={visible} summary={summary} onDone={dismiss} /> : null;
}

const planSessions = [{ id: "s1", date: "1. Mai", dateIso: "2026-05-01", type: "easy", title: "Easy", pace: "5:00–5:20/km", km: 10 }];

function run(runId: string, sourceName: string | undefined): StoredHealthRun {
  return {
    runId,
    startDate: "2026-05-01T07:10:00.000Z",
    duration: 3000,
    distanceMeters: 10_000,
    distanceUnknown: false,
    workoutType: "running",
    ...(sourceName !== undefined ? { sourceName } : {}),
    avgHeartRateBpm: 150,
  };
}

function logsFor(runId: string) {
  return { s1: { done: true, at: "2026-05-01T08:00:00.000Z", assignedRun: { runId, duration: 3000, distanceKm: 10 } } };
}

describe("Auswertung nach dem Lauf: Quelle", () => {
  beforeEach(() => {
    localStorage.clear();
    freezeTimeForTests(new Date("2026-05-01T12:00:00.000Z"));
  });
  afterEach(() => freezeTimeForTests(null));

  test("isHealthKitWorkoutSource: jede HealthKit-Quelle, nicht Strava, ohne Namen keine Annahme", () => {
    expect(isHealthKitWorkoutSource(run("hk_1", "Apple Watch von Anton"))).toBe(true);
    expect(isHealthKitWorkoutSource(run("hk_1", "Connect"))).toBe(true);
    expect(isHealthKitWorkoutSource(run("hk_1", "Garmin Connect"))).toBe(true);
    expect(isHealthKitWorkoutSource(run("hk_1", "Antons Uhr"))).toBe(true);
    expect(isHealthKitWorkoutSource(run("strava:1", "Strava"))).toBe(false);
    // Von der Strava-App nach Apple Health geschrieben: ein HealthKit-Workout.
    expect(isHealthKitWorkoutSource(run("hk_1", "Strava"))).toBe(true);
    expect(isHealthKitWorkoutSource(run("strava:1", undefined))).toBe(false);
    expect(isHealthKitWorkoutSource(run("hk_1", undefined))).toBe(false);
    expect(isHealthKitWorkoutSource(run("hk_1", "  "))).toBe(false);
  });

  test("Garmin-Lauf über Apple Health (Quelle „Connect“) bekommt die Auswertung", async () => {
    render(<Harness planSessions={planSessions} logs={logsFor("hk_garmin")} healthRuns={[run("hk_garmin", "Connect")]} />);
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });

  test("Strava-Lauf: keine volle Auswertung (Log-Pfad)", () => {
    render(<Harness planSessions={planSessions} logs={logsFor("strava:1")} healthRuns={[run("strava:1", "Strava")]} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
