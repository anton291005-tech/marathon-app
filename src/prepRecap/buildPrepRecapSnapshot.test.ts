import type { PlanSession, PlanWeek, SessionLog } from "../marathonPrediction";
import type { RecoveryDailyRow } from "../recovery/recoveryTypes";
import { buildPrepRecapSnapshot, PREP_RECAP_SCHEMA_VERSION, type BuildPrepRecapInput } from "./buildPrepRecapSnapshot";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];

function s(id: string, dateIso: string, type: string, km: number): PlanSession {
  const [, m, d] = dateIso.split("-").map(Number);
  return { id, day: "", date: `${d}. ${MONTHS[m - 1]}`, dateIso, type, title: type, km };
}

const race = s("race", "2026-09-27", "race", 42.2);

const plan: PlanWeek[] = [
  {
    wn: 1,
    phase: "base",
    km: 55,
    s: [
      s("w1-easy", "2026-09-07", "easy", 10),
      s("w1-rest", "2026-09-08", "rest", 0),
      s("w1-int", "2026-09-09", "interval", 12),
      s("w1-bike", "2026-09-10", "bike", 30),
      s("w1-skip", "2026-09-11", "easy", 8),
      s("w1-long", "2026-09-13", "long", 25),
    ],
  },
  {
    wn: 2,
    phase: "BUILD",
    km: 64,
    s: [
      s("w2-easy", "2026-09-14", "easy", 10),
      s("w2-tempo", "2026-09-16", "tempo", 14),
      s("w2-open", "2026-09-18", "easy", 8),
      s("w2-long", "2026-09-20", "long", 32),
    ],
  },
  {
    wn: 3,
    phase: "taper",
    km: 65,
    s: [
      s("w3-easy", "2026-09-21", "easy", 8),
      s("w3-int", "2026-09-23", "interval", 10),
      s("w3-shake", "2026-09-26", "easy", 5),
      race,
      s("w3-after", "2026-09-28", "easy", 5),
    ],
  },
];

const logs: Record<string, SessionLog> = {
  "w1-easy": { done: true, actualKm: "10" },
  "w1-int": { done: true },
  "w1-bike": { done: true, actualKm: "30" },
  "w1-skip": { skipped: true },
  "w1-long": { done: true, assignedRun: { runId: "hk_l1", startDate: "2026-09-13T07:00:00Z", duration: 8400, distanceKm: 26.3 } },
  "w2-easy": { done: true },
  "w2-tempo": { done: true },
  "w2-long": { done: true, actualKm: "32" },
  "w3-easy": { done: true },
  "w3-int": { done: true },
  "w3-shake": { done: true },
  race: { done: true, assignedRun: { runId: "hk_race", startDate: "2026-09-27T07:00:19Z", duration: 11637, distanceKm: 42.63 } },
  "w3-after": { done: true },
};

function input(overrides: Partial<BuildPrepRecapInput> = {}): BuildPrepRecapInput {
  return {
    plan,
    logs,
    healthRuns: [],
    recoveryDailyRows: [],
    raceSession: race,
    raceYmd: "2026-09-27",
    raceName: "Warschau Marathon",
    raceDistanceKm: 42.195,
    goalSeconds: 10190,
    completedBy: "race_done",
    ...overrides,
  };
}

let logSpy: jest.SpyInstance;
beforeEach(() => {
  logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
});
afterEach(() => logSpy.mockRestore());

describe("buildPrepRecapSnapshot — voller Block", () => {
  const stats = buildPrepRecapSnapshot(input());

  it("trägt schemaVersion und Renndaten", () => {
    expect(stats.schemaVersion).toBe(PREP_RECAP_SCHEMA_VERSION);
    expect(stats.race).toEqual({
      name: "Warschau Marathon",
      ymd: "2026-09-27",
      distanceKm: 42.195,
      goalSeconds: 10190,
      completedBy: "race_done",
    });
    expect(stats).not.toHaveProperty("forecastBeforeRaceSeconds");
  });

  it("zählt Wochen bis zum Renntag", () => {
    expect(stats.weeks).toEqual({ count: 3, firstYmd: "2026-09-07" });
  });

  it("summiert nur Lauf-km (kein Rad, nichts nach dem Rennen), Health-Distanz vor Plan-km", () => {
    // 10 + 12 + 26,3 | 10 + 14 + 32 | 8 + 10 + 5 + 42,63 = 169,93; Plan 55 + 64 + 65,2 = 184,2
    expect(stats.volume).toEqual({ actualKm: 169.9, plannedKm: 184.2, ratio: 0.923, marathonEquivalents: 4 });
  });

  it("zählt Einheiten wie der Home-Ring, Übersprungene extra", () => {
    expect(stats.sessions).toEqual({ done: 11, planned: 13, skipped: 1 });
  });

  it("findet die längste Serie mit Ruhetagen als neutral", () => {
    // Reset am 11.09. (übersprungen) und 18.09. (offen); 20.→27.09. = 5 Trainingstage in Folge
    expect(stats.streak).toEqual({ longestDays: 5 });
  });

  it("liefert Long Runs und den längsten Trainingslauf ohne Zielrennen", () => {
    expect(stats.longRuns).toEqual({ done: 2, total: 2, longestKm: 32 });
  });

  it("zählt Qualität ohne das Zielrennen", () => {
    expect(stats.quality).toEqual({ done: 3, total: 3 });
  });

  it("findet die stärkste Woche", () => {
    expect(stats.strongestWeek).toEqual({ weekNumber: 3, km: 65.6 });
  });

  it("fasst Phasen in Planreihenfolge zusammen (Legacy-Großschreibung normalisiert)", () => {
    expect(stats.phases).toEqual([
      { phase: "base", km: 48.3, weeks: 1 },
      { phase: "build", km: 56, weeks: 1 },
      { phase: "taper", km: 65.6, weeks: 1 },
    ]);
  });

  it("hat ohne Recovery-Daten keinen Körper-Block", () => {
    expect(stats.body).toBeNull();
  });
});

describe("buildPrepRecapSnapshot — fehlende Daten", () => {
  it("ohne Logs: kein Block mit 0 — alles null", () => {
    const stats = buildPrepRecapSnapshot(input({ logs: {} }));
    expect(stats.weeks).toEqual({ count: 3, firstYmd: "2026-09-07" });
    expect(stats.volume).toBeNull();
    expect(stats.sessions).toBeNull();
    expect(stats.streak).toBeNull();
    expect(stats.longRuns).toBeNull();
    expect(stats.quality).toBeNull();
    expect(stats.strongestWeek).toBeNull();
    expect(stats.phases).toBeNull();
  });

  it("nur übersprungene Einheiten: nichts zu feiern, keine 0", () => {
    const skippedAll: Record<string, SessionLog> = {};
    for (const week of plan) for (const session of week.s) skippedAll[session.id] = { skipped: true };
    const stats = buildPrepRecapSnapshot(input({ logs: skippedAll }));
    expect(stats.sessions).toBeNull();
    expect(stats.volume).toBeNull();
    expect(stats.streak).toBeNull();
  });

  it("ohne Phasenangaben keine Phasen-Reise", () => {
    const noPhase = plan.map((w) => ({ ...w, phase: "" }));
    expect(buildPrepRecapSnapshot(input({ plan: noPhase })).phases).toBeNull();
  });

  it("mit nur einer Phase keine Phasen-Reise", () => {
    const onePhase = plan.map((w) => ({ ...w, phase: "build" }));
    expect(buildPrepRecapSnapshot(input({ plan: onePhase })).phases).toBeNull();
  });

  it("Plan ohne km-Angaben: Plan-km und Quote null statt 0", () => {
    const noKm: PlanWeek[] = [{ wn: 1, phase: "base", km: 0, s: [s("a", "2026-09-26", "easy", 0), { ...race, km: 0 }] }];
    const stats = buildPrepRecapSnapshot(input({ plan: noKm, logs: { a: { done: true, actualKm: "8" } } }));
    expect(stats.volume).toEqual({ actualKm: 8, plannedKm: null, ratio: null, marathonEquivalents: null });
  });

  it("Phase ohne geloggte km bleibt in der Reise, aber ohne 0 km", () => {
    const partial: Record<string, SessionLog> = { ...logs };
    for (const id of ["w1-easy", "w1-int", "w1-bike", "w1-long"]) delete partial[id];
    const stats = buildPrepRecapSnapshot(input({ logs: partial }));
    expect(stats.phases).toEqual([
      { phase: "base", km: null, weeks: 1 },
      { phase: "build", km: 56, weeks: 1 },
      { phase: "taper", km: 65.6, weeks: 1 },
    ]);
  });

  it("Marathon-Umrechnung erst ab einem Marathon", () => {
    const tiny: PlanWeek[] = [{ wn: 1, phase: "base", km: 10, s: [s("a", "2026-09-26", "easy", 10), race] }];
    const stats = buildPrepRecapSnapshot(input({ plan: tiny, logs: { a: { done: true } } }));
    expect(stats.volume).toMatchObject({ actualKm: 10, marathonEquivalents: null });
  });

  it("rechnet eine Rad-Zuordnung an einer Lauf-Session nicht als Lauf-km", () => {
    const bikeAssigned: Record<string, SessionLog> = {
      ...logs,
      "w2-long": { done: true, assignedRun: { runId: "hk_bike", startDate: "2026-09-20T08:00:00Z", duration: 7200, distanceKm: 60 } },
    };
    const healthRuns = [
      { runId: "hk_bike", startDate: "2026-09-20T08:00:00Z", duration: 7200, distanceMeters: 60000, distanceUnknown: false, workoutType: "cycling" },
    ] as unknown as BuildPrepRecapInput["healthRuns"];
    const stats = buildPrepRecapSnapshot(input({ logs: bikeAssigned, healthRuns }));
    expect(stats.volume?.actualKm).toBe(137.9);
  });

  it("leerer Plan: nur Renndaten", () => {
    const stats = buildPrepRecapSnapshot(input({ plan: [], raceSession: null, completedBy: "date_passed" }));
    expect(stats.weeks).toBeNull();
    expect(stats.volume).toBeNull();
    expect(stats.race.completedBy).toBe("date_passed");
  });
});

describe("buildPrepRecapSnapshot — Körper", () => {
  const longPlan: PlanWeek[] = [
    { wn: 1, phase: "base", km: 10, s: [s("start", "2026-06-01", "easy", 10)] },
    { wn: 17, phase: "taper", km: 42, s: [race] },
  ];

  function rows(from: string, days: number, row: Partial<RecoveryDailyRow>): RecoveryDailyRow[] {
    const [y, m, d] = from.split("-").map(Number);
    return Array.from({ length: days }, (_, i) => {
      const date = new Date(y, m - 1, d + i, 12);
      const ymd = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
      return { date: ymd, ...row };
    });
  }

  it("vergleicht die ersten und letzten 4 Wochen, ohne Ausreißer", () => {
    const recovery = [
      ...rows("2026-06-01", 10, { sleepHours: 7, hrvMs: 50 }),
      { date: "2026-06-15", sleepHours: 2, signalMeta: { sleep: { confidenceWeight: 0, outlierFlag: true } } },
      ...rows("2026-09-10", 10, { sleepHours: 7.6, hrvMs: 58 }),
    ];
    const stats = buildPrepRecapSnapshot(input({ plan: longPlan, logs: {}, recoveryDailyRows: recovery }));
    expect(stats.body).toEqual({
      sleep: { firstAvgHours: 7, lastAvgHours: 7.6 },
      hrv: { firstAvgMs: 50, lastAvgMs: 58 },
    });
  });

  it("zeigt eine Metrik nur mit ≥ 7 validen Tagen je Fenster", () => {
    const recovery = [
      ...rows("2026-06-01", 10, { hrvMs: 50 }),
      ...rows("2026-06-01", 5, { sleepHours: 7 }),
      ...rows("2026-09-10", 10, { sleepHours: 7.6, hrvMs: 58 }),
    ];
    const stats = buildPrepRecapSnapshot(input({ plan: longPlan, logs: {}, recoveryDailyRows: recovery }));
    expect(stats.body?.sleep).toBeNull();
    expect(stats.body?.hrv).toEqual({ firstAvgMs: 50, lastAvgMs: 58 });
  });

  it("ignoriert Tage außerhalb des Blocks und den Renntag selbst", () => {
    const recovery = [
      ...rows("2026-05-01", 20, { sleepHours: 9, hrvMs: 90 }),
      ...rows("2026-06-01", 10, { sleepHours: 7, hrvMs: 50 }),
      ...rows("2026-09-10", 10, { sleepHours: 7.6, hrvMs: 58 }),
      { date: "2026-09-27", sleepHours: 4, hrvMs: 20 },
    ];
    const stats = buildPrepRecapSnapshot(input({ plan: longPlan, logs: {}, recoveryDailyRows: recovery }));
    expect(stats.body?.sleep).toEqual({ firstAvgHours: 7, lastAvgHours: 7.6 });
  });
});
