import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { PersistedMarathonPreferences } from "../app/runtime/runtimePersistenceTypes";
import DateInputMasked, {
  isCompleteMaskedDate,
  validateMaskedDateInput,
} from "./DateInputMasked";
import TimePicker, {
  formatTimePickerValue,
  getDefaultTimePickerForDistance,
  type TimePickerValue,
} from "./TimePicker";
import { getAppNow, getAppTodayYmd } from "../core/time/timeSystem";
import {
  PlanGenerationLoadingScreen,
  PLAN_GENERATION_SUCCESS_ANIMATION_MS,
} from "./PlanGenerationLoadingScreen";
import { fetchFullPlanFromClaude, type PlanGenerationProfile } from "../lib/ai/claudePlanService";
import { validateTrainingPlanV2Integrity } from "../ai/validation/validateTrainingPlanV2Integrity";
import { buildLocalCorePlan } from "../onboarding/localCorePlan";
import type { PlanPatch } from "../lib/ai/types";
import {
  DISTANCE_SHORTCUTS,
  buildOnboardingPreferencesPatch,
  formatGoalSummary,
  parseOnboardingRaceDate,
  resolveDistanceSelection,
  resolvePlanStartDate,
  startOfLocalDay,
  type DistanceShortcutId,
  type OnboardingSubmitPayload,
  type PlanStartChoice,
  type RaceGoal,
} from "../onboarding/marathonPreferencesOnboarding";
import type { TrainingPlanV2 } from "../planV2/types";
import { WEEKDAYS, type RunDays, type Weekday } from "../planCore";
import {
  LONGEST_RUN_KM_MAX,
  RECENT_RACE_DISTANCES,
  RUN_DAY_OPTIONS,
  WEEKLY_KM_MAX,
  defaultLongRunDay,
  defaultRecentRaceSeconds,
  formatRaceSeconds,
  longestRunError,
  parseKmInput,
  raceDateTooEarlyMessage,
  sortWeekdays,
  standardLongestRunKm,
  toProfilePlanInputs,
  trainingWeekError,
  weeklyKmError,
  weeklyKmRangeFromKm,
  ymdFromLocalDate,
  type OnboardingPlanInputs,
  type OnboardingRecentRace,
} from "../onboarding/onboardingPlanInputs";
import { calendarIsAvailable, calendarRequestReadAuthorization } from "../calendar/calendarImportService";
import {
  isCalendarImportConnected,
  markCalendarImportConnected,
  runCalendarWindowSync,
} from "../calendar/calendarSyncService";
import { SCHEDULE_PRESETS, presetToScheduleBlocks, type SchedulePresetId } from "../calendar/presets";
import { insertPresetBlocks } from "../lib/supabase/services/weeklyScheduleBlocksService";
import { pluralDe } from "../utils/pluralDe";

// ---------------------------------------------------------------------------

const MAX_PREFERENCE_FIELDS = 10;
const PREFERENCE_HINTS = [
  "z.B. Rennrad ins Training integrieren",
  "z.B. Long Run immer sonntags",
  "z.B. Krafttraining einbauen",
  "z.B. Kein Training am Dienstag",
] as const;

type OnboardingStep = 1 | 2 | 3 | 4 | 5 | 6 | 7;

/** Reihenfolge der Wizard-Schritte (Umbauplan Schritt 9: Trainingswoche und Form kommen nach dem Rennen). */
const STEP = {
  distance: 1,
  race: 2,
  trainingWeek: 3,
  form: 4,
  preferences: 5,
  calendar: 6,
  summary: 7,
} as const;
const TOTAL_STEPS = STEP.summary;

type RecentRaceMode = "none" | "race" | "estimate";

const WEEKDAY_LONG_DE: Record<Weekday, string> = {
  Mo: "Montag",
  Di: "Dienstag",
  Mi: "Mittwoch",
  Do: "Donnerstag",
  Fr: "Freitag",
  Sa: "Samstag",
  So: "Sonntag",
};

/** Untergrenze für das Datum des letzten Wettkampfs; ältere Rennen sind für die Form ohne Aussage. */
const RECENT_RACE_MIN_DATE = new Date(2000, 0, 1);

function secondsToPicker(totalSeconds: number): TimePickerValue {
  const hours = Math.min(6, Math.floor(totalSeconds / 3600));
  return { hours, minutes: Math.floor((totalSeconds % 3600) / 60), seconds: totalSeconds % 60 };
}

function pickerToSeconds(value: TimePickerValue): number {
  return value.hours * 3600 + value.minutes * 60 + value.seconds;
}

/** `2026-10-12` → „12.10.2026“ (Format des Datumsfelds). */
function germanDateFromYmd(ymd: string): string {
  const [year, month, day] = ymd.split("-");
  return `${day}.${month}.${year}`;
}

const formatKmDe = (km: number): string => String(km).replace(".", ",");

function recentRaceLabel(km: number): string {
  return RECENT_RACE_DISTANCES.filter((d) => d.km === km)[0]?.label ?? `${formatKmDe(km)} km`;
}

const inputStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "12px 14px",
  fontSize: 15,
  borderRadius: 12,
  border: "1px solid var(--border-input)",
  background: "var(--bg-primary)",
  color: "var(--text-primary)",
  outline: "none",
};

const labelStyle: CSSProperties = {
  display: "block",
  fontSize: 12,
  fontWeight: 600,
  color: "#cbd5e1",
  marginBottom: 6,
};

const sectionTitleStyle: CSSProperties = {
  margin: "0 0 4px",
  fontSize: 20,
  fontWeight: 800,
  letterSpacing: "-0.02em",
  color: "var(--text-primary)",
};

const fieldErrorStyle: CSSProperties = {
  margin: "6px 0 0",
  fontSize: 12,
  color: "#f87171",
  lineHeight: 1.4,
};

const fieldHintStyle: CSSProperties = {
  margin: "6px 0 0",
  fontSize: 12,
  color: "var(--text-muted)",
  lineHeight: 1.4,
};

const prefillNoticeStyle: CSSProperties = {
  margin: "0 0 16px",
  padding: "8px 12px",
  fontSize: 12,
  lineHeight: 1.4,
  borderRadius: 10,
  border: "1px solid rgba(59, 130, 246, 0.35)",
  background: "rgba(59, 130, 246, 0.08)",
  color: "var(--text-secondary)",
};

const summaryTermStyle: CSSProperties = {
  margin: 0,
  fontSize: 11,
  fontWeight: 700,
  color: "#7c8aa5",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
};

function SummaryRow({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div>
      <dt style={summaryTermStyle}>{term}</dt>
      <dd style={{ margin: "4px 0 0", color: "var(--text-primary)" }}>{children}</dd>
    </div>
  );
}

const sectionSubtitleStyle: CSSProperties = {
  margin: "0 0 20px",
  fontSize: 13,
  color: "var(--text-secondary)",
  lineHeight: 1.45,
};

function chipButtonStyle(active: boolean): CSSProperties {
  return {
    flex: "1 1 auto",
    minWidth: 0,
    padding: "10px 12px",
    fontSize: 13,
    fontWeight: 600,
    borderRadius: 12,
    border: `1px solid ${active ? "#3b82f6" : "var(--border-input)"}`,
    background: active ? "rgba(59, 130, 246, 0.18)" : "var(--bg-primary)",
    color: active ? "var(--text-primary)" : "var(--text-secondary)",
    cursor: "pointer",
    textAlign: "center",
  };
}

function collectUserPreferences(inputs: string[]): string[] {
  return inputs.map((p) => p.trim()).filter(Boolean);
}

const PLAN_MAX_DURATION_DAYS = 52 * 7;

/**
 * Meldung für Server-Antworten, bei denen ein lokaler Ersatzplan täuschen würde (Anmeldung, Tageslimit,
 * abgelehnte Eingabe). `null` = kein solcher Fall (Erfolg, Netzwerkfehler, 5xx).
 */
export function planApiBlockingMessage(
  result: { status?: number; retryAfterSeconds?: number },
  planDurationDays: number,
): string | null {
  if (result.status === 401) return "Bitte neu anmelden.";
  if (result.status === 429) {
    const seconds = result.retryAfterSeconds;
    if (!seconds || seconds <= 0) {
      return "Tageslimit für die Plan-Erzeugung erreicht. Versuch es später wieder.";
    }
    const minutes = Math.max(1, Math.ceil(seconds / 60));
    const wait = minutes >= 120 ? `${Math.ceil(minutes / 60)} Stunden` : pluralDe(minutes, "Minute", "Minuten");
    return `Tageslimit für die Plan-Erzeugung erreicht. Versuch es in etwa ${wait} wieder.`;
  }
  if (result.status === 400) {
    return planDurationDays > PLAN_MAX_DURATION_DAYS
      ? "Das Renndatum liegt zu weit in der Zukunft (max. 52 Wochen)."
      : "Deine Angaben wurden vom Server abgelehnt. Bitte prüfe sie und versuche es erneut.";
  }
  return null;
}

export type OnboardingProps = {
  onComplete: (
    prefs: PersistedMarathonPreferences,
    plan: TrainingPlanV2 | null,
    patches: PlanPatch[],
    planName?: string,
  ) => void | Promise<void>;
  /** Supabase-User-ID für Kalender-Import/Preset-Writes in Schritt 4 (Nutzer ist beim Onboarding bereits authentifiziert). */
  userId?: string | null;
  /**
   * Wizard ohne Ergebnis verlassen (neuer Plan / neue Vorbereitung). Ohne Handler kein Button —
   * das Erst-Onboarding ist nicht abbrechbar.
   */
  onCancel?: () => void;
  /**
   * Plan-Eingaben des letzten Plans (`preferences.planInputs`): Bestandsnutzer bekommen Lauftage, Tage, Wochen-km,
   * längsten Lauf und Rennergebnis vorausgefüllt (Entscheidung 2026-11-06). Ohne gespeicherte Werte leer.
   */
  initialPlanInputs?: Partial<OnboardingPlanInputs> | null;
};

const PLAN_GENERATION_FAILED_MESSAGE = "Plan konnte nicht erstellt werden. Bitte versuche es erneut.";

/** Der Plan-Kern lehnt die Angaben ab (Server `plan-core-invariant` oder lokal): Wiederholen ändert nichts. */
export const PLAN_INPUTS_REJECTED_TITLE = "Plan so nicht möglich";
export const PLAN_INPUTS_REJECTED_MESSAGE =
  "Mit diesen Angaben können wir keinen sicheren Plan erstellen. Prüfe Renndatum, Lauftage und Wochen-km und versuche es noch einmal.";

export function Onboarding({ onComplete, userId = null, onCancel, initialPlanInputs = null }: OnboardingProps) {
  const { t } = useTranslation();
  const [step, setStep] = useState<OnboardingStep>(1);
  const [shortcutId, setShortcutId] = useState<DistanceShortcutId | null>(null);
  const [raceGoal, setRaceGoal] = useState<RaceGoal>("finish");
  const [timePickerValue, setTimePickerValue] = useState<TimePickerValue>({
    hours: 3,
    minutes: 30,
    seconds: 0,
  });
  // Schritt 3 (Trainingswoche) und 4 (Form), vorausgefüllt aus dem letzten Plan.
  const [runDaysPerWeek, setRunDaysPerWeek] = useState<RunDays | null>(initialPlanInputs?.runDaysPerWeek ?? null);
  const [availableDays, setAvailableDays] = useState<Weekday[]>(() =>
    initialPlanInputs?.availableDays?.length ? sortWeekdays(initialPlanInputs.availableDays) : [...WEEKDAYS],
  );
  const [longRunDay, setLongRunDay] = useState<Weekday | null>(() => {
    const days = initialPlanInputs?.availableDays?.length ? sortWeekdays(initialPlanInputs.availableDays) : [...WEEKDAYS];
    const stored = initialPlanInputs?.longRunDay;
    return stored && days.indexOf(stored) >= 0 ? stored : defaultLongRunDay(days);
  });
  const [weeklyKmText, setWeeklyKmText] = useState(
    initialPlanInputs?.currentWeeklyKm != null ? formatKmDe(initialPlanInputs.currentWeeklyKm) : "",
  );
  const [longestRunText, setLongestRunText] = useState(
    initialPlanInputs?.longestRecentRunKm != null ? formatKmDe(initialPlanInputs.longestRecentRunKm) : "",
  );
  const initialRace = initialPlanInputs?.recentRace ?? null;
  const [recentRaceMode, setRecentRaceMode] = useState<RecentRaceMode>(
    initialRace ? (initialRace.estimated ? "estimate" : "race") : "none",
  );
  const [recentRaceKm, setRecentRaceKm] = useState<number>(initialRace?.distanceKm ?? 10);
  const [recentRaceTime, setRecentRaceTime] = useState<TimePickerValue>(() =>
    secondsToPicker(initialRace?.timeSeconds ?? defaultRecentRaceSeconds(initialRace?.distanceKm ?? 10)),
  );
  const [recentRaceDate, setRecentRaceDate] = useState(initialRace?.dateYmd ? germanDateFromYmd(initialRace.dateYmd) : "");
  const hasPrefill = initialPlanInputs != null && Object.keys(initialPlanInputs).length > 0;
  const [raceDate, setRaceDate] = useState("");
  const [raceName, setRaceName] = useState("");
  const [planStartChoice, setPlanStartChoice] = useState<PlanStartChoice>("today");
  const [planStartCustomDate, setPlanStartCustomDate] = useState("");
  const [preferenceInputs, setPreferenceInputs] = useState<string[]>(["", ""]);
  const [skippedPreferences, setSkippedPreferences] = useState(false);
  const [planGenPhase, setPlanGenPhase] = useState<"idle" | "loading" | "success" | "error">(
    "idle",
  );
  const [planGenWeekCount, setPlanGenWeekCount] = useState(12);
  const [generateError, setGenerateError] = useState<string | null>(null);
  /** `inputs`: Angaben ändern statt erneut versuchen (der Kern lehnt die Eingaben ab). */
  const [generateErrorKind, setGenerateErrorKind] = useState<"retry" | "inputs">("retry");
  const isGenerating = planGenPhase === "loading" || planGenPhase === "success";

  const distance = useMemo(() => resolveDistanceSelection(shortcutId), [shortcutId]);

  useEffect(() => {
    if (!distance || raceGoal !== "time") return;
    setTimePickerValue(getDefaultTimePickerForDistance(distance.km, distance.label));
  }, [distance, raceGoal]);

  const planStartResolved = useMemo(
    () => resolvePlanStartDate(planStartChoice, planStartCustomDate, getAppNow()),
    [planStartChoice, planStartCustomDate],
  );

  const userPreferences = useMemo(() => {
    if (skippedPreferences) return [];
    return collectUserPreferences(preferenceInputs);
  }, [preferenceInputs, skippedPreferences]);

  const planStartDateError = useMemo(() => {
    if (planStartChoice !== "custom") return "";
    return (
      validateMaskedDateInput(planStartCustomDate, {
        minDate: startOfLocalDay(getAppNow()),
      }) ?? ""
    );
  }, [planStartChoice, planStartCustomDate]);

  // Pflichtfeld: ohne Renndatum gibt es keine Plan-Erzeugung (handleFinish braucht Start und Ziel).
  const raceDateError = useMemo(() => {
    if (!raceDate.trim()) return "Bitte Renndatum eingeben.";
    const start = planStartResolved.date ?? startOfLocalDay(getAppNow());
    const err = validateMaskedDateInput(raceDate, {
      minDate: start,
      strictAfterMin: true,
    });
    if (err === "Datum muss nach dem früheren Datum liegen.") {
      return "Renndatum muss nach dem Trainingsstart liegen.";
    }
    if (err) return err;
    // Harte Mindest-Planlänge des Plan-Kerns (§4): Meldung nennt das früheste mögliche Renndatum.
    const raceDay = parseOnboardingRaceDate(raceDate);
    if (distance && raceDay) {
      return raceDateTooEarlyMessage(distance.coreDistance, start, raceDay) ?? "";
    }
    return "";
  }, [raceDate, planStartResolved.date, distance]);

  const trainingWeekProblem = trainingWeekError(runDaysPerWeek, availableDays, longRunDay);
  const weeklyKmProblem = weeklyKmError(weeklyKmText);
  const longestRunProblem = longestRunError(longestRunText);
  const weeklyKm = weeklyKmProblem ? null : parseKmInput(weeklyKmText);
  const longestRunKm = longestRunProblem ? null : parseKmInput(longestRunText);

  const recentRaceTimeError = useMemo(() => {
    if (recentRaceMode === "none") return null;
    return pickerToSeconds(recentRaceTime) > 0 ? null : "Bitte deine Zeit wählen.";
  }, [recentRaceMode, recentRaceTime]);

  const recentRaceDateError = useMemo(() => {
    if (recentRaceMode !== "race") return null;
    if (!recentRaceDate.trim()) return "Bitte das Datum des Wettkampfs eingeben.";
    if (!isCompleteMaskedDate(recentRaceDate)) return "Bitte vollständiges Datum eingeben (TT.MM.JJJJ).";
    const parsed = parseOnboardingRaceDate(recentRaceDate);
    if (!parsed) return "Ungültiges Datum.";
    if (parsed.getTime() > startOfLocalDay(getAppNow()).getTime()) {
      return "Der Wettkampf muss heute oder in der Vergangenheit liegen.";
    }
    if (parsed.getTime() < RECENT_RACE_MIN_DATE.getTime()) return "Ungültiges Datum.";
    return null;
  }, [recentRaceMode, recentRaceDate]);

  const recentRace = useMemo((): OnboardingRecentRace | null => {
    if (recentRaceMode === "none" || recentRaceTimeError || recentRaceDateError) return null;
    const raceDay = recentRaceMode === "race" ? parseOnboardingRaceDate(recentRaceDate) : null;
    return {
      distanceKm: recentRaceKm,
      timeSeconds: pickerToSeconds(recentRaceTime),
      dateYmd: raceDay ? ymdFromLocalDate(raceDay) : null,
      estimated: recentRaceMode === "estimate",
    };
  }, [recentRaceMode, recentRaceTimeError, recentRaceDateError, recentRaceDate, recentRaceKm, recentRaceTime]);

  const planInputs = useMemo((): OnboardingPlanInputs | null => {
    if (trainingWeekProblem || runDaysPerWeek === null || longRunDay === null) return null;
    if (weeklyKm === null || longestRunProblem || recentRaceTimeError || recentRaceDateError) return null;
    return {
      runDaysPerWeek,
      availableDays: sortWeekdays(availableDays),
      longRunDay,
      currentWeeklyKm: weeklyKm,
      longestRecentRunKm: longestRunKm,
      recentRace,
    };
  }, [
    trainingWeekProblem,
    runDaysPerWeek,
    longRunDay,
    weeklyKm,
    longestRunProblem,
    recentRaceTimeError,
    recentRaceDateError,
    availableDays,
    longestRunKm,
    recentRace,
  ]);

  const step1Valid = distance != null;
  const step2Valid =
    (planStartChoice !== "custom" ||
      (planStartResolved.date != null && !planStartDateError)) &&
    !raceDateError &&
    isCompleteMaskedDate(raceDate);
  const step3Valid = trainingWeekProblem === null;
  const step4Valid = planInputs !== null;
  const stepValid = (n: OnboardingStep): boolean =>
    n === STEP.distance
      ? step1Valid
      : n === STEP.race
        ? step2Valid
        : n === STEP.trainingWeek
          ? step3Valid
          : n === STEP.form
            ? step4Valid
            : true;

  const summaryPayload = useMemo((): OnboardingSubmitPayload | null => {
    if (!distance || !planInputs) return null;
    const normalizedTime =
      raceGoal === "time" ? formatTimePickerValue(timePickerValue) : null;
    return {
      raceDistanceLabel: distance.label,
      raceDistanceKm: distance.km,
      raceGoal,
      raceTargetTime: normalizedTime,
      raceName: raceName.trim() || null,
      raceDate: raceDate.trim() || null,
      planStartDate: planStartResolved.planStartDate,
      weeklyKmRange: weeklyKmRangeFromKm(planInputs.currentWeeklyKm),
      userPreferences,
      planInputs,
    };
  }, [
    distance,
    planInputs,
    raceGoal,
    timePickerValue,
    raceName,
    raceDate,
    planStartResolved.planStartDate,
    userPreferences,
  ]);

  const preferencesSummaryLabel = useMemo(() => {
    if (userPreferences.length === 0) return "Keine Präferenzen angegeben";
    return userPreferences.join(", ");
  }, [userPreferences]);

  const handleShortcutSelect = useCallback((id: DistanceShortcutId) => {
    setShortcutId(id);
  }, []);

  const toggleAvailableDay = useCallback(
    (day: Weekday) => {
      const next =
        availableDays.indexOf(day) >= 0
          ? availableDays.filter((d) => d !== day)
          : sortWeekdays([...availableDays, day]);
      setAvailableDays(next);
      // Fällt der Long-Run-Tag weg, gilt die Vorgabe des Kerns: So, sonst Sa, sonst der letzte verfügbare Tag.
      if (longRunDay === null || next.indexOf(longRunDay) < 0) setLongRunDay(defaultLongRunDay(next));
    },
    [availableDays, longRunDay],
  );

  const handleRecentRaceMode = useCallback(
    (mode: RecentRaceMode) => {
      setRecentRaceMode(mode);
      // Schätzung nur für 5 km und 10 km (§2 Frage 4).
      if (mode === "estimate" && !RECENT_RACE_DISTANCES.some((d) => d.km === recentRaceKm && d.estimateAllowed)) {
        setRecentRaceKm(10);
        setRecentRaceTime(secondsToPicker(defaultRecentRaceSeconds(10)));
      }
    },
    [recentRaceKm],
  );

  const handleRecentRaceKm = useCallback((km: number) => {
    setRecentRaceKm(km);
    setRecentRaceTime(secondsToPicker(defaultRecentRaceSeconds(km)));
  }, []);

  const handlePreferenceChange = useCallback((index: number, value: string) => {
    setSkippedPreferences(false);
    setPreferenceInputs((prev) => prev.map((p, i) => (i === index ? value : p)));
  }, []);

  const handleAddPreferenceField = useCallback(() => {
    setPreferenceInputs((prev) =>
      prev.length < MAX_PREFERENCE_FIELDS ? [...prev, ""] : prev,
    );
  }, []);

  const handleRemovePreferenceField = useCallback((index: number) => {
    setPreferenceInputs((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((_, i) => i !== index);
    });
  }, []);

  const handleSkipPreferences = useCallback(() => {
    setSkippedPreferences(true);
    setPreferenceInputs(["", ""]);
    setStep(STEP.calendar);
  }, []);

  const goBack = useCallback(() => {
    setStep((s) => (s > 1 ? ((s - 1) as OnboardingStep) : s));
  }, []);

  const goNext = useCallback(() => {
    setStep((s) => (s < TOTAL_STEPS ? ((s + 1) as OnboardingStep) : s));
  }, []);

  // --- Schritt 4: Kalender verbinden (skippbar; Preset-Fallback für Deny/leer/Web) ---
  const [calendarStepMode, setCalendarStepMode] = useState<"connect" | "connected" | "fallback">(() => {
    if (isCalendarImportConnected()) return "connected";
    return calendarIsAvailable() ? "connect" : "fallback";
  });
  const [calendarBusy, setCalendarBusy] = useState(false);
  const [calendarFeedback, setCalendarFeedback] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [selectedPresetId, setSelectedPresetId] = useState<SchedulePresetId | null>(null);

  const handleConnectCalendar = useCallback(async () => {
    if (calendarBusy) return;
    setCalendarBusy(true);
    setCalendarFeedback(null);
    try {
      const granted = await calendarRequestReadAuthorization();
      if (!granted) {
        setCalendarStepMode("fallback");
        setCalendarFeedback({
          tone: "err",
          text: "Kein Kalenderzugriff — wähle stattdessen einen typischen Wochenrhythmus.",
        });
        return;
      }
      if (!userId) {
        setCalendarStepMode("fallback");
        setCalendarFeedback({
          tone: "err",
          text: "Import gerade nicht möglich — wähle einen typischen Wochenrhythmus.",
        });
        return;
      }
      const result = await runCalendarWindowSync(userId);
      if (!result.ok) {
        setCalendarStepMode("fallback");
        setCalendarFeedback({
          tone: "err",
          text: "Kalender-Import fehlgeschlagen — wähle einen typischen Wochenrhythmus.",
        });
        return;
      }
      markCalendarImportConnected();
      if (result.importedCount === 0) {
        setCalendarStepMode("fallback");
        setCalendarFeedback({
          tone: "ok",
          text: "Kalender verbunden — in den nächsten 4 Wochen sind keine Termine eingetragen. Optional kannst du einen typischen Rhythmus wählen.",
        });
        return;
      }
      setCalendarStepMode("connected");
      setCalendarFeedback({ tone: "ok", text: `✓ ${result.importedCount} Termine importiert` });
    } finally {
      setCalendarBusy(false);
    }
  }, [calendarBusy, userId]);

  const handleSelectPreset = useCallback(
    async (presetId: SchedulePresetId) => {
      if (calendarBusy) return;
      setSelectedPresetId(presetId);
      setCalendarFeedback(null);
      if (!userId) return;
      setCalendarBusy(true);
      try {
        const result = await insertPresetBlocks(userId, presetToScheduleBlocks(presetId));
        if (result.ok) {
          setCalendarFeedback({ tone: "ok", text: "✓ Wochenrhythmus gespeichert" });
        } else {
          setSelectedPresetId(null);
          setCalendarFeedback({ tone: "err", text: "Speichern fehlgeschlagen — bitte erneut versuchen." });
        }
      } finally {
        setCalendarBusy(false);
      }
    },
    [calendarBusy, userId],
  );

  const handleFinish = useCallback(async () => {
    if (!summaryPayload || isGenerating) return;

    setGenerateError(null);
    setGenerateErrorKind("retry");
    setPlanGenPhase("loading");
    const rejectInputs = () => {
      setGenerateError(PLAN_INPUTS_REJECTED_MESSAGE);
      setGenerateErrorKind("inputs");
      setPlanGenPhase("error");
    };

    try {
      // eslint-disable-next-line no-console
      console.log("[Onboarding] handleFinish start, raceDate:", summaryPayload.raceDate);

      const prefs = buildOnboardingPreferencesPatch(summaryPayload);
      // eslint-disable-next-line no-console
      console.log("[Onboarding] userPreferences:", userPreferences);

      let plan: TrainingPlanV2 | null = null;
      let patches: PlanPatch[] = [];
      const raceDateInput = summaryPayload.raceDate?.trim();
      if (raceDateInput) {
        const raceDay = parseOnboardingRaceDate(raceDateInput);
        const startDay = summaryPayload.planStartDate
          ? parseOnboardingRaceDate(summaryPayload.planStartDate)
          : getAppNow();
        if (raceDay && startDay) {
          const planDurationDays = Math.round(
            (raceDay.getTime() - startDay.getTime()) / 86400000,
          );
          setPlanGenWeekCount(Math.max(1, Math.round(planDurationDays / 7)));

          const profile: PlanGenerationProfile = {
            raceDistanceKm: summaryPayload.raceDistanceKm,
            raceDistanceLabel: summaryPayload.raceDistanceLabel,
            raceGoal: summaryPayload.raceGoal,
            raceTargetTime: summaryPayload.raceTargetTime ?? null,
            weeklyKmRange: summaryPayload.weeklyKmRange,
            raceDate: summaryPayload.raceDate!,
            planStartDate: summaryPayload.planStartDate ?? "",
            planDurationDays,
            userPreferences: userPreferences.filter(Boolean),
            ...(distance ? toProfilePlanInputs(summaryPayload.planInputs, distance.coreDistance) : {}),
          };

          // Vor jedem Abbruch unten ist noch nichts verändert: Preferences, Patches und Logs fasst erst onComplete an.
          const fullResult = await fetchFullPlanFromClaude(profile);
          const fullPlan =
            fullResult.plan && validateTrainingPlanV2Integrity(fullResult.plan) ? fullResult.plan : null;

          if (fullPlan) {
            plan = fullPlan;
          } else {
            // eslint-disable-next-line no-console
            console.error("[Onboarding] Server-Plan nicht verfügbar:", fullResult.error, fullResult.status);
            // Anmeldung, Tageslimit, abgelehnte Eingabe: ein lokaler Plan würde das nur verdecken.
            const blockingMessage = planApiBlockingMessage(fullResult, planDurationDays);
            if (blockingMessage) {
              setGenerateError(blockingMessage);
              setPlanGenPhase("error");
              return;
            }
            // Der Kern hat auf dem Server einen Verstoß gemeldet: lokal käme derselbe heraus.
            if (fullResult.errorCode === "plan-core-invariant") {
              rejectInputs();
              return;
            }
            // Netzwerkfehler, Timeout, 5xx: derselbe Kern lokal, ohne Nachfrage (Entscheidung 2026-11-07).
            const local = buildLocalCorePlan({ ...profile }, getAppTodayYmd());
            if (local.status === "rejected") {
              rejectInputs();
              return;
            }
            if (local.status === "unavailable") {
              // eslint-disable-next-line no-console
              console.error("[Onboarding] lokaler Plan nicht möglich:", local.reason);
              setGenerateError(PLAN_GENERATION_FAILED_MESSAGE);
              setPlanGenPhase("error");
              return;
            }
            // eslint-disable-next-line no-console
            console.warn("[Onboarding] lokaler Kern-Plan statt Server-Plan, warnings:", local.warnings);
            plan = local.plan;
          }
          patches = [];
        }
      }

      // Ohne Plan nie abschließen: onComplete würde Preferences ersetzen und Patches löschen.
      if (!plan) {
        // eslint-disable-next-line no-console
        console.error("[Onboarding] kein Plan erzeugt — Wizard bleibt offen");
        setGenerateError(PLAN_GENERATION_FAILED_MESSAGE);
        setPlanGenPhase("error");
        return;
      }

      const planName = [
        summaryPayload.raceDistanceLabel ?? "Marathon",
        summaryPayload.raceName,
        summaryPayload.raceDate,
      ]
        .filter(Boolean)
        .join(" – ");

      // Real response arrived — play the ring's 92%→100% + checkmark animation
      // before handing off, so the transition never feels abrupt.
      setPlanGenPhase("success");
      await new Promise<void>((resolve) => setTimeout(resolve, PLAN_GENERATION_SUCCESS_ANIMATION_MS));

      await onComplete(prefs, plan, patches, planName || undefined);
      // eslint-disable-next-line no-console
      console.log("[Onboarding] onComplete done");
      setPlanGenPhase("idle");
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[Onboarding] ERROR in handleFinish:", err);
      setGenerateError(PLAN_GENERATION_FAILED_MESSAGE);
      setPlanGenPhase("error");
    }
  }, [summaryPayload, isGenerating, onComplete, userPreferences, distance]);

  const finishButtonLabel = isGenerating
    ? t("onboarding.generating")
    : generateError !== null
      ? "Erneut versuchen"
      : t("onboarding.finish");

  if (planGenPhase !== "idle") {
    return (
      <PlanGenerationLoadingScreen
        weekCount={planGenWeekCount}
        phase={planGenPhase}
        errorMessage={generateError}
        errorTitle={generateErrorKind === "inputs" ? PLAN_INPUTS_REJECTED_TITLE : null}
        onRetry={generateErrorKind === "inputs" ? undefined : () => void handleFinish()}
        onEditInputs={
          generateErrorKind === "inputs"
            ? () => {
                setGenerateError(null);
                setGenerateErrorKind("retry");
                setPlanGenPhase("idle");
                setStep(STEP.race);
              }
            : undefined
        }
        onCancel={onCancel}
      />
    );
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxSizing: "border-box",
        padding: "24px 16px calc(24px + env(safe-area-inset-bottom, 0px))",
        background: "var(--bg-primary)",
        color: "var(--text-primary)",
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif",
        WebkitFontSmoothing: "antialiased",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 420,
          maxHeight: "min(92dvh, 720px)",
          overflowY: "auto",
          borderRadius: 16,
          border: "1px solid var(--border-input)",
          background: "var(--bg-card)",
          boxShadow: "0 24px 48px var(--shadow)",
          padding: "28px 24px 24px",
          boxSizing: "border-box",
        }}
      >
        <div
          style={{
            display: "flex",
            gap: 6,
            marginBottom: 22,
          }}
          aria-label={`Schritt ${step} von ${TOTAL_STEPS}`}
        >
          {([1, 2, 3, 4, 5, 6, 7] as const).map((n) => (
            <div
              key={n}
              style={{
                flex: 1,
                height: 4,
                borderRadius: 2,
                background: n <= step ? "#3b82f6" : "rgba(148, 163, 184, 0.2)",
              }}
            />
          ))}
        </div>

        {step === STEP.distance ? (
          <>
            <h2 style={sectionTitleStyle}>{t("onboarding.step1_title")}</h2>
            <p style={sectionSubtitleStyle}>{t("onboarding.step1_subtitle")}</p>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
              {DISTANCE_SHORTCUTS.map((sc) => (
                <button
                  key={sc.id}
                  type="button"
                  onClick={() => handleShortcutSelect(sc.id)}
                  aria-pressed={shortcutId === sc.id}
                  style={{
                    ...chipButtonStyle(shortcutId === sc.id),
                    flex: "1 1 45%",
                  }}
                >
                  {sc.id === "half" || sc.id === "marathon" ? sc.displayLabel : sc.label}
                </button>
              ))}
            </div>

            {distance ? (
              <div style={{ marginTop: 20 }}>
                <div style={{ ...labelStyle, marginBottom: 8 }}>{t("onboarding.goal_label")}</div>
                <div style={{ display: "flex", gap: 8, marginBottom: raceGoal === "time" ? 14 : 0 }}>
                  <button
                    type="button"
                    onClick={() => setRaceGoal("finish")}
                    style={chipButtonStyle(raceGoal === "finish")}
                  >
                    {t("onboarding.goal_finish")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setRaceGoal("time")}
                    style={chipButtonStyle(raceGoal === "time")}
                  >
                    {t("onboarding.goal_time")}
                  </button>
                </div>
                {raceGoal === "time" ? (
                  <>
                    <div style={{ ...labelStyle, marginBottom: 10 }}>{t("onboarding.goal_time_label")}</div>
                    <TimePicker value={timePickerValue} onChange={setTimePickerValue} />
                  </>
                ) : null}
              </div>
            ) : null}
          </>
        ) : null}

        {step === STEP.race ? (
          <>
            <h2 style={sectionTitleStyle}>{t("onboarding.step2_title")}</h2>
            <p style={sectionSubtitleStyle}>{t("onboarding.step2_subtitle")}</p>

            <DateInputMasked
              id="onboard-race-date"
              label={t("onboarding.race_date_label")}
              value={raceDate}
              onChange={setRaceDate}
              minDate={planStartResolved.date ?? startOfLocalDay(getAppNow())}
              strictAfterMin
              error={raceDateError}
              style={{ marginBottom: 0 }}
            />

            <div style={{ ...labelStyle, marginBottom: 8, marginTop: 4 }}>{t("onboarding.plan_start_label")}</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: planStartChoice === "custom" ? 12 : 20 }}>
              <button
                type="button"
                onClick={() => setPlanStartChoice("today")}
                style={chipButtonStyle(planStartChoice === "today")}
              >
                {t("onboarding.plan_start_today")}
              </button>
              <button
                type="button"
                onClick={() => setPlanStartChoice("nextMonday")}
                style={chipButtonStyle(planStartChoice === "nextMonday")}
              >
                {t("onboarding.plan_start_next_monday")}
              </button>
              <button
                type="button"
                onClick={() => setPlanStartChoice("custom")}
                style={chipButtonStyle(planStartChoice === "custom")}
              >
                {t("onboarding.plan_start_custom")}
              </button>
            </div>
            {planStartChoice === "custom" ? (
              <DateInputMasked
                id="onboard-plan-start-date"
                label={t("onboarding.plan_start_custom_label")}
                value={planStartCustomDate}
                onChange={setPlanStartCustomDate}
                minDate={startOfLocalDay(getAppNow())}
                error={planStartDateError}
                style={{ marginBottom: 0 }}
              />
            ) : null}

            <label htmlFor="onboard-race-name" style={labelStyle}>
              {t("onboarding.race_name_label")}
            </label>
            <input
              id="onboard-race-name"
              type="text"
              value={raceName}
              onChange={(e) => setRaceName(e.target.value)}
              placeholder={t("onboarding.race_name_placeholder")}
              style={inputStyle}
            />
          </>
        ) : null}

        {step === STEP.trainingWeek ? (
          <>
            <h2 style={sectionTitleStyle}>Deine Trainingswoche</h2>
            <p style={sectionSubtitleStyle}>Wie oft und an welchen Tagen du laufen kannst.</p>
            {hasPrefill ? <p style={prefillNoticeStyle}>Vorausgefüllt aus deinem letzten Plan — bitte kurz prüfen.</p> : null}

            <div style={{ ...labelStyle, marginBottom: 8 }} id="onboard-run-days-label">
              Wie viele Tage pro Woche willst du laufen?
            </div>
            <div
              role="group"
              aria-labelledby="onboard-run-days-label"
              style={{ display: "flex", gap: 8, marginBottom: 20 }}
            >
              {RUN_DAY_OPTIONS.map((n) => (
                <button
                  key={n}
                  type="button"
                  aria-pressed={runDaysPerWeek === n}
                  onClick={() => setRunDaysPerWeek(n)}
                  style={chipButtonStyle(runDaysPerWeek === n)}
                >
                  {n} Tage
                </button>
              ))}
            </div>

            <div style={{ ...labelStyle, marginBottom: 8 }} id="onboard-available-days-label">
              An welchen Tagen kannst du laufen?
            </div>
            <div
              role="group"
              aria-labelledby="onboard-available-days-label"
              style={{ display: "flex", gap: 6, marginBottom: 6 }}
            >
              {WEEKDAYS.map((day) => (
                <button
                  key={day}
                  type="button"
                  aria-pressed={availableDays.indexOf(day) >= 0}
                  aria-label={`${WEEKDAY_LONG_DE[day]} verfügbar`}
                  onClick={() => toggleAvailableDay(day)}
                  style={{ ...chipButtonStyle(availableDays.indexOf(day) >= 0), padding: "10px 0" }}
                >
                  {day}
                </button>
              ))}
            </div>
            <p style={{ ...fieldHintStyle, margin: "0 0 20px" }}>
              Wir verteilen deine Läufe auf diese Tage. Die übrigen Tage bleiben frei.
            </p>

            <div style={{ ...labelStyle, marginBottom: 8 }} id="onboard-long-run-day-label">
              Wann passt dein langer Lauf am besten?
            </div>
            <div
              role="group"
              aria-labelledby="onboard-long-run-day-label"
              style={{ display: "flex", flexWrap: "wrap", gap: 6 }}
            >
              {availableDays.map((day) => (
                <button
                  key={day}
                  type="button"
                  aria-pressed={longRunDay === day}
                  aria-label={`Long Run am ${WEEKDAY_LONG_DE[day]}`}
                  onClick={() => setLongRunDay(day)}
                  style={{ ...chipButtonStyle(longRunDay === day), flex: "0 0 auto", minWidth: 44 }}
                >
                  {day}
                </button>
              ))}
            </div>

            {trainingWeekProblem && runDaysPerWeek !== null ? (
              <p style={fieldErrorStyle} role="alert">
                {trainingWeekProblem}
              </p>
            ) : null}
          </>
        ) : null}

        {step === STEP.form && distance && runDaysPerWeek !== null ? (
          <>
            <h2 style={sectionTitleStyle}>Deine aktuelle Form</h2>
            <p style={sectionSubtitleStyle}>Damit dein Plan dort startet, wo du gerade stehst.</p>
            {hasPrefill ? <p style={prefillNoticeStyle}>Vorausgefüllt aus deinem letzten Plan — bitte kurz prüfen.</p> : null}

            <label htmlFor="onboard-weekly-km" style={labelStyle}>
              Wie viele km läufst du pro Woche?
            </label>
            <div style={{ position: "relative" }}>
              <input
                id="onboard-weekly-km"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={weeklyKmText}
                onChange={(e) => setWeeklyKmText(e.target.value)}
                placeholder="z. B. 25"
                aria-invalid={weeklyKmText.trim() && weeklyKmProblem ? true : undefined}
                style={{ ...inputStyle, paddingRight: 44 }}
              />
              <span style={{ position: "absolute", right: 14, top: 12, fontSize: 15, color: "var(--text-muted)" }}>km</span>
            </div>
            {weeklyKmText.trim() && weeklyKmProblem ? (
              <p style={fieldErrorStyle}>{weeklyKmProblem}</p>
            ) : (
              <p style={fieldHintStyle}>Durchschnitt der letzten 4 Wochen (0–{WEEKLY_KM_MAX}). 0, wenn du gerade anfängst.</p>
            )}

            <label htmlFor="onboard-longest-run" style={{ ...labelStyle, marginTop: 20 }}>
              Dein längster Lauf in den letzten 4 Wochen (optional)
            </label>
            <div style={{ position: "relative" }}>
              <input
                id="onboard-longest-run"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={longestRunText}
                onChange={(e) => setLongestRunText(e.target.value)}
                placeholder={`z. B. ${standardLongestRunKm(distance.coreDistance, runDaysPerWeek)}`}
                aria-invalid={longestRunProblem ? true : undefined}
                style={{ ...inputStyle, paddingRight: 44 }}
              />
              <span style={{ position: "absolute", right: 14, top: 12, fontSize: 15, color: "var(--text-muted)" }}>km</span>
            </div>
            {longestRunProblem ? (
              <p style={fieldErrorStyle}>{longestRunProblem}</p>
            ) : (
              <p style={fieldHintStyle}>
                {longestRunText.trim()
                  ? `Höchstens ${LONGEST_RUN_KM_MAX} km.`
                  : `Leer lassen: Wir rechnen mit ${standardLongestRunKm(distance.coreDistance, runDaysPerWeek)} km.`}
              </p>
            )}

            <div style={{ ...labelStyle, marginTop: 20, marginBottom: 8 }} id="onboard-recent-race-label">
              Dein letztes Rennergebnis
            </div>
            <div
              role="group"
              aria-labelledby="onboard-recent-race-label"
              style={{ display: "flex", gap: 8, marginBottom: recentRaceMode === "none" ? 6 : 14 }}
            >
              {(
                [
                  ["race", "Wettkampf"],
                  ["estimate", "Schätzung"],
                  ["none", "Keine Angabe"],
                ] as const
              ).map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  aria-pressed={recentRaceMode === mode}
                  onClick={() => handleRecentRaceMode(mode)}
                  style={chipButtonStyle(recentRaceMode === mode)}
                >
                  {label}
                </button>
              ))}
            </div>

            {recentRaceMode === "none" ? (
              <p style={fieldHintStyle}>
                Ohne Ergebnis startet dein Plan im Einsteiger-Modus: lockere Läufe mit Richttempo, Tempoeinheiten nach Gefühl.
              </p>
            ) : (
              <>
                <div style={{ ...labelStyle, marginBottom: 8 }}>
                  {recentRaceMode === "race" ? "Distanz" : "Für welche Distanz schätzt du deine Zeit?"}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
                  {RECENT_RACE_DISTANCES.filter((d) => recentRaceMode === "race" || d.estimateAllowed).map((d) => (
                    <button
                      key={d.km}
                      type="button"
                      aria-pressed={recentRaceKm === d.km}
                      aria-label={`Rennergebnis ${d.label}`}
                      onClick={() => handleRecentRaceKm(d.km)}
                      style={{ ...chipButtonStyle(recentRaceKm === d.km), flex: "1 1 40%" }}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
                <div style={{ ...labelStyle, marginBottom: 10 }}>
                  {recentRaceMode === "race" ? "Deine Zeit" : "Geschätzte Zeit"}
                </div>
                <TimePicker value={recentRaceTime} onChange={setRecentRaceTime} />
                {recentRaceTimeError ? <p style={fieldErrorStyle}>{recentRaceTimeError}</p> : null}
                {recentRaceMode === "race" ? (
                  <div style={{ marginTop: 14 }}>
                    <DateInputMasked
                      id="onboard-recent-race-date"
                      label="Wann war der Wettkampf?"
                      value={recentRaceDate}
                      onChange={setRecentRaceDate}
                      minDate={RECENT_RACE_MIN_DATE}
                      error={recentRaceDate.trim() ? recentRaceDateError ?? "" : ""}
                      style={{ marginBottom: 0 }}
                    />
                  </div>
                ) : (
                  <p style={fieldHintStyle}>So schnell, wie du die Distanz heute im Wettkampf laufen könntest.</p>
                )}
              </>
            )}
          </>
        ) : null}

        {step === STEP.preferences ? (
          <>
            <h2 style={sectionTitleStyle}>{t("onboarding.step3_title")}</h2>
            <p style={sectionSubtitleStyle}>
              {t("onboarding.step3_subtitle")}
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 14 }}>
              {preferenceInputs.map((value, index) => (
                <div key={index} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input
                    type="text"
                    value={value}
                    onChange={(e) => handlePreferenceChange(index, e.target.value)}
                    placeholder={t("onboarding.preference_placeholder")}
                    style={{ ...inputStyle, flex: 1 }}
                    aria-label={`Präferenz ${index + 1}`}
                  />
                  {preferenceInputs.length > 1 ? (
                    <button
                      type="button"
                      onClick={() => handleRemovePreferenceField(index)}
                      aria-label={t("onboarding.preference_remove")}
                      style={{
                        flexShrink: 0,
                        width: 36,
                        height: 36,
                        borderRadius: 10,
                        border: "1px solid rgba(148, 163, 184, 0.2)",
                        background: "#0b1220",
                        color: "var(--text-secondary)",
                        fontSize: 18,
                        lineHeight: 1,
                        cursor: "pointer",
                      }}
                    >
                      ×
                    </button>
                  ) : null}
                </div>
              ))}
            </div>

            {preferenceInputs.length < MAX_PREFERENCE_FIELDS ? (
              <button
                type="button"
                onClick={handleAddPreferenceField}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  marginBottom: 16,
                  fontSize: 13,
                  fontWeight: 600,
                  borderRadius: 12,
                  border: "1px dashed rgba(148, 163, 184, 0.35)",
                  background: "transparent",
                  color: "var(--text-secondary)",
                  cursor: "pointer",
                }}
              >
                + {t("onboarding.preference_add")}
              </button>
            ) : null}

            <ul
              style={{
                margin: 0,
                padding: 0,
                listStyle: "none",
                display: "grid",
                gap: 6,
                fontSize: 12,
                color: "var(--text-muted)",
              }}
            >
              {PREFERENCE_HINTS.map((hint) => (
                <li key={hint}>{hint}</li>
              ))}
            </ul>

            <button
              type="button"
              onClick={handleSkipPreferences}
              style={{
                marginTop: 18,
                padding: 0,
                border: "none",
                background: "none",
                color: "var(--text-muted)",
                fontSize: 13,
                textDecoration: "underline",
                cursor: "pointer",
              }}
            >
              Überspringen
            </button>
          </>
        ) : null}

        {step === STEP.calendar ? (
          <>
            <h2 style={sectionTitleStyle}>Kalender verbinden</h2>
            <p style={sectionSubtitleStyle}>
              MyRace plant dein Training um deine echten Termine herum. Verbinde deinen Kalender — oder
              wähle einen typischen Wochenrhythmus. Termine werden nur gelesen, nie verändert.
            </p>

            {calendarStepMode === "connect" ? (
              <>
                <button
                  type="button"
                  onClick={() => void handleConnectCalendar()}
                  disabled={calendarBusy}
                  style={{
                    width: "100%",
                    padding: "14px 16px",
                    fontSize: 15,
                    fontWeight: 700,
                    border: "none",
                    borderRadius: 14,
                    cursor: calendarBusy ? "not-allowed" : "pointer",
                    opacity: calendarBusy ? 0.7 : 1,
                    color: "#fff",
                    background: "linear-gradient(135deg, #10b981, #3b82f6)",
                  }}
                >
                  {calendarBusy ? "Verbinde…" : "Kalender verbinden"}
                </button>
                <button
                  type="button"
                  onClick={() => setCalendarStepMode("fallback")}
                  style={{
                    marginTop: 14,
                    padding: 0,
                    border: "none",
                    background: "none",
                    color: "var(--text-muted)",
                    fontSize: 13,
                    textDecoration: "underline",
                    cursor: "pointer",
                  }}
                >
                  Ohne Kalender fortfahren
                </button>
              </>
            ) : null}

            {calendarStepMode === "connected" ? (
              <p style={{ margin: 0, fontSize: 14, color: "#34d399", fontWeight: 600 }}>
                ✓ Kalender verbunden
              </p>
            ) : null}

            {calendarStepMode === "fallback" ? (
              <>
                <div style={{ ...labelStyle, marginBottom: 8 }}>Typischer Wochenrhythmus</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {SCHEDULE_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      disabled={calendarBusy}
                      onClick={() => void handleSelectPreset(preset.id)}
                      style={{
                        ...chipButtonStyle(selectedPresetId === preset.id),
                        flex: "1 1 45%",
                        textAlign: "left",
                      }}
                    >
                      <span style={{ display: "block" }}>{preset.label}</span>
                      <span style={{ display: "block", fontSize: 11, fontWeight: 400, marginTop: 2 }}>
                        {preset.description}
                      </span>
                    </button>
                  ))}
                </div>
                {calendarIsAvailable() ? (
                  <button
                    type="button"
                    onClick={() => setCalendarStepMode("connect")}
                    style={{
                      marginTop: 14,
                      padding: 0,
                      border: "none",
                      background: "none",
                      color: "var(--text-muted)",
                      fontSize: 13,
                      textDecoration: "underline",
                      cursor: "pointer",
                    }}
                  >
                    Doch Kalender verbinden
                  </button>
                ) : null}
              </>
            ) : null}

            {calendarFeedback ? (
              <p
                style={{
                  margin: "14px 0 0",
                  fontSize: 13,
                  lineHeight: 1.45,
                  color: calendarFeedback.tone === "ok" ? "#34d399" : "#f87171",
                }}
              >
                {calendarFeedback.text}
              </p>
            ) : null}
          </>
        ) : null}

        {step === STEP.summary && summaryPayload && distance ? (
          <>
            <h2 style={sectionTitleStyle}>{t("onboarding.step4_title")}</h2>
            <p style={sectionSubtitleStyle}>{t("onboarding.step4_subtitle")}</p>

            <dl
              style={{
                margin: "0 0 24px",
                padding: 0,
                display: "grid",
                gap: 12,
                fontSize: 14,
                lineHeight: 1.45,
              }}
            >
              <SummaryRow term="Distanz">{summaryPayload.raceDistanceLabel}</SummaryRow>
              <SummaryRow term="Ziel">
                {formatGoalSummary(summaryPayload.raceGoal, summaryPayload.raceTargetTime)}
              </SummaryRow>
              <SummaryRow term="Renndatum">{summaryPayload.raceDate || "—"}</SummaryRow>
              <SummaryRow term="Trainingsstart">{summaryPayload.planStartDate || "—"}</SummaryRow>
              <SummaryRow term="Rennen">{summaryPayload.raceName || "—"}</SummaryRow>
              <SummaryRow term="Lauftage">
                {`${summaryPayload.planInputs.runDaysPerWeek} Tage pro Woche · verfügbar: ${summaryPayload.planInputs.availableDays.join(", ")}`}
              </SummaryRow>
              <SummaryRow term="Long Run">{WEEKDAY_LONG_DE[summaryPayload.planInputs.longRunDay]}</SummaryRow>
              <SummaryRow term="Wöchentlicher Umfang">
                {`${formatKmDe(summaryPayload.planInputs.currentWeeklyKm)} km`}
              </SummaryRow>
              <SummaryRow term="Längster Lauf (4 Wochen)">
                {summaryPayload.planInputs.longestRecentRunKm !== null
                  ? `${formatKmDe(summaryPayload.planInputs.longestRecentRunKm)} km`
                  : `Keine Angabe (wir rechnen mit ${standardLongestRunKm(distance.coreDistance, summaryPayload.planInputs.runDaysPerWeek)} km)`}
              </SummaryRow>
              <SummaryRow term="Letztes Rennergebnis">
                {summaryPayload.planInputs.recentRace === null
                  ? "Keine Angabe (Einsteiger-Modus)"
                  : summaryPayload.planInputs.recentRace.estimated
                    ? `Schätzung: ${recentRaceLabel(summaryPayload.planInputs.recentRace.distanceKm)} in ${formatRaceSeconds(summaryPayload.planInputs.recentRace.timeSeconds)}`
                    : `${recentRaceLabel(summaryPayload.planInputs.recentRace.distanceKm)} in ${formatRaceSeconds(summaryPayload.planInputs.recentRace.timeSeconds)} am ${germanDateFromYmd(summaryPayload.planInputs.recentRace.dateYmd ?? "")}`}
              </SummaryRow>
              <SummaryRow term="Deine Präferenzen">{preferencesSummaryLabel}</SummaryRow>
            </dl>
          </>
        ) : null}

        {generateError !== null ? (
          <p
            style={{
              margin: "0 0 12px",
              fontSize: 13,
              color: "#f87171",
              textAlign: "center",
              lineHeight: 1.4,
            }}
          >
            {generateError}
          </p>
        ) : null}

        <div style={{ display: "flex", gap: 10, marginTop: 24 }}>
          {step > 1 ? (
            <button
              type="button"
              onClick={goBack}
              disabled={isGenerating}
              style={{
                flex: 1,
                padding: "14px 16px",
                fontSize: 15,
                fontWeight: 600,
                borderRadius: 14,
                border: "1px solid rgba(148, 163, 184, 0.2)",
                background: "#0b1220",
                color: "var(--text-secondary)",
                cursor: isGenerating ? "not-allowed" : "pointer",
                opacity: isGenerating ? 0.6 : 1,
              }}
            >
              {t("onboarding.back")}
            </button>
          ) : null}

          {step < TOTAL_STEPS ? (
            <button
              type="button"
              disabled={!stepValid(step)}
              onClick={goNext}
              style={{
                flex: step > 1 ? 1.4 : 1,
                padding: "14px 16px",
                fontSize: 15,
                fontWeight: 700,
                border: "none",
                borderRadius: 14,
                cursor: stepValid(step) ? "pointer" : "not-allowed",
                opacity: stepValid(step) ? 1 : 0.5,
                color: "#fff",
                background: "linear-gradient(135deg, #10b981, #3b82f6)",
              }}
            >
              {t("onboarding.next")}
            </button>
          ) : (
            <button
              type="button"
              disabled={isGenerating}
              onClick={() => void handleFinish()}
              style={{
                flex: step > 1 ? 1.4 : 1,
                padding: "14px 16px",
                fontSize: 15,
                fontWeight: 700,
                border: "none",
                borderRadius: 14,
                cursor: isGenerating ? "not-allowed" : "pointer",
                opacity: isGenerating ? 0.7 : 1,
                color: "#fff",
                background: "linear-gradient(135deg, #10b981, #3b82f6)",
              }}
            >
              {finishButtonLabel}
            </button>
          )}
        </div>

        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            disabled={isGenerating}
            style={{
              display: "block",
              margin: "14px auto 0",
              padding: "8px 12px",
              fontSize: 14,
              fontWeight: 600,
              border: "none",
              background: "transparent",
              color: "var(--text-secondary)",
              cursor: isGenerating ? "not-allowed" : "pointer",
              opacity: isGenerating ? 0.6 : 1,
            }}
          >
            Abbrechen
          </button>
        ) : null}
      </div>
    </div>
  );
}
