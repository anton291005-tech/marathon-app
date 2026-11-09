import { render, screen, fireEvent } from "@testing-library/react";
import RaceCalculator, { computeRaceSplits } from "./components/RaceCalculator";
import MarathonPredictionCard from "./components/MarathonPredictionCard";
import { computeMarathonForecast, getMarathonPrediction } from "./marathonForecast";
import { resolveActivePlanGoal } from "./planGoal";
import { forecastTitle, raceDistanceName, splitMarksKm, targetTimeExample } from "./raceDistance";
import type { PlanWeek, SessionLog } from "./marathonPrediction";
import type { StoredHealthRun } from "./healthRuns";

const DISTANCES = [
  { label: "5k", km: 5, title: "5-km-Prognose", name: "5 km", marathon: false },
  { label: "10k", km: 10, title: "10-km-Prognose", name: "10 km", marathon: false },
  { label: "HM", km: 21.0975, title: "Halbmarathon-Prognose", name: "Halbmarathon", marathon: false },
  { label: "M", km: 42.195, title: "Marathon-Prognose", name: "Marathon", marathon: true },
] as const;

function raceWeek(km: number, dateIso = "2026-12-20"): PlanWeek[] {
  return [
    {
      wn: 1,
      phase: "PEAK",
      label: "T",
      dates: "T",
      km: 20,
      s: [{ id: "race", day: "So", date: "20. Dez", dateIso, type: "race", title: "Rennen", km, desc: "", pace: null }],
    },
  ] as unknown as PlanWeek[];
}

const NOW = new Date("2026-01-20T12:00:00.000Z");

function trainingPlan(): { plan: PlanWeek[]; logs: Record<string, SessionLog>; healthRuns: StoredHealthRun[] } {
  const rows = ["a", "b", "c"].map((id, i) => ({
    id,
    day: "Mo",
    date: `${5 + i}. Jan`,
    dateIso: `2026-01-0${5 + i}`,
    type: "tempo",
    title: "t",
    km: 10,
    desc: "",
    pace: null,
  }));
  const plan = [{ wn: 1, phase: "BASE", label: "T", dates: "T", km: 30, s: rows }] as unknown as PlanWeek[];
  const logs: Record<string, SessionLog> = {};
  const healthRuns: StoredHealthRun[] = [];
  for (const r of rows) {
    logs[r.id] = {
      done: true,
      assignedRun: { runId: `run-${r.id}`, startDate: `${r.dateIso}T08:00:00.000Z`, duration: 3000, distanceKm: 10, canonicalActivityType: "run" },
    } as SessionLog;
    healthRuns.push({
      runId: `run-${r.id}`,
      workoutType: "running",
      duration: 3000,
      distanceMeters: 10000,
      distanceUnknown: false,
      startDate: `${r.dateIso}T08:00:00.000Z`,
    } as StoredHealthRun);
  }
  return { plan, logs, healthRuns };
}

describe.each(DISTANCES)("Distanz $label", ({ km, title, name, marathon }) => {
  it("benennt Distanz und Prognosekarte nach der Plan-Distanz", () => {
    expect(raceDistanceName(km)).toBe(name);
    expect(forecastTitle(km)).toBe(title);
  });

  it("Prognose: Zeit über die Plan-Distanz, Sub-3/Sub-2:50 nur im Marathon", () => {
    const { plan, logs, healthRuns } = trainingPlan();
    const forecast = computeMarathonForecast({ plan, logs, healthRuns, now: NOW, raceDistanceKm: km });
    expect(forecast.ready).toBe(true);
    const marathonForecast = computeMarathonForecast({ plan, logs, healthRuns, now: NOW });
    if (marathon) {
      expect(forecast.predictedSeconds).toBe(marathonForecast.predictedSeconds);
      expect(forecast.sub3ProbabilityPercent).not.toBeNull();
    } else {
      expect(forecast.predictedSeconds!).toBeLessThan(marathonForecast.predictedSeconds!);
      expect(forecast.sub3ProbabilityPercent).toBeNull();
      expect(forecast.sub250ProbabilityPercent).toBeNull();
    }
  });

  it("Karte: Titel, Zielzeit des Plans, Sub-3-Kachel nur im Marathon", () => {
    const { plan, logs, healthRuns } = trainingPlan();
    const prediction = getMarathonPrediction({ plan, logs, healthRuns, now: NOW, raceDistanceKm: km });
    render(<MarathonPredictionCard variant="full" prediction={prediction} raceDistanceKm={km} targetTimeLabel="1:23:45" />);
    expect(screen.getByText(title)).toBeTruthy();
    expect(screen.getByText("Ziel 1:23:45")).toBeTruthy();
    expect(screen.queryByText("Unter 3:00") !== null).toBe(marathon);
  });

  it("Rennrechner: Zielzeit des Plans, Splits bis zur Plan-Distanz", () => {
    render(<RaceCalculator raceDistanceKm={km} initialTime="1:00:00" />);
    expect(screen.getByText(`Zielzeit ${name}`)).toBeTruthy();
    expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe("1:00:00");
    expect(screen.getByText("Ziel")).toBeTruthy();
    expect(screen.getByPlaceholderText(targetTimeExample(km))).toBeTruthy();
    expect(screen.queryByText("Halbmarathon") !== null).toBe(marathon);
    const marks = splitMarksKm(km);
    expect(marks.every((m) => m < km)).toBe(true);
    expect(computeRaceSplits(3600, km).splits.at(-1)).toEqual({ km, cumulative: "1:00:00" });
  });

  it("Rennrechner: Nur finishen / kein Ziel zeigt einen neutralen Zustand, keinen Marathon-Default", () => {
    render(<RaceCalculator raceDistanceKm={km} initialTime="" />);
    expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe("");
    expect(screen.getByText(/Zielzeit eingeben/)).toBeTruthy();
    expect(screen.queryByText("Ungültige Zeit")).toBeNull();
    expect(screen.queryByText(/2:50:00/)).toBeNull();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "1:00:00" } });
    // Gesamtzeit steht in der Ziel-Zeile der Splits (Design-System: keine eigene „Gesamt"-Zeile).
    const goalRow = screen.getByText("Ziel").parentElement as HTMLElement;
    expect(goalRow.textContent).toContain("1:00:00");
  });

  it("Plan-Ziel: Zielzeit gehört zum Plan, Nur finishen und fehlendes Ziel haben keinen Zielwert", () => {
    const base = { plan: raceWeek(km), planName: "Lauf – Test", planId: "p1", ownerPlanId: "p1" };
    const withTime = resolveActivePlanGoal({ ...base, preferences: { targetTime: "1:30:00", raceGoal: "time", raceDistanceKm: km } });
    expect(withTime.raceDistanceKm).toBeCloseTo(km);
    expect(withTime.targetSeconds).toBe(5400);
    expect(withTime.targetTimeLabel).toBe("1:30:00");

    const finish = resolveActivePlanGoal({ ...base, preferences: { targetTime: "1:30:00", raceGoal: "finish", raceDistanceKm: km } });
    expect(finish.finishOnly).toBe(true);
    expect(finish.targetSeconds).toBeNull();
    expect(finish.targetTimeLabel).toBe("Ziel: Finishen");

    const none = resolveActivePlanGoal({ ...base, preferences: {} });
    expect(none.targetSeconds).toBeNull();
    expect(none.targetTime).toBe("");
    expect(none.targetTimeLabel).toBeUndefined();
  });
});

describe("Planwechsel", () => {
  const marathonPrefs = { targetTime: "2:50:00", raceGoal: "time", raceDistanceKm: 42.195 };

  it("Zielzeit und Distanz folgen dem aktiven Plan; fremde Marathon-Zielzeit erscheint im 10k-Plan nicht", () => {
    const marathon = resolveActivePlanGoal({ plan: raceWeek(42.195), planName: "Marathon", planId: "m", ownerPlanId: "m", preferences: marathonPrefs });
    expect(marathon.raceDistanceKm).toBeCloseTo(42.195);
    expect(marathon.targetSeconds).toBe(2 * 3600 + 50 * 60);

    // Preferences gehören noch dem Marathon-Plan, aktiv ist jetzt der 10k-Plan.
    const tenK = resolveActivePlanGoal({ plan: raceWeek(10), planName: "10 km", planId: "t", ownerPlanId: "m", preferences: marathonPrefs });
    expect(tenK.raceDistanceKm).toBe(10);
    expect(tenK.preferencesApply).toBe(false);
    expect(tenK.targetSeconds).toBeNull();
    expect(tenK.targetTime).toBe("");

    // Eigene Preferences des 10k-Plans.
    const own = resolveActivePlanGoal({ plan: raceWeek(10), planName: "10 km", planId: "t", ownerPlanId: "t", preferences: { targetTime: "0:45:00", raceGoal: "time", raceDistanceKm: 10 } });
    expect(own.targetSeconds).toBe(45 * 60);
  });

  it("ohne Besitzer: Marathon-Preferences (Distanz widerspricht) gelten nicht für einen 10k-Plan", () => {
    const g = resolveActivePlanGoal({ plan: raceWeek(10), planName: "10 km", planId: "t", ownerPlanId: null, preferences: marathonPrefs });
    expect(g.preferencesApply).toBe(false);
    expect(g.targetSeconds).toBeNull();
  });

  it("Rennrechner startet mit neuem key (Planwechsel) mit Zielzeit und Distanz des neuen Plans", () => {
    const { rerender } = render(<RaceCalculator key="m" raceDistanceKm={42.195} initialTime="2:50:00" />);
    expect(screen.getByText("Zielzeit Marathon")).toBeTruthy();
    rerender(<RaceCalculator key="t" raceDistanceKm={10} initialTime="" />);
    expect(screen.getByText("Zielzeit 10 km")).toBeTruthy();
    expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe("");
    expect(screen.queryByText("Halbmarathon")).toBeNull();
  });

  it("unbekannte Distanz: keine Prognose, kein Marathon-Wert", () => {
    const { plan, logs, healthRuns } = trainingPlan();
    const f = computeMarathonForecast({ plan, logs, healthRuns, now: NOW, raceDistanceKm: null });
    expect(f.ready).toBe(false);
    expect(f.predictedTime).toBeNull();
    expect(forecastTitle(null)).toBe("Prognose");
  });
});
