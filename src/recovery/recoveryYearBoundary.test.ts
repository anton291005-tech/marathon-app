import type { PlanSession, PlanWeek, SessionLog } from "../marathonPrediction";
import { computeHomeRecoveryScoreBreakdown } from "./homeRecoveryScore";
import { buildPlanWeekToDateMap } from "./recoveryScoringEngine";
import { buildRecoveryWeekRollups } from "./recoveryRollupBuilder";
import { buildDailyTrainingLoadByDate } from "./trainingDailyLoad";

/**
 * Die Recovery-Kette las den Kalendertag einer Session aus dem Anzeige-Label
 * ("28. Dez"), dem das Jahr fehlt — `parseSessionDateLabel` ergänzte still 2026.
 * Eine Woche über Silvester landete dadurch komplett in 2026 (der 3. Januar im
 * *vergangenen* Januar), und ein Plan, der ganz in 2027 liegt, wurde als 2026
 * gelesen. Quelle ist jetzt `session.dateIso` aus der TrainingPlanV2-SSOT.
 */

const DE_MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
const DE_WEEKDAYS = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

/** Session mit Label *und* dateIso — so, wie `toPlanWeeks` sie baut. */
function session(id: string, dayIso: string, type: string, km: number): PlanSession {
  const d = new Date(`${dayIso}T12:00:00`);
  return {
    id,
    day: DE_WEEKDAYS[d.getDay()],
    date: `${d.getDate()}. ${DE_MONTHS[d.getMonth()]}`,
    dateIso: dayIso,
    type,
    title: id,
    km,
    desc: "",
    pace: "",
  };
}

/** Mo 28.12.2026 – So 03.01.2027 */
const YEAR_BOUNDARY_DAYS = [
  "2026-12-28",
  "2026-12-29",
  "2026-12-30",
  "2026-12-31",
  "2027-01-01",
  "2027-01-02",
  "2027-01-03",
];

function weekFrom(days: string[], wn = 1): PlanWeek {
  return {
    wn,
    phase: "BASE",
    km: days.length * 10,
    s: days.map((d, i) => session(`s-${d}`, d, i === days.length - 1 ? "long" : "easy", 10)),
  };
}

const BOUNDARY_WEEK = weekFrom(YEAR_BOUNDARY_DAYS);

function allDone(week: PlanWeek): Record<string, SessionLog> {
  const logs: Record<string, SessionLog> = {};
  for (const s of week.s ?? []) logs[s.id] = { done: true };
  return logs;
}

describe("Recovery über den Jahreswechsel", () => {
  it("buildDailyTrainingLoadByDate schlüsselt die Silvesterwoche auf beide Jahre auf", () => {
    const loads = buildDailyTrainingLoadByDate([BOUNDARY_WEEK], allDone(BOUNDARY_WEEK));

    expect(Array.from(loads.keys()).sort()).toEqual(YEAR_BOUNDARY_DAYS);
    for (const day of YEAR_BOUNDARY_DAYS) {
      expect(loads.get(day)).toBeGreaterThan(0);
    }
    // Der alte Label-Pfad hätte den 1.–3. Januar auf Anfang 2026 gelegt.
    expect(loads.has("2026-01-01")).toBe(false);
    expect(loads.has("2026-01-03")).toBe(false);
  });

  it("buildPlanWeekToDateMap deckt alle sieben Tage der Silvesterwoche ab", () => {
    const map = buildPlanWeekToDateMap([BOUNDARY_WEEK]);

    expect(Array.from(map.keys()).sort()).toEqual(YEAR_BOUNDARY_DAYS);
    expect(map.get("2026-12-28")).toBe(BOUNDARY_WEEK);
    expect(map.get("2027-01-03")).toBe(BOUNDARY_WEEK);
  });

  it("buildRecoveryWeekRollups datiert die Silvesterwoche als vergangene Woche", () => {
    const rollups = buildRecoveryWeekRollups({
      plan: [BOUNDARY_WEEK],
      logs: allDone(BOUNDARY_WEEK),
      dailyRows: [],
      now: new Date(2027, 0, 10, 12, 0, 0),
    });

    expect(rollups).toHaveLength(1);
    // Nicht der Platzhalter-Zweig (`!first || !last`) und nicht "in der Zukunft":
    // beides würde bei falschem Jahr greifen.
    expect(rollups[0].label).toBe("W1");
    expect(rollups[0].trend7.length).toBeGreaterThanOrEqual(2);
    expect(rollups[0].recoveryScore).toBeGreaterThanOrEqual(0);
    expect(rollups[0].recoveryScore).toBeLessThanOrEqual(100);
  });

  it("das rollende 7-Tage-Fenster des Home-Scores zählt beide Jahreshälften", () => {
    // Fenster = 28.12.2026 .. 03.01.2027. Erledigt sind nur die vier Dezembertage;
    // mit dem alten Label-Pfad lagen die Januartage in 2026, fielen aus dem
    // Fenster und die Quote wäre fälschlich 4/4 = 1 gewesen.
    const logs: Record<string, SessionLog> = {};
    for (const day of YEAR_BOUNDARY_DAYS) {
      if (day.startsWith("2026-")) logs[`s-${day}`] = { done: true };
    }

    const breakdown = computeHomeRecoveryScoreBreakdown({
      series: [],
      plan: [BOUNDARY_WEEK],
      logs,
      now: new Date(2027, 0, 3, 12, 0, 0),
    });

    expect(breakdown.windowStartYmd).toBe("2026-12-28");
    expect(breakdown.windowEndYmd).toBe("2027-01-03");
    expect(breakdown.contributingFactors.executionRatio).toBeCloseTo(4 / 7, 5);
  });

  it("Rollup-Ausgabeform bleibt unverändert (speist den Coach-Kontext)", () => {
    const rollups = buildRecoveryWeekRollups({
      plan: [BOUNDARY_WEEK],
      logs: allDone(BOUNDARY_WEEK),
      dailyRows: [],
      now: new Date(2027, 0, 10, 12, 0, 0),
    });

    expect(Object.keys(rollups[0]).sort()).toEqual(
      [
        "aiReasoningMode",
        "certaintyLabel",
        "confidenceBandLabel",
        "dataQualityBadge",
        "hasHealthData",
        "hrvTrend",
        "latentTrendBandHalfWidth",
        "loadMarker",
        "recoveryConfidence",
        "recoveryScore",
        "scoreConfidence",
        "semanticUncertaintyState",
        "sleepScoreAvg",
        "sub",
        "trend7",
        "weekIndex",
        "label",
      ].sort(),
    );
    expect(Object.keys(rollups[0].sub).sort()).toEqual(
      ["loadBalanceLabel", "sleepQualityLabel", "stabilityLabel"].sort(),
    );
  });
});

describe("Recovery bei einem Plan komplett in 2027", () => {
  const MARCH_2027 = weekFrom(["2027-03-08", "2027-03-09", "2027-03-14"]);

  it("liest die Tage als 2027 und nicht als 2026", () => {
    const loads = buildDailyTrainingLoadByDate([MARCH_2027], allDone(MARCH_2027));

    expect(Array.from(loads.keys()).sort()).toEqual(["2027-03-08", "2027-03-09", "2027-03-14"]);
    expect(loads.has("2026-03-08")).toBe(false);

    const map = buildPlanWeekToDateMap([MARCH_2027]);
    expect(map.has("2027-03-08")).toBe(true);
    expect(map.has("2027-03-14")).toBe(true);
    expect(map.has("2026-03-08")).toBe(false);
  });
});

describe("Legacy-Sessions ohne dateIso", () => {
  it("bleiben über den Label-Fallback nutzbar und melden das geratene Jahr", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const legacyWeek: PlanWeek = {
      wn: 1,
      phase: "BASE",
      km: 10,
      s: [{ id: "legacy-1", day: "Mo", date: "6. Apr", type: "easy", title: "E", km: 10, desc: "", pace: "" }],
    };

    const loads = buildDailyTrainingLoadByDate([legacyWeek], { "legacy-1": { done: true } });

    expect(Array.from(loads.keys())).toEqual(["2026-04-06"]);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("Session ohne dateIso"),
      expect.objectContaining({ sessionId: "legacy-1" }),
    );
    warn.mockRestore();
  });
});
