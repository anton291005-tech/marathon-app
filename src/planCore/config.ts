/**
 * Alle Zahlen und Tabellen des Plan-Kerns (docs/plan-spec.md). Das Spoho-Review ändert nur diese Datei.
 *
 * Jeder Wert ist ein `Param`: `value`, Herkunft `source` und Fundstelle `spec` ("§5.3").
 *   L = Literatur · P = Praxis-Konsens (Daniels/Pfitzinger/Hansons) · E = eigene Setzung → Review-Punkt
 * Wo die Spec keine Herkunft nennt, steht `E` (eigene Setzung, im Review zu bestätigen).
 *
 * Die Invarianten (§12) lesen dieselben Einträge: I3/I4 `volume.growth`, I5 `volume.peak*`, I7 `placement.maxQ`,
 * I8 `intensity.qualityShareHard`, I9 `longRun.*`, I12 `library.*`, I13 `taper.*`, I15 `raceWeek.*`.
 * Jede Stelle der Spec hat genau einen Eintrag. Nennt die Spec eine Zahl an zwei Stellen (150 km Startumfang,
 * 29 km/110 min bei M und LR+M), stehen beide Einträge bewusst da; config.test.ts hält sie gleich.
 * Wochen-Entlastung (§5.3, fest −20 %) und Long-Run-Entlastung (§7.1, −20 bis −30 %) sind getrennte Einträge; der erste liegt im Bereich des zweiten.
 *
 * Regeln für Änderungen: Wert ändern → `CONFIG_VERSION` erhöhen → Snapshot bewusst aktualisieren.
 * Der Kern wird mit `target: es5` geprüft: keine Iteration über Set/Map, keine Spreads darüber.
 */

import type { Distance, RunDays, Weekday } from "./types";

export type ParamSource = "L" | "P" | "E";

export type Param<T> = {
  readonly value: T;
  readonly source: ParamSource;
  /** Abschnitt in docs/plan-spec.md, z. B. "§5.3" oder "§7.1". */
  readonly spec: string;
};

/** Bereich aus der Spec ("−20 bis −30 %"); `min ≤ max`. */
export type Range = { readonly min: number; readonly max: number };

type ByDistance<T> = Readonly<Record<Distance, T>>;
type ByRunDays<T> = Readonly<Record<RunDays, T>>;

/** Phasen der Spec (§4). "specific" heißt in der App "peak". */
export type SpecPhase = "base" | "build" | "specific" | "taper";

/** Slots der Wochenschablonen (§6): LR Long Run, Q1/Q2 Qualität (Q1L = leichte Q1), MLR mittellanger Lauf. */
export type WeekSlot = "LR" | "Q1" | "Q1L" | "Q2" | "MLR" | "E" | "REC";

/** Einträge der Q-Typen-Tabelle (§7.2). */
export type QualityToken =
  | "STRIDES"
  | "R"
  | "I"
  | "T"
  | "M"
  | "LR+M"
  | "HM_PACE_BLOCKS"
  | "SHORT_I_OR_RACE_PACE"
  | "SHORT_T_OR_RACE_PACE"
  | "SHORT_HM_PACE"
  | "SHORT_M_PACE";

const L = <T>(value: T, spec: string): Param<T> => ({ value, source: "L", spec });
const P = <T>(value: T, spec: string): Param<T> => ({ value, source: "P", spec });
const E = <T>(value: T, spec: string): Param<T> => ({ value, source: "E", spec });
const range = (min: number, max: number): Range => ({ min, max });

function deepFreeze<T>(node: T): T {
  if (node !== null && typeof node === "object" && !Object.isFrozen(node)) {
    Object.freeze(node);
    Object.keys(node as Record<string, unknown>).forEach((key) => {
      deepFreeze((node as Record<string, unknown>)[key]);
    });
  }
  return node;
}

/** Erhöhen bei jeder Änderung eines Werts; steht später in `plan.meta.core.configVersion`. */
export const CONFIG_VERSION = "0.4.0";

export const CONFIG = deepFreeze({
  /** §0 Scope MVP */
  scope: {
    distances: E<Distance[]>(["5k", "10k", "hm", "m"], "§0"),
    runDaysPerWeek: E(range(3, 6), "§0"),
    /** Renndistanz in km wie die App sie heute plant (src: raceConfig 21,1 / 42,2); exakte Distanz = Review-Punkt. */
    raceKm: E<ByDistance<number>>({ "5k": 5, "10k": 10, hm: 21.1, m: 42.2 }, "§8"),
  },

  /** §1 Begriffe: harte Einheit */
  hardSession: {
    /** Long Run ab dieser Dauer zählt als hart. */
    longRunMinutes: E(90, "§1"),
    /** Einheit mit mindestens so vielen km bei M-Pace oder schneller zählt als hart. */
    kmAtMPaceOrFaster: E(5, "§1"),
  },

  /** §2 Eingaben: Wertebereiche und Vorgaben */
  inputs: {
    currentWeeklyKm: E(range(0, 150), "§2"),
    longestRecentRunKm: E(range(0, 45), "§2"),
    /** Vorgabe für `longestRecentRunKm`: Anteil an `currentWeeklyKm`, mindestens `longestRecentRunFallbackMinKm`. */
    longestRecentRunFallbackShare: E(0.3, "§2"),
    longestRecentRunFallbackMinKm: E(5, "§2"),
    /** Vorgabe für den Long-Run-Tag, in dieser Reihenfolge. */
    defaultLongRunDays: E<Weekday[]>(["So", "Sa"], "§2"),
  },

  /** §3 Form und Pace */
  form: {
    /** Rennen bis zu diesem Alter zählen voll. */
    vdotFreeWeeks: E(12, "§3"),
    /** Abschlag je angefangene Wochen darüber. */
    vdotPenaltyStepWeeks: E(6, "§3"),
    vdotPenaltyPerStep: E(1, "§3"),
    vdotPenaltyMax: E(4, "§3"),
    /** Zielpace nur, wenn VDOT_Ziel − VDOT_aktuell höchstens so groß ist. */
    goalVdotGapMax: E(2, "§3"),
    /** E-Pace ohne Form-Angabe (Einsteiger-Modus), Sekunden je km. */
    beginnerEPaceSecPerKm: E(420, "§3"),
    /** Anteil an VO2max je Pace-Art (Daniels-Tabellen). */
    vo2maxShare: L<Record<"E" | "M" | "T" | "I" | "R", Range>>(
      { E: range(0.59, 0.74), M: range(0.75, 0.84), T: range(0.83, 0.88), I: range(0.95, 1.0), R: range(1.05, 1.2) },
      "§3",
    ),
    /** REC-Pace = E-Pace plus dieser Abstand, Sekunden je km. */
    recPaceOffsetSecPerKm: E(range(20, 40), "§3"),
    /** App-Zone je Pace-Art. */
    appZone: E<Record<"REC" | "E" | "M" | "T" | "I" | "R", string>>(
      { REC: "Z1", E: "Z2", M: "Z3", T: "Z4", I: "Z5", R: "Z5+" },
      "§3",
    ),
  },

  /** §4 Planlänge und Phasen */
  planLength: {
    hardMinWeeks: E<ByDistance<number>>({ "5k": 4, "10k": 5, hm: 6, m: 8 }, "§4"),
    /** Unter dieser Empfehlung: Warnung, Peak reduziert. */
    belowRecommendedWeeks: E<ByDistance<Range>>(
      { "5k": range(4, 5), "10k": range(5, 7), hm: range(6, 9), m: range(8, 11) },
      "§4",
    ),
    recommendedWeeks: P<ByDistance<Range>>(
      { "5k": range(6, 10), "10k": range(8, 12), hm: range(10, 14), m: range(12, 18) },
      "§4",
    ),
    /** Darüber beginnt der Plan erst `maxWeeks` Wochen vor dem Rennen. */
    maxWeeks: E<ByDistance<number>>({ "5k": 16, "10k": 16, hm: 18, m: 20 }, "§4"),
  },
  phases: {
    /** Taper-Wochen inkl. Rennwoche. */
    taperWeeks: L<ByDistance<number>>({ "5k": 1, "10k": 1, hm: 2, m: 2 }, "§4"),
    /** Aufteilung der Wochen vor dem Taper. */
    split: E<Record<"base" | "build" | "specific", number>>({ base: 0.35, build: 0.35, specific: 0.3 }, "§4"),
    /** Jede Phase hat mindestens so viele Wochen, sobald genug Restwochen da sind. */
    minWeeksPerPhase: E(1, "§4"),
    minRestWeeksForAllPhases: E(6, "§4"),
    /** Hat die Rennwoche weniger Tage, kommt eine Taper-Woche dazu (Rennen am Montag hätte sonst nur eine). */
    shortRaceWeekDays: E(4, "§4"),
  },

  /** §5.1–§5.3 Wochenumfang */
  volume: {
    startKmMax: E(150, "§5.1"),
    minStartKm: E<ByDistance<number>>({ "5k": 10, "10k": 15, hm: 20, m: 25 }, "§5.1"),
    /** Woche 1 hat mindestens so viele km (Schutz vor 0 km: 1,3 × 0 bleibt 0). Mindestumfang je Lauftag folgt in Schritt 6. */
    weekOneMinKm: E(5, "§5.1"),
    /** Peak höchstens Start × Faktor. */
    peakStartFactor: E(1.5, "§5.2"),
    /**
     * Lage des Peaks im Korridor [Untergrenze, Obergrenze] (0 = unten, 1 = oben), wenn der Aufrufer keine angibt.
     * Review-Punkt: Schritt 7 leitet sie aus der VDOT-Lücke zwischen Ziel und Form ab (schnelleres Ziel → höher).
     */
    peakPosition: E(0.75, "§5.2"),
    /** Peak-Tabelle (km/Woche) nach Distanz und Lauftagen. */
    peakKm: E<ByDistance<ByRunDays<Range>>>(
      {
        "5k": { 3: range(20, 30), 4: range(25, 40), 5: range(35, 55), 6: range(45, 70) },
        "10k": { 3: range(25, 35), 4: range(30, 45), 5: range(40, 60), 6: range(50, 80) },
        hm: { 3: range(30, 40), 4: range(35, 55), 5: range(45, 70), 6: range(55, 90) },
        m: { 3: range(35, 50), 4: range(45, 65), 5: range(55, 85), 6: range(65, 110) },
      },
      "§5.2",
    ),
    growth: {
      /** Zielwert: Woche zu Woche höchstens +10 % oder +4 km, das Größere. */
      weeklyShare: P(0.1, "§5.3"),
      weeklyKm: P(4, "§5.3"),
      /** Harte Grenze: km(w) ≤ Faktor × km(w−2). */
      twoWeekFactor: L(1.3, "§5.3"),
    },
    recovery: {
      /** Jede n-te Woche in Basis/Aufbau/Spezifisch (3:1). */
      everyNWeeks: P(4, "§5.3"),
      /** Fester Abschlag zur Vorwoche; −20 % ist verträglich mit I3 (danach ist wieder das alte Niveau erreichbar). */
      reduction: P(0.2, "§5.3"),
      /** Wort, an dem die App heute Entlastungswochen im `focus` erkennt. */
      focusKeyword: E("Entlastung", "§5.3"),
    },
    /** Peak frühestens so viele Wochen vor dem Rennen. */
    peakEarliestWeeksBeforeRace: P(4, "§5.3"),
  },

  /** §5.4 Taper */
  taper: {
    /** Insgesamt gegenüber dem Peak. */
    totalReduction: L(range(0.41, 0.6), "§5.4"),
    /** M/HM: erste Taper-Woche (T−2) in Anteilen des Peaks; 5k/10k nutzen bei einer Zusatz-Taper-Woche die Untergrenze. */
    firstWeekShare: E(range(0.65, 0.75), "§5.4"),
    /** M/HM: Rennwoche ohne Rennen. */
    raceWeekShare: E(range(0.35, 0.5), "§5.4"),
    /** 5k/10k: Rennwoche ohne Rennen. */
    raceWeekShareShort: E(range(0.4, 0.6), "§5.4"),
    /** Tage vor dem Rennen einer vollen Rennwoche (Rennen am Sonntag); bei weniger Tagen wird der Anteil ohne Rennen anteilig kleiner. */
    fullRaceWeekDaysBefore: E(6, "§5.4"),
    qualitySessionsPerWeek: L(1, "§5.4"),
    /** Lauftage im Taper mindestens `runDaysPerWeek` minus so viele. */
    minRunDaysBelowRunDays: L(1, "§5.4"),
  },

  /** §6 Wochenschablonen und Platzierung */
  weekTemplates: {
    /** "base" = Basis, "main" = Aufbau und Spezifisch. Bei 3 Tagen in Basis kommen Strides dazu (`stridesInBase3Days`). */
    slots: E<ByRunDays<{ base: WeekSlot[]; main: WeekSlot[] }>>(
      {
        3: { base: ["LR", "E", "E"], main: ["LR", "Q1", "E"] },
        4: { base: ["LR", "Q1L", "E", "E"], main: ["LR", "Q1", "Q2", "E"] },
        5: { base: ["LR", "Q1", "E", "E", "E"], main: ["LR", "Q1", "Q2", "E", "E"] },
        6: { base: ["LR", "Q1", "E", "E", "E", "REC"], main: ["LR", "Q1", "Q2", "MLR", "E", "REC"] },
      },
      "§6",
    ),
    stridesInBase3Days: E(true, "§6"),
    /** Q2 bei 4 Lauftagen frühestens ab dieser Phase (und nie im Einsteiger-Modus). */
    q2At4DaysFromPhase: E<SpecPhase>("build", "§6"),
    /** MLR nur bei diesen Distanzen, sonst E. */
    mlrDistances: E<Distance[]>(["hm", "m"], "§6"),
  },
  placement: {
    /** Q1 liegt etwa so viele Tage vor dem Long Run. */
    q1DaysBeforeLongRun: E(3, "§6"),
    /** Q2 liegt etwa so viele Tage nach dem Long Run. */
    q2DaysAfterLongRun: E(2, "§6"),
    /** Zwischen zwei harten Einheiten mindestens so viele Tage mit E/REC/Ruhe (≈ 48 h). */
    minEasyDaysBetweenHard: P(1, "§6"),
    /** Q-Einheiten pro Woche ohne Long Run, höchstens. */
    maxQ: E<ByRunDays<number>>({ 3: 1, 4: 2, 5: 2, 6: 2 }, "§6"),
  },
  intensity: {
    /** Qualitäts-km Ziel, Anteil an den Wochen-km. */
    qualityShareTarget: L(0.2, "§6"),
    /** Qualitäts-km harte Grenze. */
    qualityShareHard: E(0.25, "§6"),
  },

  /** §7 Einheiten-Bibliothek */
  library: {
    /** Ein-/Auslaufen je Seite in km; zählt zu den Einheiten-km, nicht zu den Qualitäts-km. */
    warmupCooldownKm: E(range(1.5, 3), "§7"),
    strides: {
      reps: E(range(4, 8), "§7"),
      seconds: E(20, "§7"),
    },
    rec: {
      minutes: E(range(20, 45), "§7"),
    },
    e: {
      minutes: E(range(25, 75), "§7"),
      /** Bei 6 Lauftagen bis zu dieser Dauer. */
      minutesMaxSixDays: E(90, "§7"),
      maxShareOfLongRun: E(0.75, "§7"),
    },
    mlr: {
      minutes: P(range(75, 110), "§7"),
      maxShareOfLongRun: P(0.75, "§7"),
      minDaysFromLongRun: P(2, "§7"),
      /**
       * REVIEW-PUNKT (Widerspruch §6/§7): §7 nennt MLR bei 5–6 Lauftagen, die Schablone in §6 hat MLR nur bei 6.
       * Bis zur Klärung gilt die Schablone (`weekTemplates.slots`); dieser Bereich wird erst dann wirksam.
       * Die Distanzen stehen nur in `weekTemplates.mlrDistances` (§6), dort gilt "MLR nur HM/M".
       */
      runDays: E(range(5, 6), "§7"),
      fromPhase: E<SpecPhase>("build", "§7"),
    },
    longRunPlusM: {
      /** M-Anteil am Long Run, höchstens. */
      maxShareOfLongRun: E(0.5, "§7"),
      maxKm: L(29, "§7"),
      maxMinutes: L(110, "§7"),
      distances: E<Distance[]>(["m"], "§7"),
      phase: E<SpecPhase>("specific", "§7"),
    },
    m: {
      maxKm: L(29, "§7"),
      maxMinutes: L(110, "§7"),
    },
    t: {
      /** Dauerlauf-Block höchstens so lange (Spec nennt keine Herkunft an dieser Zelle). */
      continuousMaxMinutes: E(20, "§7"),
      /** Cruise-Intervalle (Beispiel aus der Spec). */
      cruiseReps: E(range(3, 5), "§7"),
      cruiseRepKm: E(1.6, "§7"),
      cruiseRestSeconds: E(60, "§7"),
      /** T-km je Einheit höchstens Anteil an den Wochen-km. */
      maxShareOfWeek: L(0.1, "§7"),
    },
    i: {
      repMinutes: E(range(3, 5), "§7"),
      /** Trabpause ≈ so lang wie die Wiederholung. */
      restToRepRatio: E(1, "§7"),
      maxShareOfWeek: L(0.08, "§7"),
      maxKm: L(10, "§7"),
    },
    r: {
      repMeters: E(range(200, 400), "§7"),
      maxShareOfWeek: L(0.05, "§7"),
      maxKm: L(8, "§7"),
      distances: E<Distance[]>(["5k", "10k"], "§7"),
    },
  },

  /** §7.1 Long Run */
  longRun: {
    /** Anteil an den Wochen-km, harte Grenze. */
    maxShareOfWeek: E<ByRunDays<number>>({ 3: 0.55, 4: 0.5, 5: 0.38, 6: 0.33 }, "§7.1"),
    minutesTarget: L(150, "§7.1"),
    minutesHard: E(180, "§7.1"),
    /** Steigerung zur letzten LR: das Größere aus km und Anteil, höchstens `absoluteMaxStepKm`. */
    maxStepKm: E(2, "§7.1"),
    maxStepShare: E(0.15, "§7.1"),
    absoluteMaxStepKm: E(3, "§7.1"),
    /** Startwert höchstens längster Lauf der letzten 4 Wochen plus so viel. */
    startAboveLongestRecentKm: E(2, "§7.1"),
    /** Peak-Ziele; Marathon nach Lauftagen getrennt. */
    peakKm: P<Readonly<Record<"5k" | "10k" | "hm", Range>>>(
      { "5k": range(8, 14), "10k": range(12, 18), hm: range(16, 22) },
      "§7.1",
    ),
    peakKmMarathonFewDays: P(range(26, 30), "§7.1"),
    peakKmMarathonManyDays: P(range(30, 34), "§7.1"),
    /** Ab dieser Lauftage-Zahl gilt `peakKmMarathonManyDays`. */
    marathonManyDaysFrom: P(5, "§7.1"),
    /** Marathon mit vielen Lauftagen: so viele Läufe von mindestens `marathonLongRunKm`. */
    marathonLongRunsAtLeast: P(range(2, 3), "§7.1"),
    marathonLongRunKm: P(30, "§7.1"),
    /** Genau ein Long Run pro Woche außer in der Rennwoche bei diesen Distanzen. */
    requiredEveryWeek: E<Distance[]>(["hm", "m"], "§7.1"),
    /** Entlastungswoche: Long Run um so viel kürzer. */
    recoveryReduction: E(range(0.2, 0.3), "§7.1"),
  },

  /** §7.2 Q-Typen je Phase und Distanz */
  qualityTypes: {
    byDistance: E<ByDistance<Record<SpecPhase, QualityToken[]>>>(
      {
        "5k": {
          base: ["STRIDES", "R"],
          build: ["I", "T"],
          specific: ["I", "R"],
          taper: ["SHORT_I_OR_RACE_PACE"],
        },
        "10k": {
          base: ["STRIDES", "T"],
          build: ["I", "T"],
          specific: ["I", "T"],
          taper: ["SHORT_T_OR_RACE_PACE"],
        },
        hm: {
          base: ["STRIDES", "T"],
          build: ["T", "I"],
          specific: ["T", "HM_PACE_BLOCKS"],
          taper: ["SHORT_HM_PACE"],
        },
        m: {
          base: ["STRIDES", "T"],
          build: ["T", "M"],
          specific: ["M", "LR+M", "T"],
          taper: ["SHORT_M_PACE"],
        },
      },
      "§7.2",
    ),
    /** R bzw. T in der Basis frühestens ab dieser Planwoche. */
    baseQualityFromWeek: E(3, "§7.2"),
    /** Einsteiger-Modus: in der Basis nur diese Q-Arten. */
    beginnerBaseOnly: E<QualityToken[]>(["STRIDES"], "§7.2"),
    /** Einsteiger-Modus: im ganzen Plan nicht erlaubt. */
    beginnerForbidden: E<QualityToken[]>(["I", "R"], "§7.2"),
  },

  /** §8 Rennwoche */
  raceWeek: {
    /** Letzte Q-Einheit mindestens so viele Tage vor dem Rennen. */
    lastQDaysBefore: E<ByDistance<number>>({ "5k": 3, "10k": 3, hm: 3, m: 4 }, "§8"),
    /** Die letzten Tage vor dem Rennen: nur REC/E bis zur Höchstdauer oder Ruhe. */
    lastDaysCount: E(2, "§8"),
    lastDaysMaxMinutes: E(30, "§8"),
  },
});
