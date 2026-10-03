import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { freezeTimeForTests } from "../core/time/timeSystem";
import { buildLogOnlyConclusion, usePostWorkoutSummary } from "./usePostWorkoutSummary";
import { PostWorkoutSummaryCard } from "../components/PostWorkoutSummaryCard";
import type { StoredHealthRun } from "../healthRuns";

const planSessions = [
  { id: "w20-do", date: "24.09.", type: "easy", title: "Easy + 3× MP-Strides", pace: "5:00–5:20/km", km: 8 },
  { id: "w20-fr", date: "25.09.", type: "easy", title: "Easy", pace: "5:00–5:20/km", km: 6 },
];

const healthRun: StoredHealthRun = {
  runId: "hk_run_1",
  // Am Freitag nachgeholt — nicht am geplanten Donnerstag.
  startDate: "2026-09-25T07:10:00.000Z",
  duration: 2400,
  distanceMeters: 8_000,
  distanceUnknown: false,
  workoutType: "running",
  sourceName: "Apple Health",
  avgHeartRateBpm: 142,
} as StoredHealthRun;

/** Wie das Session-Modal im Woche-Tab: Rückblick per Session-ID, nie über den Abschluss-Trigger. */
function ReviewHarness(props: {
  sessionId: string;
  logs: Record<string, any>;
  healthRuns?: StoredHealthRun[];
  onEdit?: () => void;
}) {
  const { visible, getStoredSessionConclusion } = usePostWorkoutSummary({
    activeView: "week",
    planSessions,
    logs: props.logs,
    healthRuns: props.healthRuns ?? [],
    maxHeartRateBpm: 190,
    aiAnalysisEnabled: false,
  });
  const conclusion = getStoredSessionConclusion(props.sessionId);
  return (
    <>
      <div data-testid="fresh-trigger">{visible ? "visible" : "hidden"}</div>
      {conclusion ? (
        <PostWorkoutSummaryCard open summary={conclusion} onDone={() => {}} onEdit={props.onEdit} />
      ) : (
        <div>Session Details</div>
      )}
    </>
  );
}

describe("Rückblick: Conclusion Card aus gespeicherten Daten", () => {
  beforeEach(() => {
    localStorage.clear();
    // Tage nach dem Training — es gibt keinen frischen Abschluss.
    freezeTimeForTests(new Date("2026-10-03T12:00:00.000Z"));
  });
  afterEach(() => freezeTimeForTests(null));

  test("abgeschlossene Session mit Health-Daten → Conclusion Card mit Health-Werten, auch wenn der Lauf an einem anderen Tag war", () => {
    const logs = {
      "w20-do": {
        done: true,
        at: "2026-09-25T08:00:00.000Z",
        assignedRun: { runId: "hk_run_1", startDate: healthRun.startDate, duration: 2400, distanceKm: 8 },
      },
    };
    const onEdit = jest.fn();
    render(<ReviewHarness sessionId="w20-do" logs={logs} healthRuns={[healthRun]} onEdit={onEdit} />);

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("Easy + 3× MP-Strides");
    expect(dialog).toHaveTextContent("8.0 km");
    expect(dialog).toHaveTextContent("5:00/km");
    expect(dialog).toHaveTextContent("142 bpm");
    expect(screen.getByText("Umsetzung")).toBeInTheDocument();
    expect(screen.queryByText("Session Details")).toBeNull();

    fireEvent.click(screen.getByText("Bearbeiten"));
    expect(onEdit).toHaveBeenCalledTimes(1);
  });

  test("abgeschlossene Session ohne Health-Daten → Conclusion Card mit Log-Werten, fehlende Metriken ausgeblendet", () => {
    const logs = { "w20-do": { done: true, at: "2026-09-24T18:00:00.000Z", actualKm: "8,2", feeling: 4, notes: "Lief locker." } };
    render(<ReviewHarness sessionId="w20-do" logs={logs} />);

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("Easy + 3× MP-Strides");
    expect(dialog).toHaveTextContent("8.2 km");
    expect(dialog).toHaveTextContent("😊 Gut");
    expect(dialog).toHaveTextContent("Lief locker.");
    // Kein Pace-/Puls-Tile ohne Daten, kein Platzhalter.
    expect(screen.queryByText("Pace")).toBeNull();
    expect(screen.queryByText("Puls")).toBeNull();
    expect(screen.getByTestId("pws-metric-tiles").children).toHaveLength(1);
    expect(dialog.textContent).not.toMatch(/undefined|NaN|null|Keine Daten|Wird geladen|Zu wenig Daten/);
    expect(dialog.textContent).not.toMatch(/—/);
    expect(dialog.textContent).not.toMatch(/(^|[^\d.,:])0(\.0)? ?(km|bpm|\/km)/);
  });

  test("nur abgehakt, keinerlei Werte → Card ohne Score-Ring und ohne Kacheln, keine 0", () => {
    const logs = { "w20-do": { done: true, at: "2026-09-24T18:00:00.000Z", actualKm: "", feeling: 0, notes: "" } };
    render(<ReviewHarness sessionId="w20-do" logs={logs} />);

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("Als erledigt markiert");
    expect(screen.queryByText("Umsetzung")).toBeNull();
    expect(screen.queryByTestId("pws-metric-tiles")).toBeNull();
    expect(screen.queryByTestId("pws-log-details")).toBeNull();
    expect(dialog.textContent).not.toMatch(/undefined|NaN|Deutlich off-plan|—/);
    expect(dialog.textContent).not.toMatch(/\b0\b/);
  });

  test("verknüpftes Health-Workout nicht mehr im Bestand → Werte aus assignedRun im Log", () => {
    const logs = {
      "w20-do": {
        done: true,
        at: "2026-09-24T18:00:00.000Z",
        assignedRun: { runId: "hk_gone", startDate: "2026-09-24T16:00:00.000Z", duration: 2400, distanceKm: 8, avgHeartRateBpm: 140 },
      },
    };
    render(<ReviewHarness sessionId="w20-do" logs={logs} healthRuns={[]} />);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("8.0 km");
    expect(dialog).toHaveTextContent("5:00/km");
    expect(dialog).toHaveTextContent("140 bpm");
    expect(screen.getByTestId("pws-metric-tiles").children).toHaveLength(3);
  });

  test("Log-only ohne Planwerte (keine Pace, keine km im Plan): keine Platzhalter in der Geplant-Zeile", () => {
    const bare = { id: "x1", date: "24.09.", type: "strength", title: "Athletik" };
    const summary = buildLogOnlyConclusion(bare, {
      done: true,
      at: "2026-09-24T18:00:00.000Z",
      assignedRun: { runId: "gone", startDate: "2026-09-24T16:00:00.000Z", duration: 1800, distanceKm: 5, avgHeartRateBpm: 130 },
    });
    expect(summary).not.toBeNull();
    render(<PostWorkoutSummaryCard open summary={summary!} onDone={() => {}} />);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("5.0 km");
    expect(dialog.textContent).not.toMatch(/—|–|undefined|NaN|Keine Daten/);
  });

  test("offene, übersprungene und zukünftige Session → wie bisher das Formular, keine Card", () => {
    const { rerender } = render(<ReviewHarness sessionId="w20-fr" logs={{}} healthRuns={[healthRun]} />);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByText("Session Details")).toBeInTheDocument();

    rerender(<ReviewHarness sessionId="w20-fr" logs={{ "w20-fr": { skipped: true, at: "2026-09-25T18:00:00.000Z" } }} />);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByText("Session Details")).toBeInTheDocument();
    expect(buildLogOnlyConclusion(planSessions[1], { skipped: true })).toBeNull();
    expect(buildLogOnlyConclusion(planSessions[1], undefined)).toBeNull();
  });

  test("Ansehen verändert keine Logs, keinen Speicher und löst keinen Abschluss aus", () => {
    const logs = {
      "w20-do": {
        done: true,
        at: "2026-09-25T08:00:00.000Z",
        assignedRun: { runId: "hk_run_1", startDate: healthRun.startDate, duration: 2400, distanceKm: 8 },
      },
      "w20-fr": { done: true, at: "2026-09-25T18:00:00.000Z", actualKm: "6" },
    };
    const before = JSON.stringify(logs);
    const healthBefore = JSON.stringify([healthRun]);
    const setItem = jest.spyOn(Storage.prototype, "setItem");

    const { rerender } = render(<ReviewHarness sessionId="w20-do" logs={logs} healthRuns={[healthRun]} />);
    rerender(<ReviewHarness sessionId="w20-fr" logs={logs} healthRuns={[healthRun]} />);
    rerender(<ReviewHarness sessionId="w20-do" logs={logs} healthRuns={[healthRun]} />);

    expect(JSON.stringify(logs)).toBe(before);
    expect(JSON.stringify([healthRun])).toBe(healthBefore);
    expect(setItem).not.toHaveBeenCalled();
    expect(localStorage.length).toBe(0);
    // Der Abschluss-Trigger (Card direkt nach dem Training) bleibt aus.
    expect(screen.getByTestId("fresh-trigger")).toHaveTextContent("hidden");
    setItem.mockRestore();
  });
});
