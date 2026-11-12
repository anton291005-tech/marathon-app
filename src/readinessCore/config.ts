/**
 * Alle Zahlen des Readiness-Kerns („Tagesform“, docs/readiness-spec.md). Das Spoho-Review ändert nur diese Datei.
 *
 * Jeder Wert ist ein `Param`: `value`, Herkunft `source` und Fundstelle `spec` ("§4.3").
 *   L = Literatur · P = Praxis-Konsens · E = eigene Setzung → Review-Punkt (Spec §19)
 * Die Herkunft folgt den Markierungen [L]/[P]/[E] der Spec. Wo eine Zeile Literatur nur für die Richtung, aber nicht
 * für die Größe nennt (z. B. β_L), steht `E`.
 *
 * Regeln für Änderungen: Wert ändern → `CONFIG_VERSION` erhöhen → Snapshot bewusst aktualisieren.
 * Der Kern wird wie der Plan-Kern mit `target: es5` geprüft: keine Iteration über Set/Map, keine Spreads darüber.
 */

import type { ActionCode, Level } from "./types";

export type ParamSource = "L" | "P" | "E";

export type Param<T> = {
  readonly value: T;
  readonly source: ParamSource;
  /** Abschnitt in docs/readiness-spec.md, z. B. "§4.3" oder "§8.3a". */
  readonly spec: string;
};

export type Range = { readonly min: number; readonly max: number };

const p = <T>(value: T, source: ParamSource, spec: string): Param<T> => ({ value, source, spec });

export const CONFIG_VERSION = "0.1.0";

export const CONFIG = {
  /** §3 Plausibilitätsgrenzen: Werte außerhalb werden verworfen, nicht geklammert. */
  plausibility: {
    sleepHours: p<Range>({ min: 2, max: 14 }, "E", "§3"),
    heartRateBpm: p<Range>({ min: 30, max: 110 }, "E", "§3"),
    sdnnMs: p<Range>({ min: 5, max: 300 }, "E", "§3"),
    respiratoryRate: p<Range>({ min: 6, max: 30 }, "E", "§3"),
    rpe: p<Range>({ min: 0, max: 10 }, "L", "§3"),
    durationMin: p<Range>({ min: 5, max: 600 }, "E", "§3"),
  },

  /** §4.2 Baselines objektiver Marker. */
  baseline: {
    windowDays: p(28, "L", "§4.2"),
    minValues: p(14, "E", "§4.2"),
    /** Faktor für MAD → Standardabweichung bei Normalverteilung. */
    madScale: p(1.4826, "L", "§4.2"),
    minSpread: {
      heartRateBpm: p(2.0, "L", "§4.2"),
      lnHrv: p(0.1, "E", "§4.2"),
      sleepHours: p(0.75, "E", "§4.2"),
    },
    zClamp: p(3, "E", "§4.2"),
  },

  /** §4.3 Block B – Körpersignale. */
  body: {
    heartRateMeanDays: p(3, "E", "§4.3"),
    heartRateMinValues: p(2, "E", "§4.3"),
    heartRateDeadband: p(0.5, "P", "§4.3"),
    hrvMinSamplesPerNight: p(3, "E", "§4.3"),
    hrvMeanDays: p(7, "L", "§4.3"),
    hrvMinValues: p(4, "L", "§4.3"),
    /** Totband für SDNN aus Hintergrundmessungen (doppelt so breit wegen ~29 % Messfehler). */
    hrvDeadbandSdnn: p(1.0, "E", "§4.3"),
    /** Totband für rMSSD aus durchgehender Nachtmessung (später). */
    hrvDeadbandRmssd: p(0.5, "P", "§4.3"),
    /** z_HRV wird auf [hrvFloor, 0] begrenzt: nie positiv, nie mehr als −1. */
    hrvFloor: p(-1.0, "E", "§4.3"),
    reliability: {
      sleepHeartRate: p(1, "E", "§4.3"),
      restingHeartRateOnly: p(1.5, "E", "§4.3"),
      hrvOnly: p(2, "E", "§4.3"),
    },
  },

  /** §4.4 Block C – Schlaf. */
  sleep: {
    weightLastNight: p(0.5, "E", "§4.4"),
    weightThreeNights: p(0.5, "E", "§4.4"),
    threeNightsMinValues: p(2, "E", "§4.4"),
    deadband: p(0.5, "P", "§4.4"),
    absoluteFloorHours: p(6, "E", "§4.4"),
    floorLastNightZ: p(-1, "E", "§4.4"),
    floorThreeNightsZ: p(-2, "E", "§4.4"),
    reliabilityWithDuration: p(1, "E", "§4.4"),
    reliabilityQualityOnly: p(1.5, "E", "§4.4"),
  },

  /** §4.5 Block A – Befinden (Check-in 1–5). */
  wellbeing: {
    scaleMidpoint: p(3, "E", "§4.5"),
    pseudoCount: p(7, "E", "§4.5"),
    minSpread: p(0.7, "E", "§4.5"),
    spreadBeforeMinCount: p(1.0, "E", "§4.5"),
    minCountForOwnSpread: p(7, "E", "§4.5"),
    reliability: p(1, "E", "§4.5"),
  },

  /** §4.6 Zustand: Erwartung und Update (lokales Niveau-Modell). */
  state: {
    phi: p(0.7, "E", "§4.6"),
    q: p(1.0, "E", "§4.6"),
    betaLoad: p(0.3, "E", "§4.6"),
    betaLife: p(0.2, "E", "§4.6"),
    r0: p(0, "E", "§4.6"),
    p0: p(1, "E", "§4.6"),
    resetAfterGapDays: p(3, "E", "§4.6"),
    rClamp: p(3, "E", "§4.6"),
  },

  /** §4.7 Ausgabe: Stufe, Datenbasis, Index. */
  output: {
    /** Untergrenzen von R je Stufe; `low` liegt darunter. */
    levelThresholds: p<Readonly<Record<Exclude<Level, "low">, number>>>(
      { above: 0.5, normal: -0.5, below: -1.25 },
      "E",
      "§4.7",
    ),
    hysteresis: p(0.1, "E", "§4.7"),
    nearBoundary: p(0.15, "E", "§4.7"),
    getToKnowDays: p(14, "E", "§4.7"),
    highBasisMinCheckIns: p(14, "E", "§4.7"),
    noBasisAfterDays: p(3, "E", "§4.7"),
    indexCenter: p(50, "E", "§4.7"),
    indexPerR: p(20, "E", "§4.7"),
    indexRoundTo: p(5, "E", "§4.7"),
  },

  /** §5 Trainingslast (AU = RPE × Minuten). */
  load: {
    /** Gewichte in RPE-Einheiten je Einheiten-Art, wenn keine RPE vorliegt. */
    weightsByKind: p(
      {
        REC: 1.5,
        E: 2,
        LR: 3,
        MLR: 3,
        M: 4,
        T: 6,
        I: 8,
        R: 8,
        RACE: 9,
        BIKE: 2.5,
        STRENGTH: 3,
        SWIM: 2.5,
      },
      "E",
      "§5",
    ),
    fallbackPaceMinPerKm: p(6.5, "E", "§5"),
    crossTrainingDefaultMin: p(45, "E", "§5"),
    personalRpeMinSessions: p(10, "E", "§5"),
    personalRpeBounds: p<Range>({ min: 0.5, max: 2 }, "E", "§11"),
    atlDays: p(7, "P", "§5"),
    ctlDays: p(42, "P", "§5"),
    prefillDays: p(28, "E", "§5"),
    preStartWeight: p(2, "E", "§5"),
    capWhileFewDays: p(1, "E", "§5"),
    fewDaysThreshold: p(14, "E", "§5"),
    minCtlAu: p(50, "E", "§5"),
    pressurePerPoint: p(0.25, "E", "§5"),
    pressureMax: p(3, "E", "§5"),
    deviationRpePoints: p(2, "E", "§5"),
    deviationSessionsInRow: p(2, "E", "§5"),
  },

  /** §6 Check-in. */
  checkIn: {
    defaultSelfSleepHours: p(7.5, "E", "§6.1"),
    sleepStepperMinutes: p(15, "E", "§6.1"),
    validUntilHour: p(14, "E", "§6.1"),
    defaultReminder: p("07:30", "E", "§6.1"),
  },

  /** §7 Kalender und Leben. */
  calendar: {
    eveningEndAfter: p("18:00", "E", "§7.2"),
    morningStartBefore: p("12:00", "E", "§7.2"),
    sleepBufferMin: p(60, "E", "§7.2"),
    overnightMinHoursNextDay: p(2, "E", "§7.2"),
    quickReturnHours: p(11, "L", "§7.2"),
    windowStart: p("06:00", "E", "§7.2"),
    windowEnd: p("22:00", "E", "§7.2"),
    windowExtraMin: p(45, "E", "§7.2"),
    lateTrainingAfter: p("21:00", "E", "§7.2"),
    clusterTrigramJaccard: p(0.6, "E", "§7.3"),
    maxQuestionsPerDay: p(1, "E", "§7.3"),
    maxQuestionsPerWeek: p(3, "E", "§7.3"),
    skipLimit: p(3, "E", "§7.3"),
    lifePressure: {
      sleepUnder6h: p(2, "E", "§7.4"),
      sleep6to7h: p(1, "E", "§7.4"),
      quickReturn: p(0.5, "E", "§7.4"),
      boundHoursOver10: p(1, "E", "§7.4"),
      physicalWorkOver6h: p(1, "E", "§7.4"),
      examToday: p(1, "E", "§7.4"),
      examYesterday: p(0.5, "E", "§7.4"),
      travelDemanding: p(1.5, "E", "§7.4"),
      travelDays: p(2, "E", "§7.4"),
      demandingYesterday: p(1, "E", "§7.4"),
      mediumYesterday: p(0.5, "E", "§7.4"),
      max: p(3, "E", "§7.4"),
    },
    boundHoursHigh: p(10, "E", "§7.4"),
    physicalShiftHours: p(6, "E", "§7.4"),
    suitabilityHorizonDays: p(14, "E", "§7.5"),
    examPhaseCount: p(2, "E", "§7.5"),
    examPhaseDays: p(7, "E", "§7.5"),
  },

  /** §8 Von Readiness zur Handlung. */
  actions: {
    signalZ: p(-0.5, "E", "§8.3"),
    lighterFactor: p(0.75, "L", "§8.2"),
    easyMinMinutes: p(20, "E", "§8.2"),
    easyInsteadMaxMinutes: p(60, "E", "§8.2"),
    moveWindowDays: p(3, "E", "§8.2"),
    longRunMoveDays: p(1, "E", "§8.5"),
    calmerWeekEasyFactor: p(0.8, "E", "§8.4"),
    calmerWeekLongRunFactor: p(0.75, "E", "§8.4"),
    calmerWeekTriggerDays: p(3, "E", "§8.4"),
    calmerWeekTriggerLowDays: p(2, "E", "§8.4"),
    persistentWindowDays: p(10, "E", "§8.4"),
    persistentMinDays: p(7, "E", "§8.4"),
    weekProposalsMax: p(2, "L", "§8.4"),
    minDaysBetweenLongRuns: p(6, "E", "§8.6"),
    longRunHardMinutes: p(90, "E", "§8.3"),
    /** Reihenfolge, in der ein Vorschlag bei Regelverstoß nachrückt (immer weniger Belastung). */
    fallbackOrder: p<readonly ActionCode[]>(["H2", "H3"], "E", "§8.1"),
    lastQualityBeforeRaceDays: p({ marathon: 4, other: 3 }, "P", "§8.7"),
  },

  /** §9 Sicherheit. */
  safety: {
    heartRateElevated: p({ bpm: 3, spreads: 1.5 }, "L", "§9.1"),
    heartRateClearlyElevated: p({ bpm: 5, spreads: 2 }, "L", "§9.1"),
    respiratoryElevated: p(1.0, "L", "§9.1"),
    respiratoryClearlyElevated: p(1.5, "L", "§9.1"),
    temperatureElevated: p(0.5, "L", "§9.1"),
    temperatureClearlyElevated: p(0.8, "L", "§9.1"),
    coldEasyMaxMinutes: p(30, "E", "§9.2"),
    returnTestMinutes: p<Range>({ min: 10, max: 20 }, "E", "§9.2"),
    returnEasyDays: p(2, "E", "§9.2"),
    illnessDoctorAfterDays: p(7, "L", "§9.2"),
    replanAfterPauseDays: p(7, "E", "§9.2"),
    painStopAt: p(4, "P", "§9.3"),
    painDoctorDaysStrong: p(3, "E", "§9.3"),
    painDoctorDaysAny: p(7, "E", "§9.3"),
    persistentEasyDays: p(3, "P", "§9.4"),
  },

  /** §11 Lernen über Zeit. */
  learning: {
    insightMinDaysEach: p(10, "E", "§11"),
    insightWindowDays: p(120, "E", "§11"),
    insightBootstrapBlockDays: p(3, "L", "§11"),
    insightInterval: p(0.9, "E", "§11"),
    insightMinEffectSpreads: p(0.5, "E", "§11"),
    insightFdr: p(0.1, "L", "§11"),
    insightShrinkN: p(15, "E", "§11"),
    insightExpiryDays: p(90, "E", "§11"),
    weekdayPatternWeeks: p(8, "E", "§11"),
    sensitivityMinPairedDays: p(90, "E", "§11"),
    sensitivityShrinkN: p(60, "E", "§11"),
    sensitivityBounds: p<Range>({ min: 0.5, max: 2 }, "E", "§11"),
  },
} as const;

export type ReadinessConfig = typeof CONFIG;
