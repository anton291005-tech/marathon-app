/**
 * Typen des Readiness-Kerns („Tagesform“, docs/readiness-spec.md).
 *
 * Der Kern ist rein: Er bekommt alle Eingaben als Daten (inklusive `todayYmd`), hat keine Uhr, kein Netz und
 * keinen Speicher. Kalendertage sind immer `YYYY-MM-DD` (lokaler Kalendertag des Nutzers).
 * Stand Schritt 1: nur Typen; die Logik kommt mit den Schritten 5–10 (docs/readiness-plan.md).
 */

/** Kalendertag `YYYY-MM-DD`. */
export type Ymd = string;

/** §4.7 Stufe der Tagesform, relativ zum eigenen Normal. */
export type Level = "above" | "normal" | "below" | "low";

/** §4.7 Datenbasis der heutigen Einschätzung. */
export type DataBasis = "high" | "medium" | "low" | "none";

/** §4.1 Messblöcke: A Befinden, B Körpersignale, C Schlaf. */
export type BlockId = "A" | "B" | "C";

/** §8.2 Handlungsstufen. */
export type ActionCode = "H0" | "H1" | "H2" | "H3" | "H4";

/** §7.3 Art eines Termin-Clusters. */
export type EventKind =
  | "work_seated"
  | "work_physical"
  | "study"
  | "exam"
  | "sport"
  | "travel"
  | "private"
  | "ignore";

/** §7.3 Anstrengung eines Termin-Clusters. */
export type EventEffort = "light" | "medium" | "demanding";

/** §7.5 Tageseignung für harte Einheiten. */
export type DaySuitability = "free" | "limited" | "unsuitable";

/** §6.1 Morgen-Check-in: je 1–5, höher = besser; Chips setzen Sicherheitsflags (§9). */
export type CheckIn = {
  readonly day: Ymd;
  readonly sleepQuality?: number;
  readonly energy?: number;
  readonly legs?: number;
  readonly mind?: number;
  /** Nur ohne Schlafdaten der Uhr. */
  readonly sleepHoursSelf?: number;
  readonly pain?: {
    readonly area: string;
    /** 0–10 beim Gehen oder Laufen. */
    readonly severity: number;
    readonly alteredGait: boolean;
  };
  readonly illness?: {
    readonly symptoms: readonly ("nose_throat" | "chest" | "fever" | "gastro")[];
    /** Zusatzfrage bei Brust-Angabe (§9.2). */
    readonly redFlag?: boolean;
  };
};

/** §3 Objektive Marker je Nacht/Tag aus Apple Health (alle optional). */
export type DayMarkers = {
  readonly day: Ymd;
  readonly sleepHours?: number;
  /** Mittlere Herzfrequenz im Schlaffenster. */
  readonly sleepHeartRate?: number;
  /** Apples Ruhepuls (Tag), nur genutzt ohne Schlaf-Herzfrequenz. */
  readonly restingHeartRate?: number;
  /** Median der SDNN-Werte im Schlaffenster (ms). */
  readonly hrvNightMs?: number;
  readonly hrvSamples?: number;
  readonly respiratoryRate?: number;
  /** Abweichung der Handgelenkstemperatur vom eigenen Mittel (°C), falls verfügbar. */
  readonly temperatureDelta?: number;
};

/** §5 Erledigte Einheit als Lastquelle. */
export type SessionLoad = {
  readonly day: Ymd;
  readonly sessionId: string;
  /** Einheiten-Art des Plan-Kerns (E, LR, T, I …) oder Querschnitt (BIKE, STRENGTH, SWIM, RACE). */
  readonly kind: string;
  readonly rpe?: number;
  readonly durationMin?: number;
  readonly km?: number;
  readonly plannedPaceMinPerKm?: number;
};

/** §7.2 Termin aus `weekly_schedule_blocks`; Zeiten als `HH:MM`, Ganztagstermine ohne Zeiten. */
export type CalendarBlock = {
  readonly day: Ymd;
  readonly title: string;
  readonly start?: string;
  readonly end?: string;
  /** Endet am Folgetag (über Mitternacht). */
  readonly endsNextDay?: boolean;
};

/** §7.3 Etikett je Titel-Cluster (`event_load_labels`). */
export type EventLabel = {
  readonly clusterKey: string;
  readonly kind: EventKind;
  readonly effort?: EventEffort;
  /** Nur `user` wirkt; `suggested` ist eine vorausgewählte Antwort in der Rückfrage. */
  readonly source: "user" | "suggested";
};

/** §3 Alle Eingaben eines Tages. Der Plan kommt als `TrainingPlanV2` dazu, sobald die Logik steht (Schritt 9/10). */
export type ReadinessInputs = {
  readonly todayYmd: Ymd;
  readonly checkIns: readonly CheckIn[];
  readonly markers: readonly DayMarkers[];
  readonly sessions: readonly SessionLoad[];
  readonly calendar: readonly CalendarBlock[];
  readonly labels: readonly EventLabel[];
  /** Ergebnis von gestern für Zustand und Hysterese; fehlt am ersten Tag. */
  readonly previous?: Pick<ReadinessResult, "day" | "r" | "p" | "level">;
};

/** §10.7 Gründe, die die Karte nennt (Codes; Texte liegen in der UI). */
export type ReasonCode =
  | "sleep_short"
  | "sleep_quality_low"
  | "heart_rate_up"
  | "hrv_down"
  | "energy_low"
  | "legs_heavy"
  | "mind_stressed"
  | "load_high"
  | "life_pressure"
  | "late_shift"
  | "exam_today"
  | "exam_tomorrow"
  | "no_training_window"
  | "sessions_harder_than_usual"
  | "getting_to_know_you"
  | "no_watch";

/** §16 Invarianten-Codes (R1…R26), für Tests und Logs. */
export type RuleCode = `R${number}`;

/** §4.6 Beitrag eines Blocks oder der Erwartung zu R; Σ Beiträge = R. */
export type Contribution = {
  readonly source: BlockId | "expectation";
  readonly value: number;
  readonly reasons: readonly ReasonCode[];
};

/** §9 Sicherheitsflags; ist eines aktiv, gilt nur §9. */
export type SafetyFlag =
  | "illness_mild"
  | "illness_systemic"
  | "illness_red_flag"
  | "pain_strong"
  | "pain_mild"
  | "signals_abnormal"
  | "persistent_below"
  | "see_doctor";

/** §8 Vorschlag für eine Einheit oder die Woche; wird erst nach Bestätigung im UI angewendet. */
export type Proposal = {
  readonly action: ActionCode;
  readonly scope: "today" | "week";
  readonly sessionId?: string;
  /** Bei H2: Zieltag. */
  readonly toDay?: Ymd;
  /** Bei H1: Faktor auf Umfang bzw. Dauer. */
  readonly factor?: number;
  readonly reasons: readonly ReasonCode[];
};

/** §4.7 Ergebnis eines Tages. */
export type ReadinessResult = {
  readonly day: Ymd;
  readonly r: number;
  readonly p: number;
  /** `undefined` bei Datenbasis „keine“ und in Tag-vor-Rennen/Renntag (§8.7). */
  readonly level?: Level;
  /** „eher …“-Formulierung, wenn R nah an einer Grenze liegt. */
  readonly nearBoundary: boolean;
  readonly dataBasis: DataBasis;
  /** 0–100, nur für Verlauf und Export, nie auf der Hauptkarte. */
  readonly index: number;
  readonly contributions: readonly Contribution[];
  readonly flags: readonly SafetyFlag[];
  readonly proposals: readonly Proposal[];
  readonly gettingToKnow: boolean;
  readonly configVersion: string;
};
