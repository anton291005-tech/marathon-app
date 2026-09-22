import { computeDueReadinessInputs, getPerformancePrediction } from "./AppMain";

/**
 * Option B: readiness beschreibt aktuelle Form und darf deshalb nur bis heute faellige Sessions
 * zaehlen. Ueber den Gesamtplan gerechnet misst sie, wie weit man im Block ist — nicht wie fit.
 */
describe("computeDueReadinessInputs (Faelligkeitsfilter)", () => {
  // Berlin-Kalendertag „heute" = 2026-06-10
  const now = new Date("2026-06-10T12:00:00.000Z");

  const session = (id: string, date: string, type: string, km = 0) => ({
    id, day: "Mo", date, type, title: id, km, desc: "", pace: null,
  });

  const done = { done: true, feeling: 4 };

  it("zaehlt nur Sessions, deren Kalendertag erreicht ist — zukuenftige fallen aus Zaehler UND Nenner", () => {
    const activeSessions = [
      session("past-done", "1. Jun", "easy", 10),
      session("past-open", "5. Jun", "easy", 10),
      session("today", "10. Jun", "easy", 10),
      session("future-1", "20. Jun", "easy", 10),
      session("future-2", "25. Jul", "easy", 10),
    ];
    const inputs = computeDueReadinessInputs({
      activeSessions,
      longRunSessions: [],
      logs: { "past-done": done, today: done },
      healthRunById: new Map(),
      now,
    });

    // 3 faellig (1./5./10. Jun), davon 2 erledigt -> 2/3, NICHT 2/5 wie ueber den Gesamtplan.
    expect(inputs.progressRatio).toBeCloseTo(2 / 3, 5);
  });

  it("die heutige Session gilt als faellig (Grenzfall ymd === todayYmd)", () => {
    const inputs = computeDueReadinessInputs({
      activeSessions: [session("today", "10. Jun", "easy", 10)],
      longRunSessions: [],
      logs: { today: done },
      healthRunById: new Map(),
      now,
    });
    expect(inputs.progressRatio).toBe(1);
  });

  it("trennt faellige Long Runs und Hard Sessions korrekt von den zukuenftigen", () => {
    const longRunSessions = [
      session("lr-past-done", "1. Jun", "long", 30),
      session("lr-past-open", "8. Jun", "long", 32),
      session("lr-future", "15. Jun", "long", 34),
    ];
    const activeSessions = [
      ...longRunSessions,
      session("int-past-done", "3. Jun", "interval", 12),
      session("tempo-future", "18. Jun", "tempo", 14),
      session("easy-past", "2. Jun", "easy", 8),
    ];
    const inputs = computeDueReadinessInputs({
      activeSessions,
      longRunSessions,
      logs: { "lr-past-done": done, "int-past-done": done },
      healthRunById: new Map(),
      now,
    });

    expect(inputs.longRuns).toBe(2);          // Gesamtplan waere 3
    expect(inputs.doneLongRuns).toBe(1);
    expect(inputs.hardSessions).toBe(1);      // Gesamtplan waere 2
    expect(inputs.doneHardSessions).toBe(1);
  });

  it("REGRESSION GUARD (der Bug): mitten im Block hebt der Filter readiness deutlich an", () => {
    // 4 faellige Sessions, alle erledigt; 16 liegen noch in der Zukunft.
    const activeSessions = [
      session("d1", "1. Jun", "easy", 10),
      session("d2", "3. Jun", "easy", 10),
      session("d3", "5. Jun", "easy", 10),
      session("d4", "8. Jun", "easy", 10),
      ...Array.from({ length: 16 }, (_, i) => session(`f${i}`, "20. Jul", "easy", 10)),
    ];
    const logs = { d1: done, d2: done, d3: done, d4: done };
    const inputs = computeDueReadinessInputs({
      activeSessions, longRunSessions: [], logs, healthRunById: new Map(), now,
    });

    // Vorher (Gesamtplan): 4/20 = 0.2 trotz perfekter Umsetzung. Jetzt: 4/4 = 1.
    expect(inputs.progressRatio).toBe(1);
    expect(inputs.progressRatio).not.toBeCloseTo(4 / 20, 5);
  });

  it("Sessions ohne parsebares Datum gelten als nicht faellig", () => {
    const inputs = computeDueReadinessInputs({
      activeSessions: [session("ok", "1. Jun", "easy", 10), session("kaputt", "", "easy", 10)],
      longRunSessions: [],
      logs: { ok: done },
      healthRunById: new Map(),
      now,
    });
    expect(inputs.progressRatio).toBe(1); // 1/1, die undatierte Session ist raus
  });

  it("faellt auf neutrale Defaults zurueck, solange nichts faellig ist", () => {
    const inputs = computeDueReadinessInputs({
      activeSessions: [session("f", "20. Jul", "easy", 10)],
      longRunSessions: [session("f", "20. Jul", "long", 30)],
      logs: {},
      healthRunById: new Map(),
      now,
    });
    expect(inputs.progressRatio).toBe(0);
    expect(inputs.avgFeeling).toBe(3);
    expect(inputs.qualityLongRunScore).toBe(0.4);
  });

  it("avgFeeling und qualityLongRunScore mitteln nur ueber faellige, erledigte Sessions", () => {
    const longRunSessions = [
      session("lr-due", "1. Jun", "long", 20),
      session("lr-future", "20. Jun", "long", 20),
    ];
    const inputs = computeDueReadinessInputs({
      activeSessions: longRunSessions,
      longRunSessions,
      logs: {
        "lr-due": { done: true, feeling: 5 },
        // Eine in der Zukunft datierte, bereits abgehakte Session darf nicht einfliessen.
        "lr-future": { done: true, feeling: 1 },
      },
      healthRunById: new Map(),
      now,
    });
    expect(inputs.avgFeeling).toBe(5);
    // plannedLong < 28 -> distanceScore 0.75; feeling 5 -> feelingScore 1
    expect(inputs.qualityLongRunScore).toBeCloseTo(0.75 * 0.65 + 1 * 0.35, 5);
  });
});

/**
 * Scope-Grenze von Option B: der Race-Anchor-Pfad (coachRacePrediction.ts / marathonForecast.ts)
 * bleibt unangetastet. Diese Tests halten fest, dass der Filter ihn weder abschaltet noch
 * umgewichtet — falls jemand spaeter versucht, ihn hier „mitzufixen", schlagen sie an.
 */
describe("Race-Anchor bleibt von Option B unberuehrt", () => {
  const dueInputs = {
    longRuns: 4, doneLongRuns: 3,
    hardSessions: 3, doneHardSessions: 2,
    avgFeeling: 4, progressRatio: 0.7, qualityLongRunScore: 0.6,
    targetSeconds: 2 * 3600 + 49 * 60 + 50,
  };

  it("RACE-ANCHOR GUARD: ein aktuelles Halbmarathon-Ergebnis dominiert readiness weiterhin mit 0.75", () => {
    const withRace = getPerformancePrediction({
      ...dueInputs,
      halfMarathonRacePaceScore: 1,
      halfMarathonRaceDaysAgo: 23, // Koelner HM, 30. Aug -> 23 Tage vor dem 22. Sep
    });

    const longRunScore = 3 / 4;
    const hardScore = 2 / 3;
    const feelingScore = (4 - 2) / 3;
    const baseReadiness =
      longRunScore * 0.28 + hardScore * 0.24 + feelingScore * 0.14 + 0.7 * 0.16 + 0.6 * 0.1;
    // recencyWeight === 1 (23 <= 60), raceWeight === 0.75
    const expectedReadiness = 0.75 * 1 + 0.25 * (baseReadiness / 0.92);
    const expectedSeconds = dueInputs.targetSeconds + (1 - expectedReadiness) * 360;

    expect(withRace.predictedSeconds).toBeCloseTo(expectedSeconds, 5);
  });

  it("im Race-Anchor-Fall schlagen die faelligen Eingaenge nur noch zu 25% durch", () => {
    const weakTraining = { ...dueInputs, progressRatio: 0, doneLongRuns: 0, doneHardSessions: 0 };
    const strongTraining = { ...dueInputs, progressRatio: 1, doneLongRuns: 4, doneHardSessions: 3 };
    const race = { halfMarathonRacePaceScore: 1, halfMarathonRaceDaysAgo: 23 };

    const spreadWithRace =
      getPerformancePrediction({ ...weakTraining, ...race }).predictedSeconds -
      getPerformancePrediction({ ...strongTraining, ...race }).predictedSeconds;
    const spreadWithoutRace =
      getPerformancePrediction({ ...weakTraining, halfMarathonRacePaceScore: null, halfMarathonRaceDaysAgo: null }).predictedSeconds -
      getPerformancePrediction({ ...strongTraining, halfMarathonRacePaceScore: null, halfMarathonRaceDaysAgo: null }).predictedSeconds;

    // Der Anchor daempft den Effekt des Filters — dokumentiert, warum Option B in Woche 24/25
    // das Label kaum bewegt, und ist ausdruecklich NICHT Teil dieses Fixes.
    expect(spreadWithRace).toBeLessThan(spreadWithoutRace);
    expect(spreadWithRace).toBeGreaterThan(0);
  });

  it("Bucket-Grenzen 0.8 / 0.6 bleiben unveraendert (Aufgabe 3a nicht vorweggenommen)", () => {
    // Ohne Race-Signal gilt readiness = baseReadiness + 0.45*0.08; hier ueber die faelligen
    // Eingaenge gezielt in jeden Bucket gefahren.
    const noRace = { halfMarathonRacePaceScore: null, halfMarathonRaceDaysAgo: null, targetSeconds: 10800 };

    const hoch = getPerformancePrediction({
      ...noRace,
      longRuns: 4, doneLongRuns: 4, hardSessions: 3, doneHardSessions: 3,
      avgFeeling: 5, progressRatio: 1, qualityLongRunScore: 0,
    });
    const mittel = getPerformancePrediction({
      ...noRace,
      longRuns: 4, doneLongRuns: 4, hardSessions: 3, doneHardSessions: 3,
      avgFeeling: 3, progressRatio: 0, qualityLongRunScore: 0,
    });
    const frueh = getPerformancePrediction({
      ...noRace,
      longRuns: 4, doneLongRuns: 0, hardSessions: 3, doneHardSessions: 0,
      avgFeeling: 2, progressRatio: 0, qualityLongRunScore: 0,
    });

    expect(hoch.confidence).toBe("hoch");          // readiness 0.856
    expect(mittel.confidence).toBe("mittel");      // readiness 0.603
    expect(frueh.confidence).toBe("früh im Block"); // readiness 0.036
  });
});
