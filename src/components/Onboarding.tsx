import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
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
import { getAppNow } from "../core/time/timeSystem";
import {
  fetchClaudePlanStructureDirect,
  type ClaudePlanStructure,
  type PlanGenerationProfile,
} from "../lib/ai/claudePlanService";
import { generateMarathonPlanV2ToRace } from "../lib/ai/coachPlanMutations";
import type { PlanPatch } from "../lib/ai/types";
import {
  DISTANCE_SHORTCUTS,
  WEEKLY_KM_RANGES,
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

// ---------------------------------------------------------------------------
// Plan-personalisation helpers (applied after deterministic generation)
// ---------------------------------------------------------------------------

/**
 * Renames workout titles using Claude's sessionNames pool.
 * Index is per-sessionType so names cycle evenly within each type.
 */
function applySessionNames(
  plan: TrainingPlanV2,
  sessionNames: Record<string, string[]>,
): TrainingPlanV2 {
  const typeCounters: Record<string, number> = {};
  const renamedById = new Map<string, string>();

  for (const w of plan.workouts) {
    if (w.sessionType === "rest" || w.sessionType === "race") continue;
    const names = sessionNames[w.sessionType];
    if (!names?.length) continue;
    const idx = typeCounters[w.sessionType] ?? 0;
    typeCounters[w.sessionType] = idx + 1;
    renamedById.set(w.id, names[idx % names.length]);
  }

  if (renamedById.size === 0) return plan;

  const workouts = plan.workouts.map((w) => {
    const title = renamedById.get(w.id);
    return title ? { ...w, title } : w;
  });
  const weeks = plan.weeks.map((wk) => ({
    ...wk,
    workouts: wk.workouts.map((w) => {
      const title = renamedById.get(w.id);
      return title ? { ...w, title } : w;
    }),
  }));
  return { ...plan, workouts, weeks };
}

/**
 * Overrides week meta (label, focus, phase) based on Claude's phase list.
 * Claude provides phases in order [BASE, BUILD, …, TAPER] with week counts.
 * We map those to week numbers 1..N in the generated plan.
 */
function applyClaudePhases(
  plan: TrainingPlanV2,
  phases: ClaudePlanStructure["phases"],
): TrainingPlanV2 {
  if (!phases?.length) return plan;

  const phaseMeta = new Map<number, { label: string; focus: string; name: string }>();
  let offset = 0;
  for (const p of phases) {
    for (let i = 0; i < p.weeks; i++) {
      phaseMeta.set(offset + i + 1, { label: p.label, focus: p.focus, name: p.name });
    }
    offset += p.weeks;
  }

  const weeks = plan.weeks.map((wk) => {
    const wn = wk.meta?.wn;
    if (!wn) return wk;
    const pm = phaseMeta.get(wn);
    if (!pm) return wk;
    return {
      ...wk,
      meta: { ...wk.meta, label: pm.label, focus: pm.focus, phase: pm.name },
    };
  });
  return { ...plan, weeks };
}

/** Applies all Claude structure overlays to a deterministically generated plan. */
function applyClaudeStructure(
  plan: TrainingPlanV2,
  structure: ClaudePlanStructure,
): TrainingPlanV2 {
  let result = plan;
  if (structure.sessionNames) result = applySessionNames(result, structure.sessionNames);
  if (structure.phases?.length) result = applyClaudePhases(result, structure.phases);
  return result;
}

// ---------------------------------------------------------------------------

const MAX_PREFERENCE_FIELDS = 10;
const PREFERENCE_HINTS = [
  "z.B. Rennrad ins Training integrieren",
  "z.B. Long Run immer sonntags",
  "z.B. Krafttraining einbauen",
  "z.B. Kein Training am Dienstag",
] as const;

type OnboardingStep = 1 | 2 | 3 | 4;

const inputStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "12px 14px",
  fontSize: 15,
  borderRadius: 12,
  border: "1px solid rgba(148, 163, 184, 0.2)",
  background: "#070b16",
  color: "#e2e8f0",
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
  color: "#f1f5f9",
};

const sectionSubtitleStyle: CSSProperties = {
  margin: "0 0 20px",
  fontSize: 13,
  color: "#94a3b8",
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
    border: `1px solid ${active ? "#3b82f6" : "rgba(148, 163, 184, 0.2)"}`,
    background: active ? "rgba(59, 130, 246, 0.18)" : "#070b16",
    color: active ? "#e2e8f0" : "#94a3b8",
    cursor: "pointer",
    textAlign: "center",
  };
}

function collectUserPreferences(inputs: string[]): string[] {
  return inputs.map((p) => p.trim()).filter(Boolean);
}

/** Erkennt Ruhetag-Präferenzen aus Freitext (Onboarding Step 3). */
export function parseRestDayFromPreferences(prefs: string[]): number | undefined {
  const text = prefs.join(" ").toLowerCase();

  const restIndicators = [
    "kein training",
    "kein laufen",
    "kein sport",
    "ruhetag",
    "rest day",
    "rest",
    "frei",
    "pause",
    "trainingsfreier",
  ];

  const hasRestContext = restIndicators.some((indicator) => {
    if (indicator === "frei" || indicator === "rest" || indicator === "pause") {
      return new RegExp(`\\b${indicator}\\b`).test(text);
    }
    return text.includes(indicator);
  });
  if (!hasRestContext) return undefined;

  const days = [
    { keywords: ["montag", "monday"], dow: 1 },
    { keywords: ["dienstag", "tuesday"], dow: 2 },
    { keywords: ["mittwoch", "wednesday"], dow: 3 },
    { keywords: ["donnerstag", "thursday"], dow: 4 },
    { keywords: ["freitag", "friday"], dow: 5 },
    { keywords: ["samstag", "saturday"], dow: 6 },
    { keywords: ["sonntag", "sunday"], dow: 0 },
  ];

  for (const day of days) {
    if (day.keywords.some((k) => text.includes(k))) return day.dow;
  }
  return undefined;
}

export type OnboardingProps = {
  onComplete: (
    prefs: PersistedMarathonPreferences,
    plan: TrainingPlanV2 | null,
    patches: PlanPatch[],
    planName?: string,
  ) => void | Promise<void>;
};

export function Onboarding({ onComplete }: OnboardingProps) {
  const [step, setStep] = useState<OnboardingStep>(1);
  const [shortcutId, setShortcutId] = useState<DistanceShortcutId | null>(null);
  const [customDistance, setCustomDistance] = useState("");
  const [raceGoal, setRaceGoal] = useState<RaceGoal>("finish");
  const [timePickerValue, setTimePickerValue] = useState<TimePickerValue>({
    hours: 3,
    minutes: 30,
    seconds: 0,
  });
  const [weeklyKmRange, setWeeklyKmRange] = useState("");
  const [raceDate, setRaceDate] = useState("");
  const [raceName, setRaceName] = useState("");
  const [planStartChoice, setPlanStartChoice] = useState<PlanStartChoice>("today");
  const [planStartCustomDate, setPlanStartCustomDate] = useState("");
  const [preferenceInputs, setPreferenceInputs] = useState<string[]>(["", ""]);
  const [skippedPreferences, setSkippedPreferences] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPersonalizing, setIsPersonalizing] = useState(false);

  const distance = useMemo(
    () => resolveDistanceSelection(shortcutId, customDistance),
    [shortcutId, customDistance],
  );

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

  const raceDateError = useMemo(() => {
    if (!raceDate.trim()) return "";
    const start = planStartResolved.date ?? startOfLocalDay(getAppNow());
    const err = validateMaskedDateInput(raceDate, {
      minDate: start,
      strictAfterMin: true,
    });
    if (err === "Datum muss nach dem früheren Datum liegen.") {
      return "Renndatum muss nach dem Trainingsstart liegen.";
    }
    return err ?? "";
  }, [raceDate, planStartResolved.date]);

  const step1Valid = distance != null;
  const step2Valid =
    weeklyKmRange.trim().length > 0 &&
    (planStartChoice !== "custom" ||
      (planStartResolved.date != null && !planStartDateError)) &&
    !raceDateError &&
    (raceDate.trim().length === 0 || isCompleteMaskedDate(raceDate));

  const summaryPayload = useMemo((): OnboardingSubmitPayload | null => {
    if (!distance || !weeklyKmRange.trim()) return null;
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
      weeklyKmRange: weeklyKmRange.trim(),
      userPreferences,
    };
  }, [
    distance,
    weeklyKmRange,
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

  const handleCustomDistanceChange = useCallback((value: string) => {
    setCustomDistance(value);
    if (value.trim()) setShortcutId(null);
  }, []);

  const handleShortcutSelect = useCallback((id: DistanceShortcutId) => {
    setShortcutId(id);
    setCustomDistance("");
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
    setStep(4);
  }, []);

  const goBack = useCallback(() => {
    setStep((s) => (s > 1 ? ((s - 1) as OnboardingStep) : s));
  }, []);

  const goNext = useCallback(() => {
    setStep((s) => (s < 4 ? ((s + 1) as OnboardingStep) : s));
  }, []);

  const handleFinish = useCallback(async () => {
    if (!summaryPayload || isGenerating) return;

    try {
      setIsPersonalizing(true);
      setIsGenerating(false);
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
          };

          const claudeResult = await fetchClaudePlanStructureDirect(profile);

          setIsGenerating(true);
          await new Promise<void>((resolve) => setTimeout(resolve, 50));

          plan = generateMarathonPlanV2ToRace(
            startDay,
            raceDay,
            summaryPayload.raceGoal,
            summaryPayload.raceDistanceKm,
            summaryPayload.weeklyKmRange,
            undefined,
            claudeResult.structure?.rules ?? undefined,
          );

          if (claudeResult.structure) {
            plan = applyClaudeStructure(plan, claudeResult.structure);
          }

          patches = [];
        }
      }

      const planName = [
        summaryPayload.raceDistanceLabel ?? "Marathon",
        summaryPayload.raceName,
        summaryPayload.raceDate,
      ]
        .filter(Boolean)
        .join(" – ");

      await onComplete(prefs, plan, patches, planName || undefined);
      // eslint-disable-next-line no-console
      console.log("[Onboarding] onComplete done");
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[Onboarding] ERROR in handleFinish:", err);
    } finally {
      // eslint-disable-next-line no-console
      console.log("[Onboarding] finally – resetting loading states");
      setIsGenerating(false);
      setIsPersonalizing(false);
    }
  }, [summaryPayload, isGenerating, onComplete, userPreferences]);

  const finishButtonLabel = isPersonalizing
    ? "Plan wird personalisiert…"
    : isGenerating
      ? "Plan wird erstellt…"
      : "Los geht's";

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
        background: "#0a0a0a",
        color: "#e2e8f0",
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
          border: "1px solid rgba(148, 163, 184, 0.18)",
          background: "rgba(15, 23, 42, 0.65)",
          boxShadow: "0 24px 48px rgba(0, 0, 0, 0.35)",
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
          aria-label={`Schritt ${step} von 4`}
        >
          {([1, 2, 3, 4] as const).map((n) => (
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

        {step === 1 ? (
          <>
            <h2 style={sectionTitleStyle}>Distanz & Ziel</h2>
            <p style={sectionSubtitleStyle}>Wähle deine Renndistanz und dein Ziel.</p>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
              {DISTANCE_SHORTCUTS.map((sc) => (
                <button
                  key={sc.id}
                  type="button"
                  onClick={() => handleShortcutSelect(sc.id)}
                  style={{
                    ...chipButtonStyle(shortcutId === sc.id && !customDistance.trim()),
                    flex: "1 1 45%",
                  }}
                >
                  {sc.id === "half" || sc.id === "marathon" ? sc.displayLabel : sc.label}
                </button>
              ))}
            </div>

            <label htmlFor="onboard-custom-distance" style={labelStyle}>
              Oder eigene Distanz eingeben
            </label>
            <input
              id="onboard-custom-distance"
              type="text"
              value={customDistance}
              onChange={(e) => handleCustomDistanceChange(e.target.value)}
              placeholder="z.B. 50 km, 100 Meilen, Leadville 100"
              style={{ ...inputStyle, marginBottom: distance ? 20 : 0 }}
            />

            {distance ? (
              <div style={{ marginTop: 20 }}>
                <div style={{ ...labelStyle, marginBottom: 8 }}>Dein Ziel</div>
                <div style={{ display: "flex", gap: 8, marginBottom: raceGoal === "time" ? 14 : 0 }}>
                  <button
                    type="button"
                    onClick={() => setRaceGoal("finish")}
                    style={chipButtonStyle(raceGoal === "finish")}
                  >
                    Nur finishen
                  </button>
                  <button
                    type="button"
                    onClick={() => setRaceGoal("time")}
                    style={chipButtonStyle(raceGoal === "time")}
                  >
                    Unter einer Zielzeit
                  </button>
                </div>
                {raceGoal === "time" ? (
                  <>
                    <div style={{ ...labelStyle, marginBottom: 10 }}>Zielzeit</div>
                    <TimePicker value={timePickerValue} onChange={setTimePickerValue} />
                  </>
                ) : null}
              </div>
            ) : null}
          </>
        ) : null}

        {step === 2 ? (
          <>
            <h2 style={sectionTitleStyle}>Erfahrung & Rennen</h2>
            <p style={sectionSubtitleStyle}>Damit wir deinen Plan passend aufbauen können.</p>

            <div style={{ ...labelStyle, marginBottom: 8 }}>Wöchentlicher Umfang</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
              {WEEKLY_KM_RANGES.map((range) => (
                <button
                  key={range}
                  type="button"
                  onClick={() => setWeeklyKmRange(range)}
                  style={{
                    ...chipButtonStyle(weeklyKmRange === range),
                    flex: "none",
                    textAlign: "left",
                  }}
                >
                  {range}
                </button>
              ))}
            </div>

            <DateInputMasked
              id="onboard-race-date"
              label="Wann ist dein Rennen?"
              value={raceDate}
              onChange={setRaceDate}
              minDate={planStartResolved.date ?? startOfLocalDay(getAppNow())}
              strictAfterMin
              optional
              error={raceDateError}
              style={{ marginBottom: 0 }}
            />

            <div style={{ ...labelStyle, marginBottom: 8, marginTop: 4 }}>Wann soll dein Training starten?</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: planStartChoice === "custom" ? 12 : 20 }}>
              <button
                type="button"
                onClick={() => setPlanStartChoice("today")}
                style={chipButtonStyle(planStartChoice === "today")}
              >
                Heute
              </button>
              <button
                type="button"
                onClick={() => setPlanStartChoice("nextMonday")}
                style={chipButtonStyle(planStartChoice === "nextMonday")}
              >
                Nächsten Montag
              </button>
              <button
                type="button"
                onClick={() => setPlanStartChoice("custom")}
                style={chipButtonStyle(planStartChoice === "custom")}
              >
                Eigenes Datum
              </button>
            </div>
            {planStartChoice === "custom" ? (
              <DateInputMasked
                id="onboard-plan-start-date"
                label="Startdatum"
                value={planStartCustomDate}
                onChange={setPlanStartCustomDate}
                minDate={startOfLocalDay(getAppNow())}
                error={planStartDateError}
                style={{ marginBottom: 0 }}
              />
            ) : null}

            <label htmlFor="onboard-race-name" style={labelStyle}>
              Welches Rennen läufst du?
            </label>
            <input
              id="onboard-race-name"
              type="text"
              value={raceName}
              onChange={(e) => setRaceName(e.target.value)}
              placeholder="z.B. Berlin Marathon, Leadville 100, Moab 240"
              style={inputStyle}
            />
          </>
        ) : null}

        {step === 3 ? (
          <>
            <h2 style={sectionTitleStyle}>Deine Trainings-Präferenzen</h2>
            <p style={sectionSubtitleStyle}>
              Optional — je mehr du angibst, desto individueller dein Plan
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 14 }}>
              {preferenceInputs.map((value, index) => (
                <div key={index} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input
                    type="text"
                    value={value}
                    onChange={(e) => handlePreferenceChange(index, e.target.value)}
                    placeholder="z.B. Kein Training am Dienstag"
                    style={{ ...inputStyle, flex: 1 }}
                    aria-label={`Präferenz ${index + 1}`}
                  />
                  {preferenceInputs.length > 1 ? (
                    <button
                      type="button"
                      onClick={() => handleRemovePreferenceField(index)}
                      aria-label="Präferenz entfernen"
                      style={{
                        flexShrink: 0,
                        width: 36,
                        height: 36,
                        borderRadius: 10,
                        border: "1px solid rgba(148, 163, 184, 0.2)",
                        background: "#0b1220",
                        color: "#94a3b8",
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
                  color: "#94a3b8",
                  cursor: "pointer",
                }}
              >
                + Weitere Präferenz hinzufügen
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
                color: "#64748b",
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
                color: "#64748b",
                fontSize: 13,
                textDecoration: "underline",
                cursor: "pointer",
              }}
            >
              Überspringen
            </button>
          </>
        ) : null}

        {step === 4 && summaryPayload && distance ? (
          <>
            <h2 style={sectionTitleStyle}>Zusammenfassung</h2>
            <p style={sectionSubtitleStyle}>Stimmt alles? Dann legen wir los.</p>

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
              <div>
                <dt
                  style={{
                    margin: 0,
                    fontSize: 11,
                    fontWeight: 700,
                    color: "#7c8aa5",
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                  }}
                >
                  Distanz
                </dt>
                <dd style={{ margin: "4px 0 0", color: "#e2e8f0" }}>
                  {summaryPayload.raceDistanceLabel}
                </dd>
              </div>
              <div>
                <dt
                  style={{
                    margin: 0,
                    fontSize: 11,
                    fontWeight: 700,
                    color: "#7c8aa5",
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                  }}
                >
                  Ziel
                </dt>
                <dd style={{ margin: "4px 0 0", color: "#e2e8f0" }}>
                  {formatGoalSummary(summaryPayload.raceGoal, summaryPayload.raceTargetTime)}
                </dd>
              </div>
              <div>
                <dt
                  style={{
                    margin: 0,
                    fontSize: 11,
                    fontWeight: 700,
                    color: "#7c8aa5",
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                  }}
                >
                  Wöchentlicher Umfang
                </dt>
                <dd style={{ margin: "4px 0 0", color: "#e2e8f0" }}>
                  {summaryPayload.weeklyKmRange}
                </dd>
              </div>
              <div>
                <dt
                  style={{
                    margin: 0,
                    fontSize: 11,
                    fontWeight: 700,
                    color: "#7c8aa5",
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                  }}
                >
                  Renndatum
                </dt>
                <dd style={{ margin: "4px 0 0", color: "#e2e8f0" }}>
                  {summaryPayload.raceDate || "—"}
                </dd>
              </div>
              <div>
                <dt
                  style={{
                    margin: 0,
                    fontSize: 11,
                    fontWeight: 700,
                    color: "#7c8aa5",
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                  }}
                >
                  Trainingsstart
                </dt>
                <dd style={{ margin: "4px 0 0", color: "#e2e8f0" }}>
                  {summaryPayload.planStartDate || "—"}
                </dd>
              </div>
              <div>
                <dt
                  style={{
                    margin: 0,
                    fontSize: 11,
                    fontWeight: 700,
                    color: "#7c8aa5",
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                  }}
                >
                  Rennen
                </dt>
                <dd style={{ margin: "4px 0 0", color: "#e2e8f0" }}>
                  {summaryPayload.raceName || "—"}
                </dd>
              </div>
              <div>
                <dt
                  style={{
                    margin: 0,
                    fontSize: 11,
                    fontWeight: 700,
                    color: "#7c8aa5",
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                  }}
                >
                  Deine Präferenzen
                </dt>
                <dd style={{ margin: "4px 0 0", color: "#e2e8f0" }}>
                  {preferencesSummaryLabel}
                </dd>
              </div>
            </dl>
          </>
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
                color: "#94a3b8",
                cursor: isGenerating ? "not-allowed" : "pointer",
                opacity: isGenerating ? 0.6 : 1,
              }}
            >
              Zurück
            </button>
          ) : null}

          {step < 4 ? (
            <button
              type="button"
              disabled={step === 1 ? !step1Valid : step === 2 ? !step2Valid : false}
              onClick={goNext}
              style={{
                flex: step > 1 ? 1.4 : 1,
                padding: "14px 16px",
                fontSize: 15,
                fontWeight: 700,
                border: "none",
                borderRadius: 14,
                cursor:
                  step === 1 && !step1Valid
                    ? "not-allowed"
                    : step === 2 && !step2Valid
                      ? "not-allowed"
                      : "pointer",
                opacity:
                  step === 1 && !step1Valid ? 0.5 : step === 2 && !step2Valid ? 0.5 : 1,
                color: "#fff",
                background: "linear-gradient(135deg, #10b981, #3b82f6)",
              }}
            >
              Weiter
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
      </div>
    </div>
  );
}
