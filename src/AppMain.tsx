// @ts-nocheck
/** TODO(remove-ts-nocheck): Highest-friction seams for a future strict pass (do not widen types opportunistically):
 *
 * ## Hydration-Shapes
 * - `safeParseJSON` Ergebnisse vs. „volle“ Domain-Typen (`SessionLog`, Health-Runs, Recovery-Rows).
 * - Teilweise/fehlende Felder beim ersten Paint nach Storage-Load.
 *
 * ## Health/UI-Unions
 * - Apple Health: `null`/`undefined`-Drift, Capacitor-Rückgaben vs. React-State.
 * - Berechtigungs-Enums (`PermissionState`) vs. Roh-Booleans vom Native-Bridge.
 *
 * ## Runtime-Domain-Bridges
 * - `displayPlan` / `PlanWeek` / `AiPlanWeek` / `TrainingPlanV2` an Grenzen zwischen UI, AI und Recovery.
 *
 * ## Legacy mutable APIs
 * - ältere Setter/Mutationspfade und Objekte, die bewusst in-place aktualisiert werden.
 *
 * (App wiring nutzt zunehmend typisierte Runtime-Hooks unter `src/app/runtime`; diese Liste bleibt für Rest-Brücken.)
 *
 * ### `@ts-nocheck` hier noch nicht streichen
 * Ein Probe-Lauf ohne diese Zeile erzeugt aktuell **Hunderte** `strict`-Meldungen im gesamten Dateibody (z. B. implicit `any`
 * in Inline-Handlern und älteren UI-Helfern). Reduktion nur **schrittweise** über echte Parameter-/Rückgabetypen oder
 * punktuelle `@ts-expect-error` auf einzelnen Zeilen — nicht durch globales Aufweichen von Domain-Typen.
 */
import { useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback } from "react";
import RecoveryVerlaufCard from "./components/RecoveryVerlaufCard";
import BackupControls from "./BackupControls";
import { Capacitor } from "@capacitor/core";
import { App as CapacitorApp } from "@capacitor/app";
import {
  berlinWallClockYmd,
  calendarDaysBetweenYmd,
  getConsistencyStats,
  getPredictionReadiness,
  getShareSummary,
  getTodayNextSession,
  isSessionLogDone,
  parseSessionDateLabel,
  parseTargetTimeToSeconds,
  resolveCurrentPlanWeekIndex,
  safeParseJSON,
} from "./appSmartFeatures";
import MarathonPredictionCard from "./components/MarathonPredictionCard";
import RaceCalculator from "./components/RaceCalculator";
import SurfaceCard from "./components/SurfaceCard";
import { AccountDeleteDialog } from "./components/AccountDeleteDialog";
import { Onboarding } from "./components/Onboarding";
import {
  RESET_ONBOARDING_STORAGE_KEY,
  needsOnboarding,
} from "./onboarding/marathonPreferencesOnboarding";
import {
  buildIsolatedOnboardingPreferences,
  detachSessionLogsFromPlan,
} from "./onboarding/onboardingPlanIsolation";
import { MIGRATION_TO_SUPABASE_DONE_KEY } from "./lib/supabase/migrations/migrateLocalDataToSupabase";
import AiCoachPanel from "./components/ai/AiCoachPanel";
import { PostWorkoutSummaryCard } from "./components/PostWorkoutSummaryCard";
import { getCoachFeedback } from "./coachFeedback";
import { isHomePreStart } from "./homeStatus";
import { usePostWorkoutSummary } from "./hooks/usePostWorkoutSummary";
import { usePostWorkoutHrEnrichment } from "./hooks/usePostWorkoutHrEnrichment";
import {
  useAiCoachChatMessagesState,
  useAppCorePersistenceEffects,
  useDisplayPlanFromTrainingState,
  useIosHealthKitBootstrap,
  useRecoveryDomainRuntime,
} from "./app/runtime";
import { useAuth } from "./contexts/AuthContext";
import {
  formatKm,
  getDisplayPlannedDistanceKm,
  getSessionPlannedDistanceKm,
  type SessionLog,
} from "./marathonPrediction";
import { getMarathonPrediction } from "./marathonForecast";
import {
  analyzeWeek,
  getPlanWeekTimeBoundsMs,
  getSessionRunningActualKm,
  getWeekPlannedLoadKm,
  getWeekRunningDistanceKm,
  resolveWeekDisplayRunKm,
} from "./weeklyAnalysis";
import { readRemoteStorage, writeRemoteStorage } from "./storage";
import { computePlanAdherenceScore, computePlanDueSessionCounts, planAdherenceTextColor } from "./coach/adherenceScore";
import { getAiContext } from "./lib/ai/getAiContext";
import { AI_COACH_AVAILABLE_SCREENS } from "./lib/ai/aiCoachAvailableScreens";
import { loadProfile, saveProfile } from "./lib/supabase/services/profilesService";
import { loadPlanPatches, savePlanPatch } from "./lib/supabase/services/planPatchesService";
import { loadSessionLogs, saveSessionLog } from "./lib/supabase/services/sessionLogsService";
import {
  deletePlan,
  loadAllTrainingPlans,
  loadTrainingPlan,
  saveTrainingPlan,
  setActivePlan,
  type TrainingPlanListItem,
} from "./lib/supabase/services/trainingPlanService";
import { PlanSwitcher } from "./components/PlanSwitcher";
import { loadHealthWorkouts, saveHealthWorkout } from "./lib/supabase/services/healthWorkoutsService";
import { loadRecoveryDaily, saveRecoveryDay } from "./lib/supabase/services/recoveryDailyService";
import { loadCoachMemory } from "./lib/supabase/services/coachMemoryService";
import { deleteAccountViaApi } from "./lib/supabase/services/deleteAccountService";
import { clearMarathonLocalStorage } from "./persistence/clearMarathonLocalStorage";
import { migrateLocalDataToSupabase } from "./lib/supabase/migrations/migrateLocalDataToSupabase";
import { configureCoachMemoryRemoteSync, setCoachMemory } from "./lib/ai/memory/coachMemory";
import { buildTrainingPlanV2FromBasePlan, buildWeekMetaMapFromBasePlan } from "./planV2/fromBasePlan";
import { isUserTrainingPlan } from "./planV2/isUserTrainingPlan";
import { validateTrainingPlanV2Integrity } from "./ai/validation/validateTrainingPlanV2Integrity";
import { applyConversionToPlan } from "./ai/validation/validateConversion";
import { mergePlanPatchLists, trySwapWorkoutDatesInPlan } from "./mutations";
import {
  MARATHON_AI_PLAN_PATCHES_KEY,
  MARATHON_APPLE_HEALTH_CONNECTED_KEY,
  MARATHON_LOGS_KEY,
  MARATHON_PREFERENCES_KEY,
  TRAINING_PLAN_V2_STORAGE_KEY,
} from "./persistence/marathonLocalStorageKeys";
import { safeReadLocalStorageItem } from "./persistence/safeLocalStorage";
import { hydrateMarathonLogsFromStorage } from "./sessionLogs/hydrateMarathonLogs";
import type { TrainingPhase } from "./planV2/trainingPhase";
import { buildSwapAthleteFacingWarnings, validateSwap } from "./ai/validation/validateSwap";
import { buildValidationContext } from "./ai/validation/buildValidationContext";
import {
  getStoredHealthRunCanonicalType,
  loadHealthRunsFromStorage,
  mergeHealthRuns,
  storedHealthRunDistanceKmNumeric,
  storedHealthRunIsRunning,
} from "./healthRuns";
import { backfillIntervalWorkoutScores } from "./ai/analysis/backfillIntervalWorkoutScores";
import { readMigrationFlags, writeMigrationFlags } from "./migrationFlags";
import { classifyWorkoutType } from "./appleHealth/workoutTypeClassifier";
import {
  buildHealthLinkableSessionPool,
  getAssignableHealthLinkPlanSessionsWithMeta,
  HEALTH_LINK_RUN_TYPES,
  healthLinkAssignmentBucketLabelDe,
} from "./appleHealth/healthLinkAssignableSessions";
import {
  buildAssignedRunFromWorkout,
  buildSelectionOptionsFromHealthRuns,
  formatWorkoutSelectionDate,
  storedHealthRunToWorkout,
  workoutLabelDeFromCanonical,
} from "./appleHealth/workoutSelectionModel";
import {
  APPLE_HEALTH_READ_TYPES,
  healthKitFetchRecoveryDailyLast120Days,
  healthKitFetchRunningWorkoutsLast7Days,
  healthKitFetchWorkoutsForAppStorage,
  appleHealthCheckPermission,
  healthKitForceRefreshWorkoutsLast3Days,
  healthKitIsAvailable,
  healthKitRequestReadAuthorization,
} from "./health/healthDataService";
import type { PermissionState } from "./recovery/recoveryDisplayState";
import { formatScore100 } from "./ui/formatScore100";
import {
  logRunBikeTotalFromHealthDev,
  logWorkoutSanityCheckDev,
  sumRunBikeTotalKmFromHealthInRange,
} from "./runCyclingDistanceSeparation";
import { loadRecoveryDailyFromStorage, mergeRecoveryDailyPersisted } from "./recovery/recoveryStorage";
import { buildTodayAppleCoachLines } from "./appleHealth/todayPlanVsAppleRun";
import { applyAppleHealthTrainingSync } from "./trainingIntelligence/applyAppleHealthSync";
import { isRunWorkout } from "./trainingIntelligence/isRunWorkout";
import { normalizeAppleHealthRun } from "./trainingIntelligence/normalizeAppleHealthRun";
import {
  getHomeCoachAssessmentFixedCopy,
  formatSessionHrTargetLine,
  getSessionTargetLines,
  getSessionTargetPreviewOneLiner,
  getWeekLinkedRunFixedPrefix,
} from "./trainingIntelligence/sessionPlanTargets";
import { computeTrainingProgressPct } from "./selectors/trainingProgress";
import {
  buildTrainingLoadFallbackRecommendation,
  getTrainingLoadRecommendation,
} from "./trainingLoadRecommendation";
import {
  LAYOUT_BUDGET,
  LAYOUT_SPACING,
  getCompactScreenSpacing,
  getHomeSpacing,
  validateNoVerticalOverflow,
  validateSiblingStackNoOverlap,
} from "./layout";
import {
  beginAppFrame,
  getAppNow,
  getAppNowEpochMs,
  getAppTodayYmd,
} from "./core/time/timeSystem";
import {
  devMarkOncePerFrame,
  monitorMetricSource,
  productionMarkOncePerFrame,
  sanitizeOneSentence,
} from "./ui/productionGuards";
import { shouldUseIntervalScoring } from "./utils/workoutEvaluationGuards";
const APPLE_HEALTH_CONNECTED_KEY = MARATHON_APPLE_HEALTH_CONNECTED_KEY;

function readStoredJson(key, fallback) {
  return safeParseJSON(safeReadLocalStorageItem(key), fallback);
}

function logHealthKit(_message, ..._rest) {}

const PI = {
  MINI:  { label:"Mini-Prep",         emoji:"🔄", col:"#6366f1", bg:"rgba(99,102,241,0.12)" },
  BASE:  { label:"Basisaufbau",        emoji:"🌱", col:"#10b981", bg:"rgba(16,185,129,0.12)" },
  DEV:   { label:"Entwicklung",        emoji:"📈", col:"#3b82f6", bg:"rgba(59,130,246,0.12)" },
  BUILD: { label:"Aufbau & Peak",      emoji:"🔥", col:"#ef4444", bg:"rgba(239,68,68,0.12)" },
  SPEC:  { label:"Wettkampfspez.",     emoji:"🎯", col:"#f59e0b", bg:"rgba(245,158,11,0.12)" },
  TAPER: { label:"Taper",             emoji:"⚡", col:"#a855f7", bg:"rgba(168,85,247,0.12)" },
};
const DEFAULT_VIEW = "home";
const TI = {
  rest:     { label:"Ruhe",         emoji:"😴", col:"#4b5563" },
  easy:     { label:"Easy Run",     emoji:"🟢", col:"#10b981" },
  interval: { label:"Intervall",    emoji:"⚡", col:"#ef4444" },
  tempo:    { label:"Tempo",        emoji:"🔶", col:"#f59e0b" },
  long:     { label:"Long Run",     emoji:"🔵", col:"#3b82f6" },
  strength: { label:"Krafttraining",emoji:"💪", col:"#8b5cf6" },
  bike:     { label:"Rennrad",      emoji:"🚴", col:"#06b6d4" },
  race:     { label:"Rennen",       emoji:"🏁", col:"#fbbf24" },
};

const s=(id,day,date,type,title,km,desc,pace)=>({id,day,date,type,title,km,desc,pace});

const LEGACY_EMBEDDED_PLAN_WEEKS=[
  // ── MINI-PREP ──────────────────────────────────
  {wn:1,phase:"MINI",label:"Mini-Prep Woche 1",dates:"6.–12. April 2026",km:35,
   focus:"Sanfter Wiedereinstieg nach Weisheitszahn-OP – kein Druck!",
   s:[
    s("w01-mo","Mo","6. Apr","rest","Ruhetag",0,"Vollständige Erholung. Spazieren ok.",null),
    s("w01-di","Di","7. Apr","easy","Easy Run",6,"Sehr locker. Körper testen nach OP. Puls <140.","5:30–5:50/km"),
    s("w01-mi","Mi","8. Apr","easy","Easy Run",8,"Lockeres Dauerlauftempo. Kein Stress.","5:20–5:40/km"),
    s("w01-do","Do","9. Apr","strength","Krafttraining (Gym)",0,"Ganzkörper mit Gewichten – locker nach OP-Pause.",null),
    s("w01-fr","Fr","10. Apr","bike","Rennrad locker",0,"45–60 min lockeres Radfahren ODER Easy 7 km.","sehr locker"),
    s("w01-sa","Sa","11. Apr","easy","Easy Run",10,"Lockerer Dauerlauf.","5:20–5:30/km"),
    s("w01-so","So","12. Apr","long","Langer Lauf",14,"Erster Long Run – sehr gemütlich, kein Tempo!","5:30–5:50/km"),
  ]},
  {wn:2,phase:"MINI",label:"Mini-Prep Woche 2",dates:"13.–19. April 2026",km:45,
   focus:"Basis aufbauen + erste Strides für Speed-Impuls",
   s:[
    s("w02-mo","Mo","13. Apr","easy","Easy Run",6,"Lockerer Erholungslauf.","5:30–5:50/km"),
    s("w02-di","Di","14. Apr","easy","Easy + 6× Strides",8,"8 km easy, dann 6×80m Strides (locker-schnell, 60s Pause).","5:20/km + Strides"),
    s("w02-mi","Mi","15. Apr","easy","Easy Run",10,"Lockerer Dauerlauf. Fundament legen.","5:15–5:30/km"),
    s("w02-do","Do","16. Apr","strength","Krafttraining (Gym)",0,"Ganzkörper – etwas mehr Intensität als Woche 1.",null),
    s("w02-fr","Fr","17. Apr","bike","Rennrad 60 min",0,"Aktive Regeneration auf dem Rad.","locker ~65% HFmax"),
    s("w02-sa","Sa","18. Apr","easy","Easy Run",12,"Progressiv: erst locker, letzte 2 km etwas flotter.","5:15–5:30/km"),
    s("w02-so","So","19. Apr","long","Langer Lauf → Vorbereitung done!",17,"🚀 Letzter Lauf der Mini-Prep. Easy & genussvoll!","5:20–5:40/km"),
  ]},
  // ── BASE ───────────────────────────────────────
  {wn:3,phase:"BASE",label:"Basisaufbau W1",dates:"20.–26. April 2026",km:50,
   focus:"Erste Qualitätseinheit – aerobes System stärken (pyramidal ~80/15/5)",
   s:[
    s("w03-mo","Mo","20. Apr","rest","Ruhetag – START HAUPTPREP",0,"Erholung. Ab heute beginnt die echte Vorbereitung!",null),
    s("w03-di","Di","21. Apr","easy","Easy Run",10,"Lockerer Dauerlauf als Unterbau für Wochenmitte.","5:10–5:25/km"),
    s("w03-mi","Mi","22. Apr","interval","Intervall: 6×1000m",13,"2km WU · 6×1000m @ 4:20/km (90s Trottpause) · 2km CD.","4:20/km"),
    s("w03-do","Do","23. Apr","easy","Easy Run",10,"Lockere Regeneration nach Intervallen.","5:15–5:30/km"),
    s("w03-fr","Fr","24. Apr","strength","Krafttraining (Gym)",0,"Ganzkörper mit Gewichten.",null),
    s("w03-sa","Sa","25. Apr","bike","Rennrad 60 min",0,"Aktive Erholung auf dem Rad.","locker"),
    s("w03-so","So","26. Apr","long","Long Run 22 km",22,"Gleichmäßig aerob. Nicht zu schnell starten!","5:15–5:25/km"),
  ]},
  {wn:4,phase:"BASE",label:"Basisaufbau W2",dates:"27. Apr – 3. Mai 2026",km:55,
   focus:"Schwellenarbeit + erstes MP-Feeling im Long Run",
   s:[
    s("w04-mo","Mo","27. Apr","rest","Ruhetag",0,"Regeneration.",null),
    s("w04-di","Di","28. Apr","easy","Easy + Strides",10,"10 km easy + 6×80m Strides.","5:10–5:20/km"),
    s("w04-mi","Mi","29. Apr","tempo","Tempodauerlauf 14 km",14,"2km WU · 8km @ 4:08–4:12/km (Schwelle) · 2km easy · 2km CD.","4:08–4:12/km"),
    s("w04-do","Do","30. Apr","easy","Easy Run",10,"Lockere Erholung nach Tempo.","5:15–5:30/km"),
    s("w04-fr","Fr","1. Mai","strength","Krafttraining (Gym)",0,"Ganzkörper.",null),
    s("w04-sa","Sa","2. Mai","easy","Easy Run",12,"Lockerer Lauf vor dem langen Sonntag.","5:15–5:25/km"),
    s("w04-so","So","3. Mai","long","Long Run 23 km mit MP",23,"17km easy → letzte 6km @ 4:10/km. Erstes MP-Feeling!","5:15/km → letzte 6: 4:10/km"),
  ]},
  {wn:5,phase:"BASE",label:"Basisaufbau W3",dates:"4.–10. Mai 2026",km:60,
   focus:"Längere Intervalle – VO2max-Reiz setzen",
   s:[
    s("w05-mo","Mo","4. Mai","rest","Ruhetag",0,"Regeneration.",null),
    s("w05-di","Di","5. Mai","interval","Intervall: 5×2000m",16,"2km WU · 5×2000m @ 4:10/km (2min Pause) · 2km CD.","4:10/km"),
    s("w05-mi","Mi","6. Mai","easy","Easy Run",12,"Lockerer Dauerlauf.","5:10–5:25/km"),
    s("w05-do","Do","7. Mai","bike","Rennrad 75 min",0,"Aerobes Training ohne Laufbelastung.","locker ~65% HFmax"),
    s("w05-fr","Fr","8. Mai","strength","Krafttraining (Gym)",0,"Ganzkörper.",null),
    s("w05-sa","Sa","9. Mai","easy","Easy Run",12,"Locker. Fokus auf Lauftechnik.","5:10–5:20/km"),
    s("w05-so","So","10. Mai","long","Long Run 24 km",24,"Gleichmäßig easy – keine Tempoarbeit heute.","5:15–5:25/km"),
  ]},
  {wn:6,phase:"BASE",label:"Erholungswoche 1 ⬇️",dates:"11.–17. Mai 2026",km:45,
   focus:"⬇️ Entlastungswoche – Adaptationen festigen, Körper erholen",
   s:[
    s("w06-mo","Mo","11. Mai","rest","Ruhetag",0,"Vollständige Erholung.",null),
    s("w06-di","Di","12. Mai","easy","Easy Run",8,"Kurzer, lockerer Lauf. Kein Druck.","5:20–5:35/km"),
    s("w06-mi","Mi","13. Mai","easy","Easy + Strides",10,"10km easy + 6×80m Strides.","5:15–5:25/km"),
    s("w06-do","Do","14. Mai","strength","Krafttraining (Gym)",0,"Moderate Intensität.",null),
    s("w06-fr","Fr","15. Mai","bike","Rennrad 60 min",0,"Lockere Radeinheit – aktive Regeneration.","sehr locker"),
    s("w06-sa","Sa","16. Mai","easy","Easy Run",10,"Kurzer, lockerer Lauf.","5:15–5:30/km"),
    s("w06-so","So","17. Mai","long","Long Run 18 km",18,"Kürzerer Long Run – leicht & entspannt.","5:20–5:30/km"),
  ]},
  {wn:7,phase:"BASE",label:"Basisaufbau W5",dates:"18.–24. Mai 2026",km:62,
   focus:"Doppelte Qualität: Intervall + Long Run mit MP-Anteil",
   s:[
    s("w07-mo","Mo","18. Mai","rest","Ruhetag",0,"Regeneration.",null),
    s("w07-di","Di","19. Mai","interval","Intervall: 8×1000m",14,"2km WU · 8×1000m @ 4:10/km (90s Pause) · 2km CD.","4:10/km"),
    s("w07-mi","Mi","20. Mai","easy","Easy Run",12,"Lockerer Dauerlauf.","5:10–5:25/km"),
    s("w07-do","Do","21. Mai","easy","Easy Run",10,"Locker erholen.","5:15–5:25/km"),
    s("w07-fr","Fr","22. Mai","strength","Krafttraining (Gym)",0,"Ganzkörper.",null),
    s("w07-sa","Sa","23. Mai","tempo","Tempodauerlauf 16 km",16,"2km WU · 10km @ 4:05/km · 2km easy · 2km CD.","4:05/km"),
    s("w07-so","So","24. Mai","long","Long Run 24 km mit MP",24,"16km easy → letzte 8km @ 4:15/km. Kraft + Tempo!","5:15 → letzte 8km: 4:15/km"),
  ]},
  // ── DEV ────────────────────────────────────────
  {wn:8,phase:"DEV",label:"Entwicklung W1",dates:"25.–31. Mai 2026",km:65,
   focus:"Längere Intervalle + 26km Long Run – erste große Marke",
   s:[
    s("w08-mo","Mo","25. Mai","rest","Ruhetag",0,"Regeneration.",null),
    s("w08-di","Di","26. Mai","interval","Intervall: 6×1200m",14,"2km WU · 6×1200m @ 4:05/km (90s Pause) · 2km CD.","4:05/km"),
    s("w08-mi","Mi","27. Mai","easy","Easy Run",13,"Lockerer Dauerlauf.","5:10–5:20/km"),
    s("w08-do","Do","28. Mai","bike","Rennrad 75 min",0,"Lockere Radeinheit – Beine schonen.","locker"),
    s("w08-fr","Fr","29. Mai","strength","Krafttraining (Gym)",0,"Ganzkörper.",null),
    s("w08-sa","Sa","30. Mai","easy","Easy Run",13,"Lockerer Lauf.","5:10–5:20/km"),
    s("w08-so","So","31. Mai","long","Long Run 26 km 🎉",26,"Erste 26er-Marke! Gleichmäßig easy.","5:10–5:20/km"),
  ]},
  {wn:9,phase:"DEV",label:"Entwicklung W2",dates:"1.–7. Juni 2026",km:68,
   focus:"Langer Schwellenlauf 16km + 27km Long Run",
   s:[
    s("w09-mo","Mo","1. Jun","rest","Ruhetag",0,"Regeneration.",null),
    s("w09-di","Di","2. Jun","tempo","Tempodauerlauf 16 km",16,"2km WU · 12km @ 4:05/km · 2km CD. Langer Schwellenlauf!","4:05/km"),
    s("w09-mi","Mi","3. Jun","easy","Easy Run",13,"Lockerer Dauerlauf.","5:10–5:20/km"),
    s("w09-do","Do","4. Jun","easy","Easy Run",12,"Locker regenerieren.","5:15–5:25/km"),
    s("w09-fr","Fr","5. Jun","strength","Krafttraining (Gym)",0,"Ganzkörper.",null),
    s("w09-sa","Sa","6. Jun","bike","Rennrad 75 min",0,"Aktive Erholung auf dem Rad.","locker"),
    s("w09-so","So","7. Jun","long","Long Run 27 km",27,"Gleichmäßig easy. Aerobe Kraft aufbauen.","5:10–5:20/km"),
  ]},
  {wn:10,phase:"DEV",label:"Entwicklung W3",dates:"8.–14. Juni 2026",km:72,
   focus:"VO2max-Intervalle + erster 28km mit MP-Block",
   s:[
    s("w10-mo","Mo","8. Jun","rest","Ruhetag",0,"Regeneration.",null),
    s("w10-di","Di","9. Jun","interval","Intervall: 4×3000m",16,"2km WU · 4×3000m @ 4:00/km (3min Pause) · 2km CD.","4:00/km"),
    s("w10-mi","Mi","10. Jun","easy","Easy Run",13,"Lockerer Dauerlauf.","5:10–5:20/km"),
    s("w10-do","Do","11. Jun","bike","Rennrad 90 min",0,"Längere Radeinheit – aerobes Training ohne Laufstress.","locker-moderat"),
    s("w10-fr","Fr","12. Jun","strength","Krafttraining (Gym)",0,"Ganzkörper.",null),
    s("w10-sa","Sa","13. Jun","easy","Easy Run",13,"Lockerer Lauf.","5:10–5:20/km"),
    s("w10-so","So","14. Jun","long","Long Run 28 km mit MP 💪",28,"20km easy → letzte 8km @ 4:10/km. Erste spezifische Einheit!","5:10 → letzte 8km: 4:10/km"),
  ]},
  {wn:11,phase:"DEV",label:"Erholungswoche 2 ⬇️",dates:"15.–21. Juni 2026",km:55,
   focus:"⬇️ Entlastungswoche – Kraft sammeln für Peak-Phase",
   s:[
    s("w11-mo","Mo","15. Jun","rest","Ruhetag",0,"Regeneration.",null),
    s("w11-di","Di","16. Jun","easy","Easy Run",10,"Lockerer Lauf.","5:15–5:30/km"),
    s("w11-mi","Mi","17. Jun","interval","Kurze Intervalle: 6×800m",12,"2km WU · 6×800m @ 3:52/km (90s Pause) · 2km CD. Schnell & frisch!","3:52/km"),
    s("w11-do","Do","18. Jun","strength","Krafttraining (Gym)",0,"Gewichtstraining.",null),
    s("w11-fr","Fr","19. Jun","bike","Rennrad 60 min",0,"Lockere Radeinheit.","locker"),
    s("w11-sa","Sa","20. Jun","easy","Easy Run",12,"Lockerer Lauf.","5:15–5:25/km"),
    s("w11-so","So","21. Jun","long","Long Run 20 km",20,"Kürzerer Long Run – entspannt & genussvoll.","5:15–5:25/km"),
  ]},
  {wn:12,phase:"DEV",label:"Entwicklung W5",dates:"22.–28. Juni 2026",km:74,
   focus:"Schwellentempo + 28km mit progressivem MP-Segment",
   s:[
    s("w12-mo","Mo","22. Jun","rest","Ruhetag",0,"Regeneration.",null),
    s("w12-di","Di","23. Jun","interval","Intervall: 5×2000m",16,"2km WU · 5×2000m @ 4:00/km (2min Pause) · 2km CD.","4:00/km"),
    s("w12-mi","Mi","24. Jun","easy","Easy Run",13,"Lockerer Dauerlauf.","5:10–5:20/km"),
    s("w12-do","Do","25. Jun","easy","Easy Run",13,"Lockere Erholung.","5:15–5:25/km"),
    s("w12-fr","Fr","26. Jun","strength","Krafttraining (Gym)",0,"Ganzkörper.",null),
    s("w12-sa","Sa","27. Jun","tempo","Tempodauerlauf 16 km",16,"2km WU · 12km @ 4:02/km · 2km CD.","4:02/km"),
    s("w12-so","So","28. Jun","long","Long Run 28 km mit MP",28,"20km easy → letzte 8km @ 4:08/km. Progressiver Long Run!","5:10 → letzte 8: 4:08/km"),
  ]},
  {wn:13,phase:"DEV",label:"Entwicklung W6",dates:"29. Jun – 5. Jul 2026",km:78,
   focus:"Langer Schwellenlauf 18km + 28km mit großem MP-Block",
   s:[
    s("w13-mo","Mo","29. Jun","rest","Ruhetag",0,"Regeneration.",null),
    s("w13-di","Di","30. Jun","tempo","Tempodauerlauf 18 km",18,"2km WU · 14km @ 4:00/km · 2km CD. Langer Schwellenlauf!","4:00/km"),
    s("w13-mi","Mi","1. Jul","easy","Easy Run",14,"Lockerer Dauerlauf.","5:10–5:20/km"),
    s("w13-do","Do","2. Jul","bike","Rennrad 90 min",0,"Lockere-moderate Radeinheit.","locker-moderat"),
    s("w13-fr","Fr","3. Jul","strength","Krafttraining (Gym)",0,"Ganzkörper.",null),
    s("w13-sa","Sa","4. Jul","easy","Easy Run",13,"Lockerer Lauf.","5:10–5:20/km"),
    s("w13-so","So","5. Jul","long","Long Run 28 km – großer MP-Block 💥",28,"18km easy → letzte 10km @ 4:05/km. Starkes MP-Feeling!","5:10 → letzte 10: 4:05/km"),
  ]},
  // ── BUILD/PEAK ─────────────────────────────────
  {wn:14,phase:"BUILD",label:"Aufbau W1",dates:"6.–12. Juli 2026",km:80,
   focus:"Erste 80km-Woche 🔥 – polarisierter Trainingsansatz beginnt",
   s:[
    s("w14-mo","Mo","6. Jul","rest","Ruhetag",0,"Regeneration.",null),
    s("w14-di","Di","7. Jul","interval","Intervall: 6×1600m",16,"2km WU · 6×1600m @ 3:55/km (2min Pause) · 2km CD.","3:55/km"),
    s("w14-mi","Mi","8. Jul","easy","Easy Run",14,"Lockerer Dauerlauf.","5:10–5:20/km"),
    s("w14-do","Do","9. Jul","easy","Easy Run",13,"Lockere Erholung.","5:10–5:25/km"),
    s("w14-fr","Fr","10. Jul","strength","Krafttraining (Gym)",0,"Ganzkörper.",null),
    s("w14-sa","Sa","11. Jul","easy","Easy Run",13,"Lockerer Lauf.","5:10–5:20/km"),
    s("w14-so","So","12. Jul","long","Long Run 30 km 🎉",30,"ERSTE 30er-MARKE! Gleichmäßig easy – große Leistung!","5:10–5:20/km"),
  ]},
  {wn:15,phase:"BUILD",label:"Aufbau W2",dates:"13.–19. Juli 2026",km:83,
   focus:"Schwellentempo + 30km mit starkem MP-Block",
   s:[
    s("w15-mo","Mo","13. Jul","rest","Ruhetag",0,"Regeneration.",null),
    s("w15-di","Di","14. Jul","tempo","Tempodauerlauf 18 km",18,"2km WU · 14km @ 3:58/km · 2km CD.","3:58/km"),
    s("w15-mi","Mi","15. Jul","easy","Easy Run",14,"Lockerer Dauerlauf.","5:10–5:20/km"),
    s("w15-do","Do","16. Jul","bike","Rennrad 90 min",0,"Moderate Radeinheit – aktive Erholung.","locker-moderat"),
    s("w15-fr","Fr","17. Jul","strength","Krafttraining (Gym)",0,"Ganzkörper.",null),
    s("w15-sa","Sa","18. Jul","easy","Easy Run",14,"Lockerer Lauf.","5:10–5:20/km"),
    s("w15-so","So","19. Jul","long","Long Run 30 km mit MP-Block 💥",30,"18km easy → letzte 12km @ 4:05/km. Schlüsseleinheit!","5:10 → letzte 12: 4:05/km"),
  ]},
  {wn:16,phase:"BUILD",label:"Erholungswoche 3 ⬇️",dates:"20.–26. Juli 2026",km:63,
   focus:"⬇️ Entlastungswoche vor dem Peak – gut erholen!",
   s:[
    s("w16-mo","Mo","20. Jul","rest","Ruhetag",0,"Regeneration.",null),
    s("w16-di","Di","21. Jul","interval","Kurze Intervalle: 6×800m",12,"2km WU · 6×800m @ 3:45/km (2min Pause) · 2km CD. Schnell & frisch!","3:45/km"),
    s("w16-mi","Mi","22. Jul","easy","Easy Run",12,"Lockerer Dauerlauf.","5:15–5:25/km"),
    s("w16-do","Do","23. Jul","strength","Krafttraining (Gym)",0,"Gewichtstraining.",null),
    s("w16-fr","Fr","24. Jul","bike","Rennrad 75 min",0,"Lockere Radeinheit.","locker"),
    s("w16-sa","Sa","25. Jul","easy","Easy Run",12,"Lockerer Lauf.","5:15–5:25/km"),
    s("w16-so","So","26. Jul","long","Long Run 24 km",24,"Kürzerer Long Run – locker & erholt.","5:15–5:25/km"),
  ]},
  {wn:17,phase:"BUILD",label:"Aufbau W4",dates:"27. Jul – 2. Aug 2026",km:86,
   focus:"Doppelte Qualität: 3×5000m + Schwelle + riesiger Long Run",
   s:[
    s("w17-mo","Mo","27. Jul","rest","Ruhetag",0,"Regeneration.",null),
    s("w17-di","Di","28. Jul","interval","Intervall: 3×5000m 🔥",18,"2km WU · 3×5000m @ 3:58/km (3min Pause) · 2km CD. Härteste Intervalleinheit!","3:58/km"),
    s("w17-mi","Mi","29. Jul","easy","Easy Run",14,"Lockerer Dauerlauf.","5:10–5:20/km"),
    s("w17-do","Do","30. Jul","bike","Rennrad 90 min",0,"Moderate Radeinheit.","locker-moderat"),
    s("w17-fr","Fr","31. Jul","strength","Krafttraining (Gym)",0,"Ganzkörper.",null),
    s("w17-sa","Sa","1. Aug","tempo","Tempodauerlauf 18 km",18,"2km WU · 14km @ 3:58/km · 2km CD.","3:58/km"),
    s("w17-so","So","2. Aug","long","Long Run 32 km mit MP-Block 🏔️",32,"20km easy → letzte 12km @ 4:05/km. Eine der wichtigsten Einheiten!","5:10 → letzte 12: 4:05/km"),
  ]},
  {wn:18,phase:"BUILD",label:"🔥 PEAK-WOCHE",dates:"3.–9. August 2026",km:90,
   focus:"🔥 PEAK-WOCHE – Höchste Kilometerzahl der Saison! Du schaffst das!",
   s:[
    s("w18-mo","Mo","3. Aug","rest","Ruhetag",0,"Regeneration nach Sa/So. Sehr wichtig!",null),
    s("w18-di","Di","4. Aug","tempo","Tempodauerlauf 20 km 🔥",20,"2km WU · 16km @ 3:58/km · 2km CD. Langer, harter Schwellenlauf!","3:58/km"),
    s("w18-mi","Mi","5. Aug","easy","Easy Run",15,"Lockerer Dauerlauf.","5:10–5:20/km"),
    s("w18-do","Do","6. Aug","easy","Easy Run",14,"Lockere Erholung.","5:15–5:25/km"),
    s("w18-fr","Fr","7. Aug","strength","Krafttraining (Gym)",0,"Ganzkörper.",null),
    s("w18-sa","Sa","8. Aug","easy","Easy Run",13,"Locker – Beine für den großen Sonntag schonen.","5:15–5:25/km"),
    s("w18-so","So","9. Aug","long","Long Run 34 km 🏔️ LÄNGSTER LAUF",34,"LÄNGSTER LAUF DER SAISON! 22km easy → letzte 12km @ 4:05/km. EPIC!","5:10 → letzte 12: 4:05/km"),
  ]},
  // ── SPEC ───────────────────────────────────────
  {wn:19,phase:"SPEC",label:"Aufbau W6 – Pre-HM",dates:"10.–16. August 2026",km:72,
   focus:"Etwas ruhiger – Kräfte für Kölner HM am 30. Aug sammeln",
   s:[
    s("w19-mo","Mo","10. Aug","rest","Ruhetag",0,"Regeneration nach Peak-Woche – sehr wichtig!",null),
    s("w19-di","Di","11. Aug","interval","Intervall: 6×1200m",14,"2km WU · 6×1200m @ 3:55/km (90s Pause) · 2km CD.","3:55/km"),
    s("w19-mi","Mi","12. Aug","easy","Easy Run",13,"Lockerer Dauerlauf.","5:10–5:20/km"),
    s("w19-do","Do","13. Aug","bike","Rennrad 75 min",0,"Lockere Radeinheit.","locker"),
    s("w19-fr","Fr","14. Aug","strength","Krafttraining (Gym)",0,"Ganzkörper.",null),
    s("w19-sa","Sa","15. Aug","easy","Easy Run",13,"Lockerer Lauf.","5:10–5:20/km"),
    s("w19-so","So","16. Aug","long","Long Run 28 km easy",28,"Easy – Erholung von Peak, aber Kilometer halten.","5:15–5:25/km"),
  ]},
  {wn:20,phase:"SPEC",label:"Pre-HM Woche",dates:"17.–23. August 2026",km:60,
   focus:"Kräfte sammeln für Kölner HM – leichte Woche mit Qualität",
   s:[
    s("w20-mo","Mo","17. Aug","rest","Ruhetag",0,"Regeneration.",null),
    s("w20-di","Di","18. Aug","interval","Intervall: 6×800m",12,"2km WU · 6×800m @ 3:45/km (2min Pause) · 2km CD. Beine scharf halten!","3:45/km"),
    s("w20-mi","Mi","19. Aug","easy","Easy Run",12,"Lockerer Dauerlauf.","5:10–5:20/km"),
    s("w20-do","Do","20. Aug","easy","Easy Run",10,"Kurz und locker.","5:15–5:25/km"),
    s("w20-fr","Fr","21. Aug","strength","Krafttraining (Gym)",0,"Moderate Intensität.",null),
    s("w20-sa","Sa","22. Aug","easy","Easy Run",8,"Kurzer lockerer Lauf.","5:15–5:30/km"),
    s("w20-so","So","23. Aug","long","Long Run 22 km easy",22,"Easy – letzter großer Lauf vor dem HM.","5:20–5:30/km"),
  ]},
  {wn:21,phase:"SPEC",label:"🏁 KÖLNER HALBMARATHON",dates:"24.–30. August 2026",km:42,
   focus:"🏁 MEILENSTEIN: Kölner Halbmarathon! Ziel: ~1:23–1:25 (3:56–3:59/km)",
   s:[
    s("w21-mo","Mo","24. Aug","rest","Ruhetag",0,"Regeneration.",null),
    s("w21-di","Di","25. Aug","easy","Easy + 6× Strides",8,"Locker einlaufen, Beine aktivieren.","5:20–5:30/km + Strides"),
    s("w21-mi","Mi","26. Aug","easy","Easy Run",8,"Kurzer lockerer Lauf.","5:20–5:30/km"),
    s("w21-do","Do","27. Aug","strength","Krafttraining – sehr leicht",0,"Leichtes Krafttraining! Keinen Muskelkater riskieren!",null),
    s("w21-fr","Fr","28. Aug","easy","Easy Run",6,"Kurz & locker. Mentale Vorbereitung.","5:20–5:30/km"),
    s("w21-sa","Sa","29. Aug","easy","Easy + 4× Strides (shakeout)",5,"5km easy + 4×Strides. Früh ins Bett!","locker + Strides"),
    s("w21-so","So","30. Aug","race","🏁 KÖLNER HALBMARATHON",21.1,"MEILENSTEIN! Zeigt dir, wie gut die Prep läuft. Rennday-Feeling sammeln!","3:56–3:59/km (Ziel 1:23–1:25)"),
  ]},
  {wn:22,phase:"SPEC",label:"Erholung nach HM",dates:"31. Aug – 6. Sep 2026",km:62,
   focus:"Erholen & zurück in den Rhythmus – letzte richtige Trainingsphase",
   s:[
    s("w22-mo","Mo","31. Aug","easy","Regenerations-Lauf",8,"Sehr locker nach dem HM. Kein Druck.","5:30–5:50/km"),
    s("w22-di","Di","1. Sep","easy","Easy Run",10,"Lockerer Dauerlauf.","5:15–5:25/km"),
    s("w22-mi","Mi","2. Sep","interval","Intervall: 5×1000m",13,"2km WU · 5×1000m @ 4:00/km (90s Pause) · 2km CD. Scharf bleiben!","4:00/km"),
    s("w22-do","Do","3. Sep","easy","Easy Run",12,"Lockere Erholung.","5:10–5:20/km"),
    s("w22-fr","Fr","4. Sep","strength","Krafttraining (Gym)",0,"Letztes intensiveres Krafttraining.",null),
    s("w22-sa","Sa","5. Sep","easy","Easy Run",12,"Lockerer Lauf.","5:10–5:20/km"),
    s("w22-so","So","6. Sep","long","Long Run 24 km",24,"Letzter richtiger Long Run vor dem Taper. Easy & selbstbewusst!","5:10–5:20/km"),
  ]},
  // ── TAPER ──────────────────────────────────────
  {wn:23,phase:"TAPER",label:"Taper W1 ⬇️",dates:"7.–13. September 2026",km:55,
   focus:"⬇️ Taper beginnt – Volumen runter, Intensität BLEIBT!",
   s:[
    s("w23-mo","Mo","7. Sep","rest","Ruhetag",0,"Regeneration.",null),
    s("w23-di","Di","8. Sep","interval","Intervall: 5×1000m",13,"2km WU · 5×1000m @ 3:55/km (90s Pause) · 2km CD.","3:55/km"),
    s("w23-mi","Mi","9. Sep","easy","Easy Run",12,"Lockerer Dauerlauf.","5:10–5:20/km"),
    s("w23-do","Do","10. Sep","bike","Rennrad 60 min",0,"Lockere Radeinheit.","locker"),
    s("w23-fr","Fr","11. Sep","strength","Krafttraining – leicht",0,"Leichtes Gewichtstraining.",null),
    s("w23-sa","Sa","12. Sep","easy","Easy + Strides",10,"10km easy + 6×80m Strides.","5:15–5:25/km"),
    s("w23-so","So","13. Sep","long","Long Run 24 km mit MP",24,"16km easy → letzte 8km @ 4:01/km (MARATHON PACE!). Letzter harter Long Run.","5:15 → letzte 8: 4:01/km"),
  ]},
  {wn:24,phase:"TAPER",label:"Taper W2 ⬇️⬇️",dates:"14.–20. September 2026",km:42,
   focus:"⬇️⬇️ Volumen stark reduziert – die Form kommt jetzt!",
   s:[
    s("w24-mo","Mo","14. Sep","rest","Ruhetag",0,"Regeneration.",null),
    s("w24-di","Di","15. Sep","interval","Intervall: 4×1000m",10,"2km WU · 4×1000m @ 3:55/km (90s Pause) · 2km CD.","3:55/km"),
    s("w24-mi","Mi","16. Sep","easy","Easy Run",10,"Lockerer Lauf.","5:10–5:20/km"),
    s("w24-do","Do","17. Sep","easy","Easy Run",8,"Kurz und locker.","5:15–5:25/km"),
    s("w24-fr","Fr","18. Sep","strength","Krafttraining – sehr leicht",0,"Sehr leicht. Kein Muskelkater!",null),
    s("w24-sa","Sa","19. Sep","easy","Easy + 6× Strides",8,"8km easy + 6×80m Strides. Beine aktivieren.","5:15–5:25/km"),
    s("w24-so","So","20. Sep","long","Long Run 18 km mit MP",18,"12km easy → letzte 6km @ 4:01/km. Letzte längere Einheit!","5:15 → letzte 6: 4:01/km"),
  ]},
  {wn:25,phase:"TAPER",label:"🏆 RACE WEEK – WARSCHAU",dates:"21.–27. September 2026",km:28,
   focus:"🏆 RACE WEEK – Du hast alles gegeben. Jetzt erntest du! SUB 2:50!",
   s:[
    s("w25-mo","Mo","21. Sep","rest","Ruhetag",0,"Füße hochlegen, gut essen & trinken, relaxen.",null),
    s("w25-di","Di","22. Sep","easy","Easy + Strides",8,"8km easy + 4×80m Strides. Beine aktivieren.","5:15–5:25/km"),
    s("w25-mi","Mi","23. Sep","easy","Easy Run",6,"6km sehr locker. Nicht viel denken.","5:20–5:30/km"),
    s("w25-do","Do","24. Sep","easy","Easy + 3× MP-Strides",5,"5km easy + 3×100m @ MP. Kurz reinspüren.","5:20 + 3×MP-Strides"),
    s("w25-fr","Fr","25. Sep","rest","Ruhetag / Anreise Warschau",0,"Anreise, Expo, Startnummer. Beine schonen! Carbo-Loading!",null),
    s("w25-sa","Sa","26. Sep","easy","Shakeout: 4 km + Strides",4,"4km sehr locker + 4×80m Strides. Beine aufwecken!","locker + Strides"),
    s("w25-so","So","27. Sep","race","🏆 WARSCHAU MARATHON – SUB 2:50!",42.2,"START 🔥 Erste Hälfte: 4:04–4:05/km · Zweite Hälfte: aufdrehen! Du hast es dir verdient!","⌀ 4:01/km = 2:49:50"),
  ]},
];
const BASE_PLAN = LEGACY_EMBEDDED_PLAN_WEEKS;

const ALL_SESSIONS = LEGACY_EMBEDDED_PLAN_WEEKS.flatMap((week) => week.s);
/** Plan-Einheiten (Lauf + Rennrad-Zeilen), die mit einem Apple-Health-Workout verknüpft werden dürfen; Zielauswahl ist aktivitätsspezifisch. */
const HEALTH_LINKABLE_PLAN_SESSIONS = buildHealthLinkableSessionPool(ALL_SESSIONS);
const ACTIVE_SESSIONS = ALL_SESSIONS.filter((session) => session.type !== "rest");

/** Nur Lauf-Sessions: gleiche Menge wie Ring / Lauf-KM-Karten (kein Rad/Kraft) */
const PLAN_RUNNING_SESSIONS = ACTIVE_SESSIONS.filter(
  (session) => session.type !== "rest" && session.type !== "strength" && session.type !== "bike",
);

const LONG_RUN_SESSIONS = ACTIVE_SESSIONS.filter(
  (session) => session.type === "long" && getSessionPlannedDistanceKm(session) > 0,
);
const LONGEST_LONG_RUN_KM = LONG_RUN_SESSIONS.reduce(
  (max, session) => Math.max(max, getSessionPlannedDistanceKm(session)),
  0,
);
const FIRST_30K_ID = LONG_RUN_SESSIONS.find((session) => getSessionPlannedDistanceKm(session) >= 30)?.id;

const PHASE_ORDER = Object.keys(PI);
const VIEW_ORDER = ["home","week","performance","overview","coach","settings"];

function clampPct(value){
  return Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
}

/**
 * Zugeordnete Health-Workouts inkl. Typ (Step 6–8).
 * `type` = Log-`canonicalActivityType`, sonst Health, sonst `"unknown"`.
 * Mit `loadSelectedWorkoutForDebug([], logs)` prüfbar, ob Log ohne Health-Zeile noch trägt.
 */
function loadSelectedWorkoutForDebug(healthRunsList, logsObj) {
  const hr = healthRunsList || [];
  return Object.entries(logsObj || {})
    .map(([sessionId, log]) => {
      const ar = log?.assignedRun;
      if (!ar?.runId) return null;
      const row = hr.find((r) => r.runId === ar.runId);
      const fromHealth = row ? getStoredHealthRunCanonicalType(row) : null;
      const fromLog = ar.canonicalActivityType;
      const type = fromLog || fromHealth || "unknown";
      const typeSource =
        fromLog != null && String(fromLog).length ? "log" : fromHealth != null ? "health" : "unknown";
      return {
        sessionId,
        runId: ar.runId,
        workoutId: ar.runId,
        type,
        canonicalActivityType: fromLog,
        fromHealth,
        typeSource,
        startDate: ar.startDate,
        assignedRun: {
          runId: ar.runId,
          workoutId: ar.runId,
          distanceKm: ar.distanceKm,
          duration: ar.duration,
          canonicalActivityType: fromLog,
        },
      };
    })
    .filter(Boolean);
}

function appleHealthWorkoutKindLabel(workoutType) {
  if (!workoutType) return "Lauf";
  const c = classifyWorkoutType(String(workoutType));
  if (c === "run") {
    return workoutType === "runningTreadmill" ? "Laufen Laufband" : "Laufen";
  }
  if (c === "bike") {
    if (workoutType === "handCycling") return "Handbike";
    if (workoutType === "bikingStationary") return "Indoor Bike";
    return "Rad (Outdoor)";
  }
  return String(workoutType);
}

function planRowLabelForAssignedRun(runId, logsObj, planSessions) {
  if (!runId || !logsObj) return null;
  for (const sess of planSessions || []) {
    if (logsObj[sess.id]?.assignedRun?.runId === runId) {
      return `${sess.day}, ${sess.date} – ${sess.title}`;
    }
  }
  return null;
}

function getLoggedKm(session, log, healthById){
  if (session.type === "bike" || session.type === "strength") return 0;
  if(!isSessionLogDone(log))return 0;
  const ar = log?.assignedRun;
  if(ar && typeof ar.distanceKm === "number" && Number.isFinite(ar.distanceKm) && ar.distanceKm > 0){
    if (healthById && ar.runId) {
      const hr = healthById.get(ar.runId);
      if (hr && getStoredHealthRunCanonicalType(hr) !== "run") return 0;
    }
    return ar.distanceKm;
  }
  const parsed = parseFloat(String(log?.actualKm || "").replace(",", "."));
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  return getSessionPlannedDistanceKm(session);
}

function getSessionTypeLabel(type){
  return TI[type]?.label || "Einheit";
}

function getSessionMilestones(session, week, meta){
  const milestones = [];

  const plannedKm = getSessionPlannedDistanceKm(session);
  if(session.type === "long" && plannedKm > 28){
    milestones.push({ label: "Long Run 28+", emoji: "🏔️", color: "#38bdf8" });
  }
  if(meta?.first30kId && session.id === meta.first30kId){
    milestones.push({ label: "Erste 30 km", emoji: "🚀", color: "#f97316" });
  }
  if(meta?.longestLongRunKm != null && session.type === "long" && plannedKm === meta.longestLongRunKm && plannedKm > 0){
    milestones.push({ label: "Längster Lauf", emoji: "👑", color: "#f59e0b" });
  }
  if(session.type === "race" && plannedKm >= 42){
    milestones.push({ label: "Marathon", emoji: "🏁", color: "#ef4444" });
  }else if(session.type === "race" && plannedKm >= 21){
    milestones.push({ label: "Halbmarathon", emoji: "🎯", color: "#a855f7" });
  }
  // WARNING: week.km is legacy and may not equal sum of sessions — OK for peak-week heuristic only.
  if(week.km >= 90){
    milestones.push({ label: "Peak Woche", emoji: "🔥", color: "#10b981" });
  }

  return milestones;
}

function getSessionWhy(session, week){
  if(session.type === "long"){
    return "Diese Einheit baut die marathonrelevante Ausdauer auf, trainiert Energie-Management und macht dich mental belastbarer.";
  }
  if(session.type === "interval"){
    return "Diese Einheit schärft VO2max, Laufökonomie und Tempohärte, damit sich Marathonpace später kontrollierter anfühlt.";
  }
  if(session.type === "tempo"){
    return "Diese Einheit verschiebt deine Schwelle und macht längere schnelle Abschnitte effizienter und ruhiger.";
  }
  if(session.type === "race"){
    return getSessionPlannedDistanceKm(session) >= 42
      ? "Das ist dein Hauptziel. Hier soll die gesamte Vorbereitung zusammenlaufen."
      : "Diese Einheit ist ein Formtest unter Rennbedingungen und gibt dir Feedback für die finale Marathonphase.";
  }
  if(session.type === "strength"){
    return "Diese Einheit stabilisiert deinen Bewegungsapparat, verbessert Kraftübertragung und reduziert Verletzungsrisiko.";
  }
  if(session.type === "bike"){
    return "Diese Einheit liefert aeroben Reiz ohne zusätzliche Laufbelastung und unterstützt aktive Regeneration.";
  }
  if(week.phase === "TAPER"){
    return "Diese Einheit hält Spannung und Rhythmus hoch, ohne unnötige Müdigkeit aufzubauen.";
  }
  return "Diese Einheit sammelt saubere, kontrollierte Trainingsarbeit und unterstützt die Gesamtbelastung deiner Woche.";
}

function getCoachHint(session, week){
  if(session.type === "long"){
    return "Starte bewusst kontrolliert, achte auf Fueling und bewerte die Qualität erst in der zweiten Hälfte.";
  }
  if(session.type === "interval"){
    return "Treffe die Zielpace sauber statt aggressiv zu eröffnen. Gute Wiederholungen schlagen heroische erste Intervalle.";
  }
  if(session.type === "tempo"){
    return "Bleib rhythmisch und technisch locker. Das Ziel ist Kontrolle, nicht maximaler Kampf.";
  }
  if(session.type === "race"){
    return getSessionPlannedDistanceKm(session) >= 42
      ? "Die ersten Kilometer dürfen sich fast zu leicht anfühlen. Geduld ist hier Performance."
      : "Nutze das Rennen als Standortbestimmung und laufe mit Fokus statt mit Ego.";
  }
  if(session.type === "strength"){
    return "Saubere Ausführung vor Last. Du sollst dich danach stabiler fühlen, nicht zerstört.";
  }
  if(session.type === "bike"){
    return "Halte die Intensität wirklich locker. Ziel ist Durchblutung und Zusatzvolumen, nicht Ermüdung.";
  }
  if(week.phase === "TAPER"){
    return "Weniger machen ist jetzt oft klüger. Frische ist ein Trainingsreiz.";
  }
  return "Laufe die Einheit so, dass du morgen noch qualitativ trainieren kannst.";
}

function parseWorkoutStructure(session){
  const rawParts = (session.desc || "")
    .split("·")
    .map((part) => part.trim())
    .filter(Boolean);

  let warmup = "Locker einrollen und mobilisieren.";
  let mainSet = session.desc || "Nach Plan locker und kontrolliert absolvieren.";
  let cooldown = "Ruhig auslaufen oder aktiv regenerieren.";

  if(rawParts.length >= 3){
    warmup = rawParts[0];
    cooldown = rawParts[rawParts.length - 1];
    mainSet = rawParts.slice(1, -1).join(" · ");
  }else if(rawParts.length === 2){
    warmup = rawParts[0];
    mainSet = rawParts[1];
    cooldown = "Locker auslaufen und kurz runterfahren.";
  }else if(session.type === "interval" || session.type === "tempo"){
    warmup = "10-20 Minuten locker + Mobilität.";
    mainSet = session.desc;
    cooldown = "10-15 Minuten locker auslaufen.";
  }else if(session.type === "long"){
    warmup = "Sehr ruhig anlaufen und Puls niedrig halten.";
    mainSet = session.desc;
    cooldown = "Kurz auslaufen, trinken und Fueling direkt starten.";
  }else if(session.type === "strength"){
    warmup = "Allgemeines Warm-up + Aktivierung.";
    mainSet = session.desc;
    cooldown = "Leicht mobilisieren und Spannung lösen.";
  }else if(session.type === "bike"){
    warmup = "10 Minuten locker einrollen.";
    mainSet = session.desc;
    cooldown = "5-10 Minuten sehr locker ausfahren.";
  }

  return { warmup, mainSet, cooldown };
}

function formatLogTimestamp(value){
  if(!value)return "Noch kein Zeitstempel";
  const date = new Date(value);
  if(Number.isNaN(date.getTime()))return "Zeitpunkt unbekannt";
  return date.toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatSecondsToRaceTime(totalSeconds){
  const safeSeconds = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;
  return `${hours}:${String(minutes).padStart(2,"0")}:${String(seconds).padStart(2,"0")}`;
}

function getTrendLabel(predictedSeconds, targetSeconds){
  const diff = predictedSeconds - targetSeconds;
  if(diff <= 0)return "Richtung Sub 2:50";
  if(diff <= 120)return "Knapp an Sub 2:50 dran";
  if(diff <= 300)return "Stabil auf gutem Marathonkurs";
  return "Noch Aufbau, aber klar auf dem Weg";
}

function getWeeklyFatigue(week){
  const hardCount = week.s.filter((session) => ["interval","tempo","race"].includes(session.type)).length;
  const longestRun = week.s.reduce(
    (max, session) => Math.max(max, session.type === "long" ? getSessionPlannedDistanceKm(session) : 0),
    0,
  );
  let score = 0;
  // WARNING: week.km is legacy and may not equal sum of sessions — intentional for volume / fatigue heuristic.
  if(week.km >= 80)score += 2;
  else if(week.km >= 60)score += 1;
  if(hardCount >= 2)score += 1.5;
  else if(hardCount === 1)score += 0.75;
  if(longestRun >= 30)score += 1.5;
  else if(longestRun >= 24)score += 1;

  if(score >= 4){
    return { label: "hoch", icon: "🔴", color: "#f87171", note: "Viele Reize, Belastung aktiv managen." };
  }
  if(score >= 2.25){
    return { label: "mittel", icon: "🟡", color: "#fbbf24", note: "Solide Trainingswoche mit spürbarer Beanspruchung." };
  }
  return { label: "niedrig", icon: "🟢", color: "#34d399", note: "Kontrollierte Woche, gut für Konstanz und Erholung." };
}

function getPerformancePrediction({
  doneLongRuns,
  longRuns,
  doneHardSessions,
  hardSessions,
  avgFeeling,
  progressRatio,
  qualityLongRunScore,
  halfMarathonSignal,
  targetSeconds,
}){
  const safeTargetSeconds = targetSeconds || (2 * 3600 + 49 * 60 + 50);
  const longRunScore = longRuns > 0 ? doneLongRuns / longRuns : 0;
  const hardScore = hardSessions > 0 ? doneHardSessions / hardSessions : 0;
  const feelingScore = Math.max(0, Math.min(1, (avgFeeling - 2) / 3));
  const readiness = (longRunScore * 0.28) + (hardScore * 0.24) + (feelingScore * 0.14) + (progressRatio * 0.16) + (qualityLongRunScore * 0.1) + (halfMarathonSignal * 0.08);
  const penalty = (1 - readiness) * 360;
  const predictedSeconds = safeTargetSeconds + penalty;

  return {
    predictedSeconds,
    predictedTime: formatSecondsToRaceTime(predictedSeconds),
    trend: getTrendLabel(predictedSeconds, safeTargetSeconds),
    confidence: readiness >= 0.8 ? "hoch" : readiness >= 0.6 ? "mittel" : "früh im Block",
  };
}

function getFuelingHints(session){
  if(session.type === "long" && getSessionPlannedDistanceKm(session) >= 28){
    return [
      "Vorher 2-3 Stunden vorher kohlenhydratreich essen und 500-700 ml trinken.",
      "Im Lauf ab ca. Minute 30 starten und dann alle 25-30 Minuten ein Gel oder Carbs zuführen.",
      "Nachher in den ersten 30 Minuten Carbs plus Protein einplanen und zügig rehydrieren.",
    ];
  }
  if(session.type === "long"){
    return [
      "Vorher leicht verdauliche Carbs einbauen, besonders wenn die Einheit morgens startet.",
      "Bei Läufen ab 90 Minuten Wasser mitnehmen und Carbs früh testen.",
      "Nachher trinken und eine Regenerationsmahlzeit innerhalb von 60 Minuten anpeilen.",
    ];
  }
  if(session.type === "race" && getSessionPlannedDistanceKm(session) >= 42){
    return [
      "Carb-Loading am Vortag ruhig und verteilt halten, nicht experimentieren.",
      "Im Rennen idealerweise alle 25-30 Minuten Kohlenhydrate zuführen und an jeder Station kurz trinken.",
      "Koffein nur so einsetzen, wie du es im Training getestet hast.",
    ];
  }
  if(session.type === "race" && getSessionPlannedDistanceKm(session) >= 21){
    return [
      "Vor dem Start Frühstück 2-3 Stunden vorher und kurz vor dem Rennen optional ein Gel.",
      "Während des Halbmarathons je nach Dauer 1-2 Gels plus regelmäßige kleine Schlucke trinken.",
      "Nach dem Rennen direkt Carbs, Flüssigkeit und etwas Protein nachlegen.",
    ];
  }
  return [];
}

function getSessionStatus(log){
  if(log?.skipped)return "skipped";
  if(isSessionLogDone(log))return "done";
  return "open";
}

function getSessionStatusLabel(log){
  const status = getSessionStatus(log);
  if(status === "done")return "Erledigt";
  if(status === "skipped")return "Ausgelassen";
  return "Offen";
}

function getSessionStatusTone(log, typeColor){
  const status = getSessionStatus(log);
  if(status === "done"){
    return { background: "rgba(16,185,129,0.16)", color: "#86efac", border: "rgba(16,185,129,0.28)" };
  }
  if(status === "skipped"){
    return { background: "rgba(248,113,113,0.14)", color: "#fca5a5", border: "rgba(248,113,113,0.24)" };
  }
  return { background: `${typeColor}22`, color: typeColor, border: `${typeColor}33` };
}

function getHeroTitle(session){
  if(!session){
    return "Ruhetag";
  }
  const title = typeof session.title === "string" && session.title.trim() ? session.title : "Training";
  const display = getDisplayPlannedDistanceKm(session);
  if(display != null && display > 0 && !title.toLowerCase().includes("km")){
    return `${formatKm(display).toFixed(1)} km ${title}`;
  }
  return title;
}

/** Matches `TI` training-type colors (Home hero dot, badges, etc.). */
function getSessionTypeAccentColor(type){
  if(!type)return "#64748b";
  const meta = TI[type];
  return meta?.col ?? "#64748b";
}

/** Linker Tabbar-Shortcut: gleiche Lauf-Session wie Home-Held (`homeRunSession`). */
function getHomeTabLabel(session, isPreStart){
  if(isPreStart)return "START";
  if(!session)return "HOME";
  if(session.type === "bike")return TI.bike?.emoji ?? "🚴";
  if(session.type === "strength")return TI.strength?.emoji ?? "💪";
  const display = getDisplayPlannedDistanceKm(session);
  if(display != null && display > 0)return String(Math.round(display));
  if(session.type === "race")return TI.race?.emoji ?? "🏁";
  return "HOME";
}

function MetricCard({ label, value, sublabel, accent }){
  return (
    <div style={{background:"rgba(13,16,33,0.86)",border:"1px solid rgba(148,163,184,0.12)",borderRadius:18,padding:14,minWidth:0,boxShadow:"0 14px 34px rgba(2,6,23,0.22)"}}>
      <div style={{fontSize:11,textTransform:"uppercase",letterSpacing:"0.08em",color:"#7c8aa5",marginBottom:8,fontWeight:700}}>{label}</div>
      <div style={{fontSize:24,fontWeight:800,color:accent || "#fff",lineHeight:1}}>{value}</div>
      {sublabel && <div style={{fontSize:12,color:"#94a3b8",marginTop:8,lineHeight:1.4}}>{sublabel}</div>}
    </div>
  );
}

function DetailBlock({ title, children }){
  return (
    <div style={{background:"rgba(9,11,26,0.92)",border:"1px solid rgba(148,163,184,0.12)",borderRadius:18,padding:16}}>
      <div style={{fontSize:11,textTransform:"uppercase",letterSpacing:"0.08em",color:"#7c8aa5",fontWeight:700,marginBottom:12}}>{title}</div>
      {children}
    </div>
  );
}

/** Collapsible settings card — consistent style, full-header tap target, smooth CSS transition. */
function CollapsibleSettingsCard({ title, subtitle, expanded, onToggle, children }) {
  return (
    <div
      style={{
        background: "linear-gradient(160deg,rgba(18,18,36,0.98),rgba(11,16,28,0.94))",
        borderRadius: 20,
        border: "1px solid rgba(148,163,184,0.1)",
        overflow: "hidden",
        flexShrink: 0,
      }}
    >
      <button
        type="button"
        onClick={onToggle}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "14px 16px",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          minHeight: 54,
          textAlign: "left",
          boxSizing: "border-box",
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: "#fff", lineHeight: 1.2 }}>{title}</div>
          {subtitle ? (
            <div style={{ fontSize: 11, color: "#7c8aa5", marginTop: 2, lineHeight: 1.3 }}>{subtitle}</div>
          ) : null}
        </div>
        <span
          style={{
            color: "#7dd3fc",
            fontSize: 11,
            flexShrink: 0,
            marginLeft: 10,
            transition: "transform 0.25s ease",
            display: "inline-block",
            transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
          }}
        >
          ▼
        </span>
      </button>
      <div
        style={{
          overflow: "hidden",
          maxHeight: expanded ? "3200px" : "0px",
          transition: "max-height 0.35s ease",
        }}
      >
        <div style={{ padding: "0 16px 16px", borderTop: "1px solid rgba(148,163,184,0.07)" }}>
          {children}
          <button
            type="button"
            onClick={onToggle}
            style={{
              marginTop: 16,
              background: "transparent",
              border: "none",
              color: "#64748b",
              fontSize: 11,
              fontWeight: 700,
              cursor: "pointer",
              padding: "4px 0",
              display: "block",
              width: "100%",
              textAlign: "center",
            }}
          >
            Weniger anzeigen
          </button>
        </div>
      </div>
    </div>
  );
}

/** Lokaler Kalendertag (en-CA) der Plan-Session aus training_plan_v2 — für Post-Workout-Summary / Health-Tag-Abgleich. */
function planWorkoutLocalDayKey(trainingPlanV2, sessionId) {
  const weeks = trainingPlanV2?.weeks ?? [];
  for (const week of weeks) {
    const wo = week.workouts?.find((w) => w.id === sessionId);
    if (wo?.dateIso) {
      const d = new Date(wo.dateIso);
      if (!Number.isFinite(d.getTime())) return null;
      return d.toLocaleDateString("en-CA");
    }
  }
  return null;
}

const SUB3H_TARGET_SECONDS_UI = 3 * 3600;

/** Summe geloggter Lauf-km für Mon–Son Kalenderwoche relativ zu `anchor` (`weekOffset` 0 = aktuelle). */
function sumLoggedKmCalendarWeek(plan, logs, healthById, anchorDate, weekOffset) {
  const sod = new Date(anchorDate.getFullYear(), anchorDate.getMonth(), anchorDate.getDate());
  const dow = sod.getDay();
  const mondayBack = (dow + 6) % 7;
  const thisMonday = new Date(sod);
  thisMonday.setDate(sod.getDate() - mondayBack);
  const weekStart = new Date(thisMonday);
  weekStart.setDate(thisMonday.getDate() + weekOffset * 7);
  const weekEndExclusive = new Date(weekStart);
  weekEndExclusive.setDate(weekStart.getDate() + 7);
  const startMs = weekStart.getTime();
  const endExclusiveMs = weekEndExclusive.getTime();
  let sum = 0;
  for (const week of plan || []) {
    for (const s of week.s || []) {
      if (s.type === "rest") continue;
      const dt = parseSessionDateLabel(s.date, anchorDate.getFullYear());
      if (!dt || !Number.isFinite(dt.getTime())) continue;
      const dayMs = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate()).getTime();
      if (dayMs < startMs || dayMs >= endExclusiveMs) continue;
      sum += getLoggedKm(s, logs[s.id], healthById);
    }
  }
  return Math.round(sum * 10) / 10;
}

/** Longruns letzte 28 Tage — Ø Pace + Trend (ältere vs. neuere Halbzeitfenster). */
function longRunPaceLastFourWeeksSnapshot(plan, logs, healthById, nowDate) {
  const yearGuess = nowDate.getFullYear();
  const todayYmd = berlinWallClockYmd(nowDate);
  /** @type {number[]} */
  const newHalf = [];
  /** @type {number[]} */
  const oldHalf = [];
  const LONG_MIN_KM = 14;
  for (const week of plan || []) {
    for (const s of week.s || []) {
      if (s.type !== "long") continue;
      if (!(getSessionPlannedDistanceKm(s) >= LONG_MIN_KM)) continue;
      const d = parseSessionDateLabel(s.date, yearGuess);
      if (!d || !Number.isFinite(d.getTime())) continue;
      const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(
        2,
        "0",
      )}`;
      if (ymd > todayYmd) continue;
      const span = calendarDaysBetweenYmd(ymd, todayYmd);
      if (!Number.isFinite(span) || span < 0 || span > 27) continue;
      const log = logs[s.id];
      if (!log || !isSessionLogDone(log)) continue;
      const stored = log?.assignedRun?.runId ? healthById.get(log.assignedRun.runId) : null;
      if (!stored || !storedHealthRunIsRunning(stored)) continue;
      const norm = normalizeAppleHealthRun(stored);
      if (!norm || !isRunWorkout(norm) || !(norm.distanceKm >= 0.05) || !(norm.paceMinPerKm > 0)) continue;
      const paceSecPerKm = norm.paceMinPerKm * 60;
      if (!Number.isFinite(paceSecPerKm)) continue;
      (span <= 13 ? newHalf : oldHalf).push(paceSecPerKm);
    }
  }
  const all = [...newHalf, ...oldHalf];
  const avg =
    all.length > 0 ? all.reduce((a, b) => a + b, 0) / all.length : null;
  let trend = "→";
  if (oldHalf.length > 0 && newHalf.length > 0) {
    const mn = newHalf.reduce((a, b) => a + b, 0) / newHalf.length;
    const mo = oldHalf.reduce((a, b) => a + b, 0) / oldHalf.length;
    if (mn < mo - 2) trend = "↑";
    else if (mn > mo + 2) trend = "↓";
    else trend = "→";
  }
  return { avgSecPerKm: avg, trend, count: all.length };
}

function recoveryPrepWordDe(score0_100) {
  if (score0_100 == null || !Number.isFinite(score0_100)) return "mittel";
  if (score0_100 < 40) return "schlecht";
  if (score0_100 < 67) return "mittel";
  return "gut";
}

function marathonLogRecordsDiffSyncKeys(prev, next) {
  const keys = new Set([...Object.keys(prev || {}), ...Object.keys(next || {})]);
  const changed = [];
  for (const k of keys) {
    if (JSON.stringify((prev || {})[k] ?? {}) !== JSON.stringify((next || {})[k] ?? {})) {
      changed.push(k);
    }
  }
  return changed;
}

export default function AppMain(){
  const { user, signOut } = useAuth();
  const [accountDeleteStep, setAccountDeleteStep] = useState<0 | 1 | 2>(0);
  const [accountDeleteBusy, setAccountDeleteBusy] = useState(false);
  const [accountDeleteError, setAccountDeleteError] = useState<string | null>(null);
  beginAppFrame();
  // const appFrameMs = getAppNowEpochMs(); // unused (removed)
  const [wIdx,setWIdx]=useState(() => resolveCurrentPlanWeekIndex(BASE_PLAN, getAppNow()));
  const [logs, setLogs] = useState(() =>
    hydrateMarathonLogsFromStorage(readStoredJson(MARATHON_LOGS_KEY, {})),
  );
  const logsRef = useRef(logs);
  logsRef.current = logs;
  const [aiPlanPatches, setAiPlanPatches] = useState(() => readStoredJson(MARATHON_AI_PLAN_PATCHES_KEY, []));
  const baseWeekMetaByStartIso = useMemo(() => buildWeekMetaMapFromBasePlan(BASE_PLAN), []);
  const [hasUserTrainingPlan, setHasUserTrainingPlan] = useState(() => {
    const raw = readStoredJson(TRAINING_PLAN_V2_STORAGE_KEY, null);
    const prefs = readStoredJson(MARATHON_PREFERENCES_KEY, {});
    return isUserTrainingPlan(raw, prefs);
  });
  const [trainingPlanV2, setTrainingPlanV2] = useState(() => {
    const raw = readStoredJson(TRAINING_PLAN_V2_STORAGE_KEY, null);
    if (raw && validateTrainingPlanV2Integrity(raw)) return raw;
    const built = buildTrainingPlanV2FromBasePlan(BASE_PLAN);
    return built;
  });

  const weekPhaseMap = useMemo(() => {
    const map = new Map();
    const v2Weeks = trainingPlanV2?.weeks ?? [];
    const useV2Meta = v2Weeks.length > 0 && v2Weeks.some((wk) => typeof wk?.meta?.phase === "string" && !!wk.meta.phase);
    if (useV2Meta) {
      for (let i = 0; i < v2Weeks.length; i += 1) {
        const w = v2Weeks[i];
        const weekStartIso = w.startIso;
        const planPhase = String(w?.meta?.phase || "").toUpperCase();
        const label = String(w?.meta?.label || "");
        let phase: TrainingPhase = "base";
        if (planPhase === "TAPER") phase = "taper";
        else if (label.toLowerCase().includes("peak") || label.includes("🔥")) phase = "peak";
        else if (planPhase === "BUILD" || planPhase === "SPEC" || planPhase === "DEV") phase = "build";
        else phase = "base";
        map.set(weekStartIso, { weekStartIso, phase });
      }
      return map;
    }

    const entries = Array.from(baseWeekMetaByStartIso.entries());
    for (let i = 0; i < entries.length; i += 1) {
      const weekStartIso = entries[i][0];
      const meta = entries[i][1];
      const planPhase = String(meta?.phase || "").toUpperCase();
      const label = String(meta?.label || "");
      let phase: TrainingPhase = "base";
      if (planPhase === "TAPER") phase = "taper";
      else if (label.toLowerCase().includes("peak") || label.includes("🔥")) phase = "peak";
      else if (planPhase === "BUILD" || planPhase === "SPEC" || planPhase === "DEV") phase = "build";
      else phase = "base";
      map.set(weekStartIso, { weekStartIso, phase });
    }
    return map;
  }, [baseWeekMetaByStartIso, trainingPlanV2]);
  const [modal,setModal]=useState(null);
  const [form,setForm]=useState({feeling:0,actualKm:"",notes:"",done:false,skipped:false});
  const [view,setView]=useState(DEFAULT_VIEW);
  /** Übersicht „Alle Wochen“: pro Trainingsphase ein-/ausklappbar */
  const [overviewPhaseExpandedByKey, setOverviewPhaseExpandedByKey] = useState(() => ({}));
  const [aiNavHint,setAiNavHint]=useState(null);
  const [allTrainingPlans, setAllTrainingPlans] = useState<TrainingPlanListItem[]>([]);
  const [onboardingForNewPlan, setOnboardingForNewPlan] = useState(false);
  const [settingsCards, setSettingsCards] = useState({
    einstellungen: false,
    trainingPlans: false,
    teilen: false,
    appleHealth: false,
    raceCalc: false,
    backup: false,
  });
  const toggleSettingsCard = (key) => setSettingsCards(prev => ({ ...prev, [key]: !prev[key] }));
  const [aiChatMessages, setAiChatMessages] = useAiCoachChatMessagesState();
  const [preferences,setPreferences]=useState(() => readStoredJson(MARATHON_PREFERENCES_KEY, {}));
  const preferencesRef = useRef(preferences);
  preferencesRef.current = preferences;
  const [prefsRemoteReady, setPrefsRemoteReady] = useState(false);
  const [logsRemoteReady, setLogsRemoteReady] = useState(false);
  const pendingLogSyncRef = useRef(new Set<string>());
  const [planRemoteReady, setPlanRemoteReady] = useState(false);
  const [healthRemoteReady, setHealthRemoteReady] = useState(false);
  const healthRemoteReadyRef = useRef(false);
  const userIdForHealthSyncRef = useRef(undefined);
  healthRemoteReadyRef.current = healthRemoteReady;
  userIdForHealthSyncRef.current = user?.id;

  const onRecoveryDailyMergedRef = useRef((_next, _incoming) => {});
  onRecoveryDailyMergedRef.current = (next, incoming) => {
    const uid = userIdForHealthSyncRef.current;
    if (!uid || !healthRemoteReadyRef.current) return;
    for (const inc of incoming) {
      const merged = next.find((r) => r.date === inc.date);
      if (merged) void saveRecoveryDay(uid, merged);
    }
  };

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    setPrefsRemoteReady(false);
    void loadProfile(user.id)
      .then((remote) => {
        if (cancelled || remote == null) return;
        if (skipRemotePrefsHydrationRef.current) {
          skipRemotePrefsHydrationRef.current = false;
          return;
        }
        setPreferences((prev) => {
          const merged = { ...prev, ...remote };
          if (
            (remote.maxHeartRateBpm == null || !Number.isFinite(Number(remote.maxHeartRateBpm))) &&
            prev.maxHeartRateBpm != null &&
            Number.isFinite(Number(prev.maxHeartRateBpm))
          ) {
            merged.maxHeartRateBpm = prev.maxHeartRateBpm;
          }
          if (prev.onboardingComplete === true || remote.onboardingComplete === true) {
            merged.onboardingComplete = true;
          }
          return merged;
        });
      })
      .finally(() => {
        if (!cancelled) setPrefsRemoteReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    setLogsRemoteReady(false);
    void loadSessionLogs(user.id)
      .then((remote) => {
        if (cancelled || remote == null) return;
        setLogs((prev) => ({ ...prev, ...remote }));
      })
      .finally(() => {
        if (!cancelled) setLogsRemoteReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    setPlanRemoteReady(false);
    void Promise.all([
      loadTrainingPlan(user.id),
      loadPlanPatches(user.id),
      loadAllTrainingPlans(user.id),
    ])
      .then(([remotePlan, remotePatches, remotePlanList]) => {
        if (cancelled) return;
        setAllTrainingPlans(remotePlanList);
        if (skipRemotePlanHydrationRef.current) {
          skipRemotePlanHydrationRef.current = false;
        } else if (remotePlan != null && isUserTrainingPlan(remotePlan, preferences)) {
          setHasUserTrainingPlan(true);
          setTrainingPlanV2(remotePlan);
        }
        if (skipRemotePatchesHydrationRef.current) {
          skipRemotePatchesHydrationRef.current = false;
        } else if (remotePatches != null) {
          setAiPlanPatches(remotePatches);
        }
      })
      .finally(() => {
        if (!cancelled) setPlanRemoteReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id || !prefsRemoteReady) return;
    void saveProfile(user.id, preferences);
  }, [user?.id, prefsRemoteReady, preferences]);

  const [coachMemoryReady, setCoachMemoryReady] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    setCoachMemoryReady(false);
    void loadCoachMemory(user.id)
      .then((remote) => {
        if (cancelled || remote == null) return;
        setCoachMemory(remote);
      })
      .finally(() => {
        if (!cancelled) setCoachMemoryReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  useLayoutEffect(() => {
    configureCoachMemoryRemoteSync({
      userId: user?.id ?? null,
      ready: coachMemoryReady,
    });
  }, [user?.id, coachMemoryReady]);

  const [shareFeedback,setShareFeedback]=useState("");
  const [viewMotionDir,setViewMotionDir]=useState(0);
  /** Home: „Vorbereitungs Einschätzung“ — Details standardmäßig eingeklappt */
  const [homeCoachAssessmentExpanded, setHomeCoachAssessmentExpanded] = useState(false);
  /** Layout: Viewport-Budget — kompaktere Abstände + Auto-Collapse Sekundärinfos */
  const [homeViewportTight, setHomeViewportTight] = useState(false);
  const homeMainColumnRef = useRef(null);
  const homeUpperRef = useRef(null);
  const homeTailRef = useRef(null);
  const weekSessionStackRef = useRef(null);
  const prevHomeViewportTightRef = useRef(false);
  /** Session-Modal: Trainingsziele (Details unter „Mehr anzeigen“) */
  const [modalPlanTargetsExpanded, setModalPlanTargetsExpanded] = useState(false);
  /** Leistung: Recovery-Verlauf — Kurzerklärung ein-/ausklappbar */
  /** Woche-Tab: Beschreibungstext (`session.desc`) pro Einheit ein-/ausklappbar */
  const [weekTabDescExpandedById, setWeekTabDescExpandedById] = useState(() => ({}));
  /** Einstellungen: Apple-Health-Laufliste ein-/ausklappen */
  const [settingsAppleHealthRunsExpanded, setSettingsAppleHealthRunsExpanded] = useState(false);
  const [healthRuns, setHealthRuns] = useState(() =>
    loadHealthRunsFromStorage((key) => safeReadLocalStorageItem(key), safeParseJSON),
  );
  const healthRunsRef = useRef(healthRuns);
  healthRunsRef.current = healthRuns;
  const [recoveryDailyRows, setRecoveryDailyRows] = useState(() =>
    loadRecoveryDailyFromStorage((key) => safeReadLocalStorageItem(key), safeParseJSON),
  );

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    setHealthRemoteReady(false);
    void Promise.all([loadHealthWorkouts(user.id), loadRecoveryDaily(user.id)])
      .then(([remoteRuns, remoteRecovery]) => {
        if (cancelled) return;
        if (remoteRuns != null) setHealthRuns(remoteRuns);
        if (remoteRecovery != null) setRecoveryDailyRows(remoteRecovery);
      })
      .finally(() => {
        if (!cancelled) setHealthRemoteReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const localMigrationAttemptedRef = useRef(false);
  const skipRemotePlanHydrationRef = useRef(false);
  const skipRemotePatchesHydrationRef = useRef(false);
  const skipRemotePrefsHydrationRef = useRef(false);

  useEffect(() => {
    if (!user?.id || !prefsRemoteReady || !logsRemoteReady || !planRemoteReady || !healthRemoteReady) return;
    if (localMigrationAttemptedRef.current) return;
    localMigrationAttemptedRef.current = true;

    let cancelled = false;
    void migrateLocalDataToSupabase(user.id).then((uploadedAny) => {
      if (cancelled || !uploadedAny) return;
      void Promise.all([
        loadHealthWorkouts(user.id),
        loadRecoveryDaily(user.id),
        loadPlanPatches(user.id),
        loadSessionLogs(user.id),
        loadTrainingPlan(user.id),
      ]).then(([remoteRuns, remoteRecovery, remotePatches, remoteLogs, remotePlan]) => {
        if (cancelled) return;
        if (remoteRuns?.length) setHealthRuns(remoteRuns);
        if (remoteRecovery?.length) setRecoveryDailyRows(remoteRecovery);
        if (skipRemotePatchesHydrationRef.current) {
          skipRemotePatchesHydrationRef.current = false;
        } else if (remotePatches?.length) {
          setAiPlanPatches(remotePatches);
        }
        if (remoteLogs && Object.keys(remoteLogs).length > 0) {
          setLogs((prev) => ({ ...prev, ...remoteLogs }));
        }
        if (skipRemotePlanHydrationRef.current) {
          skipRemotePlanHydrationRef.current = false;
        } else if (remotePlan != null && isUserTrainingPlan(remotePlan, preferences)) {
          setHasUserTrainingPlan(true);
          setTrainingPlanV2(remotePlan);
        }
      });
    });

    return () => {
      cancelled = true;
    };
  }, [user?.id, prefsRemoteReady, logsRemoteReady, planRemoteReady, healthRemoteReady]);

  const healthRunById = useMemo(() => {
    const m = new Map();
    for (const r of healthRuns) {
      if (r?.runId) m.set(r.runId, r);
    }
    return m;
  }, [healthRuns]);

  useEffect(() => {
    setModalPlanTargetsExpanded(false);
  }, [modal?.id]);

  const appleHealthRunsLinkedCount = useMemo(() => {
    const assigned = new Set();
    for (const log of Object.values(logs)) {
      const rid = log?.assignedRun?.runId;
      if (rid) assigned.add(rid);
    }
    return healthRuns.filter((r) => r?.runId && assigned.has(r.runId)).length;
  }, [healthRuns, logs]);
  const [healthRunsFetchBusy, setHealthRunsFetchBusy] = useState(false);
  const [healthAppleConnectBusy, setHealthAppleConnectBusy] = useState(false);
  const [appleHealthConnectFeedback, setAppleHealthConnectFeedback] = useState(null);
  const [appleHealthLoadFeedback, setAppleHealthLoadFeedback] = useState(null);
  const [isHealthConnected, setIsHealthConnected] = useState(
    () => typeof localStorage !== "undefined" && localStorage.getItem(APPLE_HEALTH_CONNECTED_KEY) === "1",
  );
  /** "unknown" = not yet checked, "granted"/"denied" = result, "unavailable" = HealthKit not available */
  const [sleepPermission, setSleepPermission] = useState<PermissionState>("unknown");
  const [hrvPermission, setHrvPermission] = useState<PermissionState>("unknown");
  const [rhrPermission, setRhrPermission] = useState<PermissionState>("unknown");
  /** null = not checked yet (iOS only) */
  const [healthKitAvailable, setHealthKitAvailable] = useState(null);
  /** Nach jedem Workout-Query: Roh-Total aus HealthKit, Lauf/Rad-Zähler, übernommene (synced). */
  const [appleHealthFetchStats, setAppleHealthFetchStats] = useState(null);
  /** Apple Health: welches Workout (runId) hat die Plan-Einheiten-Auswahl geöffnet (Lauf & Rad). */
  const [healthSessionPickWorkoutId, setHealthSessionPickWorkoutId] = useState(null);
  /** Derived recovery/load hint from recent runs (updated when logs or plan patches change). */
  const [trainingLoadRec, setTrainingLoadRec] = useState(() =>
    buildTrainingLoadFallbackRecommendation(getAppTodayYmd()),
  );
  const swipeStartRef = useRef(null);
  const recoveryScrollRef = useRef(null);
  const lastSwipeAtRef = useRef(0);

  useEffect(() => {
    if (!VIEW_ORDER.includes(view)) {
      setView(DEFAULT_VIEW);
    }
  }, [view]);

  useAppCorePersistenceEffects({
    logs,
    preferences,
    aiPlanPatches,
    trainingPlanV2,
    healthRuns,
    recoveryDailyRows,
  });

  useEffect(() => {
    setWeekTabDescExpandedById({});
  }, [wIdx]);

  const fetchRunningWorkoutsLast7Days = async (options?: { forceLastThreeCalendarDays?: boolean }) => {
    logHealthKit("Lade Aktivitäten", options);
    try {
      const { stats, incomingStoredRuns, missingCyclingDistance } = options?.forceLastThreeCalendarDays
        ? await healthKitForceRefreshWorkoutsLast3Days()
        : await healthKitFetchRunningWorkoutsLast7Days();
      setHealthRuns((prev) => {
        const next = mergeHealthRuns(prev, incomingStoredRuns);
        const canonicalList = next.map((w) => classifyWorkoutType(String(w.workoutType || "")));
        if (stats.cyclingCount > 0 && !canonicalList.includes("bike")) {
          // ignore (diagnostic only)
        }
        const uid = userIdForHealthSyncRef.current;
        if (uid && healthRemoteReadyRef.current) {
          for (const inc of incomingStoredRuns) {
            if (!inc?.runId || typeof inc.runId !== "string" || !inc.runId.trim()) continue;
            const merged = next.find((r) => r.runId === inc.runId);
            if (merged) void saveHealthWorkout(uid, merged);
          }
        }
        return next;
      });
      setAppleHealthFetchStats({
        fetchedTotal: stats.fetchedTotal,
        syncedTotal: stats.syncedTotal,
        runningCount: stats.runningCount,
        cyclingCount: stats.cyclingCount,
        ignoredCount: stats.ignoredCount,
        unknownDistanceCount: stats.unknownDistanceCount,
        missingCyclingDistance: !!missingCyclingDistance,
      });
      logHealthKit(
        "Aktivitäten-Zähler (HealthKit) — geladen:",
        stats.fetchedTotal,
        "running:",
        stats.runningCount,
        "cycling:",
        stats.cyclingCount,
        "synced:",
        stats.syncedTotal,
      );
      return stats.syncedTotal;
    } catch (e) {
      setAppleHealthFetchStats({
        fetchedTotal: 0,
        syncedTotal: 0,
        runningCount: 0,
        cyclingCount: 0,
        ignoredCount: 0,
        unknownDistanceCount: 0,
        missingCyclingDistance: false,
      });
      return 0;
    }
  };

  useIosHealthKitBootstrap({
    appleHealthConnectedStorageKey: APPLE_HEALTH_CONNECTED_KEY,
    setHealthKitAvailable,
    setSleepPermission,
    setHrvPermission,
    setRhrPermission,
    setIsHealthConnected,
    setRecoveryDailyRows,
    onRecoveryDailyMerged: (next, incoming) => {
      onRecoveryDailyMergedRef.current(next, incoming);
    },
    fetchRunningWorkoutsLast7Days,
  });

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let lastFetchTime = 0;
    const DEBOUNCE_MS = 30_000;
    const listenerPromise = CapacitorApp.addListener("appStateChange", ({ isActive }) => {
      if (!isActive) return;
      const now = getAppNowEpochMs();
      if (now - lastFetchTime < DEBOUNCE_MS) return;
      lastFetchTime = now;
      void fetchRunningWorkoutsLast7Days();
    });
    return () => {
      listenerPromise.then((l) => l.remove());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetchRunningWorkoutsLast7Days stable ref from mount
  }, []);

  const handleAppleHealthConnectInSettings = async () => {
    if (Capacitor.getPlatform() !== "ios") return;
    setAppleHealthConnectFeedback(null);
    setHealthAppleConnectBusy(true);
    try {
      const availabilityOk = await healthKitIsAvailable();
      if (!availabilityOk) {
        setAppleHealthConnectFeedback({
          tone: "err",
          text: "Apple Health ist auf diesem Gerät nicht verfügbar.",
        });
        return;
      }
      logHealthKit("Requesting authorization", APPLE_HEALTH_READ_TYPES);
      await healthKitRequestReadAuthorization();
      logHealthKit("Permission granted");
      localStorage.setItem(APPLE_HEALTH_CONNECTED_KEY, "1");
      setIsHealthConnected(true);
      // Wait for HealthKit state to settle (iOS caches grants briefly after dialog).
      await new Promise<void>((resolve) => setTimeout(resolve, 750));
      let grantedSleep: PermissionState = "unknown";
      let grantedHrv:   PermissionState = "unknown";
      let grantedRhr:   PermissionState = "unknown";
      try {
        const [sleepOk, hrvOk, rhrOk] = await Promise.all([
          appleHealthCheckPermission("sleep"),
          appleHealthCheckPermission("heartRateVariability"),
          appleHealthCheckPermission("restingHeartRate"),
        ]);
        grantedSleep = sleepOk === true ? "granted" : sleepOk === false ? "denied" : sleepOk === null ? "unavailable" : "unknown";
        grantedHrv   = hrvOk   === true ? "granted" : hrvOk   === false ? "denied" : hrvOk   === null ? "unavailable" : "unknown";
        grantedRhr   = rhrOk   === true ? "granted" : rhrOk   === false ? "denied" : rhrOk   === null ? "unavailable" : "unknown";
        setSleepPermission(grantedSleep);
        setHrvPermission(grantedHrv);
        setRhrPermission(grantedRhr);
      } catch {
        // best-effort
      }

      // Re-fetch recovery data now that permissions are freshly granted.
      // Single 500ms retry if HealthKit returns empty immediately (iOS bridge race after grant).
      try {
        const recoveryIncoming = await healthKitFetchRecoveryDailyLast120Days();
        const count = recoveryIncoming.length;
        if (count > 0) {
          setRecoveryDailyRows((prev) => {
            const next = mergeRecoveryDailyPersisted(prev, recoveryIncoming);
            const uid = userIdForHealthSyncRef.current;
            if (uid && healthRemoteReadyRef.current) {
              for (const inc of recoveryIncoming) {
                const merged = next.find((r) => r.date === inc.date);
                if (merged) void saveRecoveryDay(uid, merged);
              }
            }
            return next;
          });
        }
        const sFetch = recoveryIncoming.filter((r) => typeof r.sleepHours === "number" && r.sleepHours > 0);
        const hFetch = recoveryIncoming.filter((r) => typeof r.hrvMs === "number" && r.hrvMs > 0);
        const rFetch = recoveryIncoming.filter((r) => typeof r.restingHr === "number" && r.restingHr > 0);
        // eslint-disable-next-line no-console
        console.log("[RECOVERY_PIPELINE][hydration]", {
          retryUsed: false, justGranted: true, resultCount: count,
          rowsWithSleep: sFetch.length, rowsWithHRV: hFetch.length, rowsWithRHR: rFetch.length,
          hrvDaysUsed: hFetch.length, rhrDaysUsed: rFetch.length,
          sleepPermission: grantedSleep, hrvPermission: grantedHrv, rhrPermission: grantedRhr,
        });
        if (count === 0) {
          // Single retry only — no loop
          setTimeout(async () => {
            try {
              const retry = await healthKitFetchRecoveryDailyLast120Days();
              if (retry.length > 0) {
                setRecoveryDailyRows((prev) => {
                  const next = mergeRecoveryDailyPersisted(prev, retry);
                  const uid = userIdForHealthSyncRef.current;
                  if (uid && healthRemoteReadyRef.current) {
                    for (const inc of retry) {
                      const merged = next.find((r) => r.date === inc.date);
                      if (merged) void saveRecoveryDay(uid, merged);
                    }
                  }
                  return next;
                });
              }
              const rS = retry.filter((r) => typeof r.sleepHours === "number" && r.sleepHours > 0);
              const rH = retry.filter((r) => typeof r.hrvMs === "number" && r.hrvMs > 0);
              const rR = retry.filter((r) => typeof r.restingHr === "number" && r.restingHr > 0);
              // eslint-disable-next-line no-console
              console.log("[RECOVERY_PIPELINE][hydration]", {
                retryUsed: true, justGranted: true, resultCount: retry.length,
                rowsWithSleep: rS.length, rowsWithHRV: rH.length, rowsWithRHR: rR.length,
                hrvDaysUsed: rH.length, rhrDaysUsed: rR.length,
                sleepPermission: grantedSleep, hrvPermission: grantedHrv, rhrPermission: grantedRhr,
              });
            } catch {
              // ignore (single best-effort retry only)
            }
          }, 500);
        }
      } catch {
        // ignore — recovery hydration is best-effort after connect
      }

      setAppleHealthConnectFeedback({
        tone: "ok",
        text: "Apple Health ist verbunden.",
      });
      try {
        await fetchRunningWorkoutsLast7Days();
      } catch (fetchErr) {
        setAppleHealthLoadFeedback({
          tone: "err",
          text: "Aktivitäten konnten nicht geladen werden. Bitte „Aktivitäten aktualisieren“ nutzen.",
        });
      }
    } catch (err) {
      setAppleHealthConnectFeedback({
        tone: "err",
        text: "Apple Health konnte nicht verbunden werden. Bitte in iOS Health-Zugriff prüfen.",
      });
    } finally {
      setHealthAppleConnectBusy(false);
    }
  };

  /** Lädt Lauf- und Rad-Workouts — öffnet keine Berechtigungsmaske. Optional: nur letzte 3 Kalendertage (frische Pagination). */
  const reloadHealthRunsFromApple = async (options?: { forceLastThreeCalendarDays?: boolean }) => {
    if (Capacitor.getPlatform() !== "ios") return;
    setAppleHealthLoadFeedback(null);
    setHealthRunsFetchBusy(true);
    try {
      const availabilityOk = await healthKitIsAvailable();
      if (!availabilityOk) {
        setAppleHealthLoadFeedback({
          tone: "err",
          text: "Apple Health ist nicht verfügbar.",
        });
        return;
      }
      try {
        await fetchRunningWorkoutsLast7Days(options);
      } catch (err) {
        setAppleHealthLoadFeedback({
          tone: "err",
          text: "Bitte zuerst Apple-Health-Zugriff erlauben (Workouts, Distanz, Rad-Distanz, Puls, Aktivenergie).",
        });
        return;
      }
      setAppleHealthLoadFeedback({
        tone: "ok",
        text: options?.forceLastThreeCalendarDays ? "Aktivitäten aktualisiert (3 Tage neu geladen)." : "Aktivitäten aktualisiert.",
      });
    } catch (err) {
      setAppleHealthLoadFeedback({
        tone: "err",
        text: "Bitte zuerst Apple-Health-Zugriff erlauben (Workouts, Distanz, Rad-Distanz, Puls, Aktivenergie).",
      });
    } finally {
      setHealthRunsFetchBusy(false);
    }
  };

  useEffect(()=>{
    (async()=>{
      try{
        const r=await readRemoteStorage("mwaw26-logs");
        if(r)setLogs(safeParseJSON(r.value, {}));
      }catch{
        // Startup should never block rendering if remote storage is unavailable.
      }
    })();
  },[]);

  const save = async (newLogs, syncSessionIds) => {
    setLogs(newLogs);
    await writeRemoteStorage("mwaw26-logs", JSON.stringify(newLogs));
    if (!user?.id || !syncSessionIds?.length) return;
    if (!logsRemoteReady) {
      for (const sid of syncSessionIds) {
        pendingLogSyncRef.current.add(sid);
      }
      return;
    }
    for (const sid of syncSessionIds) {
      const entry = newLogs[sid];
      if (!entry || typeof entry !== "object") continue;
      await saveSessionLog(user.id, sid, entry);
      pendingLogSyncRef.current.delete(sid);
    }
  };

  useEffect(() => {
    if (!user?.id || !logsRemoteReady) return;
    const pending = [...pendingLogSyncRef.current];
    if (pending.length === 0) return;
    pendingLogSyncRef.current.clear();
    const uid = user.id;
    void (async () => {
      const snapshot = logsRef.current;
      for (const sid of pending) {
        const entry = snapshot[sid];
        if (!entry || typeof entry !== "object") continue;
        await saveSessionLog(uid, sid, entry);
      }
    })();
  }, [user?.id, logsRemoteReady]);

  const handleBackupLogsImport = useCallback(
    (imported) => {
      setLogs(imported);
      if (!user?.id || !logsRemoteReady) return;
      for (const sid of Object.keys(imported)) {
        const entry = imported[sid];
        if (!entry || typeof entry !== "object") continue;
        void saveSessionLog(user.id, sid, entry);
      }
    },
    [user?.id, logsRemoteReady],
  );

  useEffect(() => {
    if (typeof window === "undefined" || process.env.NODE_ENV !== "development") return;
    window.__DEV_FORCE_CARD = (workoutId) => {
      if (typeof workoutId !== "string" || !workoutId.trim()) return;
      const id = workoutId.trim();
      writeMigrationFlags({ ...readMigrationFlags(), forcePostWorkoutCardForWorkoutId: id });
      // eslint-disable-next-line no-console
      console.info("[dev] Reload Home: PostWorkoutSummary opens once for workoutId:", id);
    };
    return () => {
      try {
        delete window.__DEV_FORCE_CARD;
      } catch {
        // ignore
      }
    };
  }, []);

  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    const ids = (healthRuns || []).map((w) => w?.runId).filter(Boolean);
    if (ids.length) {
      // eslint-disable-next-line no-console
      console.log("[dev] Stored Health workout IDs (healthRuns[].runId):", ids);
    }
  }, [healthRuns]);

  /** Generische Zuordnung: `workout` aus `healthRuns` → Log mit `workoutId` + `canonicalActivityType` (Lauf & Rennrad). */
  const assignHealthRunToSession = async (session, workout) => {
    const arPayload = buildAssignedRunFromWorkout(workout);
    storedHealthRunToWorkout(workout);
    // no console logging in production path
    const nextLogs = { ...logs };
    const syncSessionIds = [];
    for (const sid of Object.keys(nextLogs)) {
      if (sid === session.id) continue;
      const lg = nextLogs[sid];
      if (lg?.assignedRun?.runId === workout.runId) {
        syncSessionIds.push(sid);
        const copy = { ...lg };
        delete copy.assignedRun;
        nextLogs[sid] = copy;
      }
    }
    const existing = nextLogs[session.id] || {};
    nextLogs[session.id] = {
      ...existing,
      suggestedHealthRunId: undefined,
      assignedRun: arPayload,
    };
    syncSessionIds.push(session.id);
    // no console logging in production path
    await save(nextLogs, syncSessionIds);
  };

  const clearHealthRunAssignmentByRunId = async (runId) => {
    if (!runId) return;
    const nextLogs = { ...logs };
    let touched = false;
    const syncSessionIds = [];
    for (const sid of Object.keys(nextLogs)) {
      if (nextLogs[sid]?.assignedRun?.runId !== runId) continue;
      const copy = { ...nextLogs[sid] };
      delete copy.assignedRun;
      nextLogs[sid] = copy;
      syncSessionIds.push(sid);
      touched = true;
    }
    if (touched) await save(nextLogs, syncSessionIds);
  };

  const clearHealthRunAssignment = async (session) => {
    if (!session) return;
    const existing = logs[session.id] || {};
    const next = { ...existing };
    delete next.assignedRun;
    await save(
      {
        ...logs,
        [session.id]: next,
      },
      [session.id],
    );
  };

  const quickCompleteSession=async(session)=>{
    const existing = logs[session.id] || {};
    await save({
      ...logs,
      [session.id]: {
        ...existing,
        done: !existing.done,
        skipped: false,
        at: getAppNow().toISOString(),
      }
    }, [session.id]);
  };

  const quickSkipSession=async(session)=>{
    const existing = logs[session.id] || {};
    await save({
      ...logs,
      [session.id]: {
        ...existing,
        done: false,
        skipped: !existing.skipped,
        at: getAppNow().toISOString(),
      }
    }, [session.id]);
  };

  const copyShareSummary=async()=>{
    try{
      await navigator.clipboard?.writeText?.(shareSummary);
      setShareFeedback("Zusammenfassung kopiert");
      setTimeout(()=>setShareFeedback(""), 1800);
    }catch{
      setShareFeedback("Kopieren nicht verfügbar");
      setTimeout(()=>setShareFeedback(""), 1800);
    }
  };

  const openModal=(session)=>{
    const ex=logs[session.id]||{};
    setForm({feeling:ex.feeling||0,actualKm:ex.actualKm||"",notes:ex.notes||"",done:ex.done||false,skipped:ex.skipped||false});
    setModal(session);
  };

  const closeModal=()=>setModal(null);

  const navigateToView = (nextView, forcedDirection = null)=>{
    const currentView = VIEW_ORDER.includes(view) ? view : DEFAULT_VIEW;
    if(nextView === currentView)return;
    const currentIndex = VIEW_ORDER.indexOf(currentView);
    const nextIndex = VIEW_ORDER.indexOf(nextView);
    const direction = forcedDirection ?? (nextIndex > currentIndex ? 1 : -1);
    setViewMotionDir(direction);
    setView(nextView);
  };

  const stepView = (direction)=>{
    const currentView = VIEW_ORDER.includes(view) ? view : DEFAULT_VIEW;
    const currentIndex = VIEW_ORDER.indexOf(currentView);
    if(currentIndex < 0)return;
    const nextIndex = Math.max(0, Math.min(VIEW_ORDER.length - 1, currentIndex + direction));
    if(nextIndex !== currentIndex){
      navigateToView(VIEW_ORDER[nextIndex], direction);
    }
  };

  const triggerSwipe = (direction)=>{
    if(modal)return;
    const now = getAppNowEpochMs();
    if(now - lastSwipeAtRef.current < 420)return;
    lastSwipeAtRef.current = now;
    stepView(direction);
  };

  const handleTouchStart = (event)=>{
    if(modal)return;
    const touch = event.touches?.[0];
    if(!touch)return;
    const t = event.target;
    if(recoveryScrollRef.current && t instanceof Node && recoveryScrollRef.current.contains(t))return;
    swipeStartRef.current = { x: touch.clientX, y: touch.clientY };
  };

  const handleTouchEnd = (event)=>{
    if(modal || !swipeStartRef.current)return;
    const touch = event.changedTouches?.[0];
    if(!touch){
      swipeStartRef.current = null;
      return;
    }
    const t = event.target;
    if(recoveryScrollRef.current && t instanceof Node && recoveryScrollRef.current.contains(t)){
      swipeStartRef.current = null;
      return;
    }
    const deltaX = touch.clientX - swipeStartRef.current.x;
    const deltaY = touch.clientY - swipeStartRef.current.y;
    swipeStartRef.current = null;
    if(Math.abs(deltaX) < 56 || Math.abs(deltaX) <= Math.abs(deltaY))return;
    triggerSwipe(deltaX < 0 ? 1 : -1);
  };

  const handleWheel = (event)=>{
    if(modal)return;
    const el = event.target;
    if(el instanceof Node && recoveryScrollRef.current?.contains(el))return;
    const tagName = event.target?.tagName;
    if(tagName === "INPUT" || tagName === "TEXTAREA")return;
    if(Math.abs(event.deltaX) < 40 || Math.abs(event.deltaX) <= Math.abs(event.deltaY))return;
    triggerSwipe(event.deltaX > 0 ? 1 : -1);
  };

  const saveModal=async()=>{
    if(!modal)return;
    const prev = logs[modal.id] || {};
    await save({...logs,[modal.id]:{...prev,...form,at:getAppNow().toISOString()}}, [modal.id]);
    setModal(null);
  };

  const displayPlan = useDisplayPlanFromTrainingState(trainingPlanV2, aiPlanPatches);
  const ALL_SESSIONS = displayPlan.flatMap((week) => week.s);
  const ACTIVE_SESSIONS = ALL_SESSIONS.filter((session) => session.type !== "rest");
  const DISPLAY_PLAN_RUNNING_SESSIONS = ACTIVE_SESSIONS.filter(
    (session) => session.type !== "strength" && session.type !== "bike",
  );
  const activeSessionsRef = useRef(ACTIVE_SESSIONS);
  activeSessionsRef.current = ACTIVE_SESSIONS;

  useEffect(() => {
    if (typeof localStorage === "undefined") return;
    if (readMigrationFlags().intervalV2Backfill) return;

    let cancelled = false;

    void (async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
      if (cancelled) return;
      try {
        const result = await backfillIntervalWorkoutScores({
          healthRuns: healthRunsRef.current,
          planSessions: activeSessionsRef.current,
          logs: logsRef.current,
          maxHeartRateBpm: preferencesRef.current?.maxHeartRateBpm,
        });
        if (cancelled) return;
        if (result.mutated) {
          const prevRuns = healthRunsRef.current;
          const nextRuns = result.healthRuns;
          setHealthRuns(nextRuns);
          const uid = userIdForHealthSyncRef.current;
          if (uid && healthRemoteReadyRef.current) {
            for (const r of nextRuns) {
              const p = prevRuns.find((x) => x.runId === r.runId);
              if (!p || JSON.stringify(p) !== JSON.stringify(r)) {
                void saveHealthWorkout(uid, r);
              }
            }
          }
        }
        if (result.mutatedSessionLogs && Object.keys(result.mutatedSessionLogs).length > 0) {
          const sparse = result.mutatedSessionLogs;
          const nextLogs = { ...logsRef.current };
          for (const sid of Object.keys(sparse)) {
            nextLogs[sid] = { ...(nextLogs[sid] || {}), ...(sparse[sid] as object) };
          }
          await save(nextLogs, Object.keys(sparse));
        }
        writeMigrationFlags({ ...readMigrationFlags(), intervalV2Backfill: true });
        if (process.env.NODE_ENV === "development") {
          console.log(
            `Interval backfill complete: ${result.rescored} re-scored, ${result.skippedNoSegments} skipped (no segment data), ${result.unchanged} unchanged`,
          );
        }
      } catch (e) {
        if (process.env.NODE_ENV === "development") {
          console.warn("[interval_v2 backfill] failed", e);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const LONG_RUN_SESSIONS = ACTIVE_SESSIONS.filter(
    (session) => session.type === "long" && getSessionPlannedDistanceKm(session) > 0,
  );
  const longestLongRunKm = LONG_RUN_SESSIONS.reduce(
    (max, session) => Math.max(max, getSessionPlannedDistanceKm(session)),
    0,
  );
  const first30kId = LONG_RUN_SESSIONS.find((session) => getSessionPlannedDistanceKm(session) >= 30)?.id || null;
  const milestoneMeta = useMemo(
    () => ({ longestLongRunKm, first30kId }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [longestLongRunKm, first30kId],
  );
  const HEALTH_LINKABLE_PLAN_SESSIONS = useMemo(() => buildHealthLinkableSessionPool(ALL_SESSIONS), [ALL_SESSIONS]);

  useEffect(() => {
    setWIdx((prev) => {
      const max = Math.max(0, (displayPlan?.length || 1) - 1);
      return Math.max(0, Math.min(prev, max));
    });
  }, [displayPlan?.length]);

  const planAdherence = useMemo(
    () =>
      computePlanAdherenceScore({
        plan: displayPlan,
        logs,
        healthRuns,
        now: getAppNow(),
      }),
    [logs, healthRuns, displayPlan],
  );

  const {
    recoveryDomain,
    recoveryPresentation,
    sleepStatus,
    hrvStatus,
    rhrStatus,
    homeRecoverySleep7dDisplay,
    homeRecoveryHrv7dDisplay,
    homeRecoveryRhr7dDisplay,
    homeRecoveryLoad7dDisplay,
    uiRecoveryScore0_100,
    uiRecoveryScoreDisplay,
    recoveryState,
    isRecoveryHydrating,
  } = useRecoveryDomainRuntime({
    displayPlan,
    wIdx,
    logs,
    recoveryDailyRows,
    aiPlanPatches,
    trainingPlanV2,
    sleepPermission,
    hrvPermission,
    rhrPermission,
  });


  useEffect(() => {
    if (Capacitor.getPlatform() !== "ios") return;
    if (!healthRuns.length) return;
    const result = applyAppleHealthTrainingSync({
      healthRuns,
      planSessions: ACTIVE_SESSIONS,
      logs: logsRef.current,
    });
    if (!result.changed) return;
    const syncKeys = marathonLogRecordsDiffSyncKeys(logsRef.current, result.logs);
    void save(result.logs, syncKeys);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Apple-Run-Merge nur bei neuen Health-Daten
  }, [healthRuns]);

  /** TEMP: versteckter Settings-Trigger — 180d HealthKit + Training-Sync; Button danach entfernen. */
  const runDebugAppleHealth180DayBackfill = useCallback(async () => {
    if (Capacitor.getPlatform() !== "ios" || healthRunsFetchBusy) return;
    setHealthRunsFetchBusy(true);
    setAppleHealthLoadFeedback(null);
    try {
      const availabilityOk = await healthKitIsAvailable();
      if (!availabilityOk) {
        setAppleHealthLoadFeedback({
          tone: "err",
          text: "Apple Health ist nicht verfügbar.",
        });
        return;
      }
      const { stats, incomingStoredRuns, missingCyclingDistance } = await healthKitFetchWorkoutsForAppStorage({
        daysBackFromTodayMidnight: 180,
        logTag: "debug180d",
      });
      const mergedHealthRuns = mergeHealthRuns(healthRunsRef.current, incomingStoredRuns);
      setHealthRuns(mergedHealthRuns);
      const uid = userIdForHealthSyncRef.current;
      if (uid && healthRemoteReadyRef.current) {
        for (const inc of incomingStoredRuns) {
          if (!inc?.runId || typeof inc.runId !== "string" || !inc.runId.trim()) continue;
          const merged = mergedHealthRuns.find((r) => r.runId === inc.runId);
          if (merged) void saveHealthWorkout(uid, merged);
        }
      }
      setAppleHealthFetchStats({
        fetchedTotal: stats.fetchedTotal,
        syncedTotal: stats.syncedTotal,
        runningCount: stats.runningCount,
        cyclingCount: stats.cyclingCount,
        ignoredCount: stats.ignoredCount,
        unknownDistanceCount: stats.unknownDistanceCount,
        missingCyclingDistance: !!missingCyclingDistance,
      });
      const syncResult = applyAppleHealthTrainingSync({
        healthRuns: mergedHealthRuns,
        planSessions: activeSessionsRef.current,
        logs: logsRef.current,
        maxAgeDays: 180,
      });
      if (syncResult.changed) {
        const syncKeys = marathonLogRecordsDiffSyncKeys(logsRef.current, syncResult.logs);
        await save(syncResult.logs, syncKeys);
      }
      setAppleHealthLoadFeedback({
        tone: "ok",
        text: `Debug 180 Tage: ${stats.syncedTotal} Workouts übernommen, Logs ${syncResult.changed ? "aktualisiert" : "unverändert"}.`,
      });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[AppMain] debug Apple Health 180d backfill", e);
      setAppleHealthLoadFeedback({
        tone: "err",
        text: "Debug-Backfill (180 Tage) fehlgeschlagen.",
      });
    } finally {
      setHealthRunsFetchBusy(false);
    }
  }, [healthRunsFetchBusy]);

  useEffect(() => {
    const todayYmd = getAppTodayYmd();
    const next = getTrainingLoadRecommendation({ plan: displayPlan, logs, today: todayYmd });
    setTrainingLoadRec((prev) => {
      if (
        prev.status === next.status &&
        prev.basedOnDate === next.basedOnDate &&
        prev.feedback === next.feedback &&
        prev.label === next.label
      ) {
        return prev;
      }
      return next;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps -- refresh when underlying plan slices change
  }, [logs, aiPlanPatches, trainingPlanV2]);

  const handleAiApplyPlanPatches = (_message, _action, patches)=>{
    if(!patches?.length)return;

    if (_action?.type === "convert_workout_to_run") {
      const payload = _action.payload ?? {};
      const sessionId = typeof payload.sessionId === "string" ? payload.sessionId.trim() : "";
      if (sessionId) {
        const targetSessionType =
          typeof payload.targetSessionType === "string" && payload.targetSessionType.trim()
            ? payload.targetSessionType.trim()
            : "easy";
        const targetKm = Number(payload.targetKm);
        const targetPace = typeof payload.targetPace === "string" ? payload.targetPace : null;
        const targetTitle =
          typeof payload.targetTitle === "string" && payload.targetTitle.trim()
            ? payload.targetTitle.trim()
            : "Lauf";
        const targetDesc = typeof payload.targetDesc === "string" ? payload.targetDesc : null;
        const targetIntensity =
          targetSessionType === "interval" ? "high" : targetSessionType === "tempo" ? "medium" : "low";

        setTrainingPlanV2((prev) => {
          if (!prev?.workouts?.length) return prev;
          const next = applyConversionToPlan(prev, sessionId, {
            sport: "run",
            sessionType: targetSessionType,
            intensity: targetIntensity,
            km: Number.isFinite(targetKm) && targetKm > 0 ? targetKm : undefined,
            pace: targetPace,
            title: targetTitle,
            desc: targetDesc,
          });
          if (!validateTrainingPlanV2Integrity(next)) return prev;
          if (user?.id && planRemoteReady) {
            void saveTrainingPlan(user.id, next);
          }
          return next;
        });
      }
    }

    setAiPlanPatches((prev)=> mergePlanPatchLists(prev, patches));
    if (user?.id && planRemoteReady) {
      for (const p of patches) {
        if (!p || typeof p.sessionId !== "string" || !p.sessionId.trim()) continue;
        void savePlanPatch(user.id, { ...p, sessionId: p.sessionId.trim() });
      }
    }
  };

  const handleAiReplaceTrainingPlanV2 = (_message, plan, clearPatches)=>{
    if(!plan)return;
    if(!validateTrainingPlanV2Integrity(plan))return;
    if(clearPatches){
      localStorage.removeItem(MARATHON_AI_PLAN_PATCHES_KEY);
      setAiPlanPatches([]);
    }
    setTrainingPlanV2(plan);
    if (user?.id && planRemoteReady) {
      void saveTrainingPlan(user.id, plan);
    }
  };

  const handleAiNavigate = (targetScreen, section)=>{
    if(section){
      setAiNavHint({ screen: targetScreen, section });
    }
    if(targetScreen === "week"){
      const now = getAppNow();
      const todaySession = displayPlan.find((week)=>week.s.some((session)=>{
        const parsed = parseSessionDateLabel(session.date);
        if(!parsed)return false;
        const normalized = new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        return normalized.getTime() === today.getTime();
      }));
      if(todaySession){
        const idx = displayPlan.indexOf(todaySession);
        if(idx >= 0)setWIdx(idx);
      }
    }
    navigateToView(targetScreen);
  };

  const handleSwapWorkoutsV2 = (sourceId: string, targetId: string, _overrideAccepted?: boolean) => {
    if (!sourceId || !targetId || sourceId === targetId) {
      return { ok: false, message: "Ich habe nichts geändert (ungültige Auswahl)." };
    }
    const before = trainingPlanV2;
    const swapped = trySwapWorkoutDatesInPlan(before, sourceId, targetId);
    if (!swapped.ok) {
      const msg =
        swapped.reason === "missing_ids"
          ? "Ich konnte die beiden Einheiten nicht sicher finden."
          : swapped.reason === "integrity_failed"
            ? "Ich habe den Tausch abgebrochen (Integritätsprüfung fehlgeschlagen)."
            : "Ich habe nichts geändert (ungültige Auswahl).";
      return { ok: false, message: msg };
    }
    const after = swapped.after;

    const source = before.workouts.find((w) => w.id === sourceId) ?? null;
    const target = before.workouts.find((w) => w.id === targetId) ?? null;
    if (!source || !target) {
      return { ok: false, message: "Ich konnte die beiden Einheiten nicht sicher finden." };
    }

    const validationContext = buildValidationContext({
      before,
      after,
      targetWorkout: target,
      weekPhaseMap,
      planGoal: "marathon",
      recoveryScore0_100: (recoveryDomain as any)?.homeRecoveryScore0_100 ?? null,
      recoveryConfidence: (recoveryDomain as any)?.series?.length
        ? (recoveryDomain as any).series.slice(-7).reduce((a: number, p: any) => a + (p?.pointConfidence ?? 0), 0) /
          Math.max(1, (recoveryDomain as any).series.slice(-7).length)
        : undefined,
    });
    const validation = validateSwap({ source, target, before, after, weekPhaseMap, validationContext });

    const axisReasons = [
      validation.axes?.structural?.reason,
      validation.axes?.load?.reason,
      validation.axes?.recovery?.reason,
      validation.axes?.micro?.reason,
    ].filter(Boolean) as string[];
    const athleteHints = buildSwapAthleteFacingWarnings({ before, after });
    const mergedWarnings = [...athleteHints, ...(validation.status === "warn" ? axisReasons : [])];
    const warningText =
      mergedWarnings.length > 0
        ? [...new Set(mergedWarnings)].join("\n\n")
        : null;

    setTrainingPlanV2(after);
    if (user?.id && planRemoteReady) {
      void saveTrainingPlan(user.id, after);
    }
    return { ok: true, message: "Tausch übernommen.", warningText };
  };

  const buildCurrentAiContext = useCallback(
    () =>
      getAiContext({
        plan: displayPlan,
        planV2: trainingPlanV2,
        weekPhaseMap,
        logs,
        now: getAppNow(),
        targetTime: preferences.targetTime,
        maxHeartRateBpm: preferences.maxHeartRateBpm,
        healthRuns,
        availableScreens: AI_COACH_AVAILABLE_SCREENS,
        recoveryDomain,
        recoveryDailyRows,
        coachPlatform: (() => {
          const p = Capacitor.getPlatform();
          if (p === "ios" || p === "web" || p === "android") return p;
          return "unknown";
        })(),
        appleHealthConnected: isHealthConnected,
        healthKitAvailable,
      }),
    [
      displayPlan,
      trainingPlanV2,
      weekPhaseMap,
      logs,
      preferences.targetTime,
      preferences.maxHeartRateBpm,
      healthRuns,
      recoveryDomain,
      recoveryDailyRows,
      isHealthConnected,
      healthKitAvailable,
    ],
  );

  const handleAiPreferencesPatch = (update) => {
    if (!update) return;
    setPreferences((prev) => {
      const next = { ...prev };
      if (update.resetProfile) {
        next.targetTime = "";
        delete next.maxHeartRateBpm;
        return next;
      }
      if (typeof update.targetTime === "string") next.targetTime = update.targetTime;
      if (update.clearMaxHeartRate) delete next.maxHeartRateBpm;
      if (typeof update.maxHeartRateBpm === "number" && Number.isFinite(update.maxHeartRateBpm)) {
        next.maxHeartRateBpm = Math.round(update.maxHeartRateBpm);
      }
      return next;
    });
  };

  const w=displayPlan[wIdx];
  const weekHasExpandedSessionDesc = w.s.some((s) => !!weekTabDescExpandedById[s.id]);
  const ph=PI[w.phase];
  const totalSess=ACTIVE_SESSIONS.length;
  const doneSessions = ACTIVE_SESSIONS.filter((session) => isSessionLogDone(logs[session.id]));
  const doneSess=doneSessions.length;
  const totalRunTargetKm = DISPLAY_PLAN_RUNNING_SESSIONS.reduce((sum, s) => sum + getSessionPlannedDistanceKm(s), 0);
  const loggedRunKm = DISPLAY_PLAN_RUNNING_SESSIONS.reduce(
    (sum, session) => sum + getLoggedKm(session, logs[session.id], healthRunById),
    0,
  );
  const kmPct=totalRunTargetKm>0?Math.round((loggedRunKm/totalRunTargetKm)*100):0;
  const longRuns = LONG_RUN_SESSIONS.length;
  const doneLongRuns = LONG_RUN_SESSIONS.filter((session) => isSessionLogDone(logs[session.id])).length;
  const hardSessions = ACTIVE_SESSIONS.filter((session) => ["interval","tempo","race"].includes(session.type)).length;
  const doneHardSessions = ACTIVE_SESSIONS.filter((session) => ["interval","tempo","race"].includes(session.type) && isSessionLogDone(logs[session.id])).length;
  const completedSessionRatio = totalSess > 0 ? doneSess / totalSess : 0;
  const avgFeeling = doneSessions.length
    ? doneSessions.reduce((sum, session) => sum + (logs[session.id]?.feeling || 3), 0) / doneSessions.length
    : 3;
  const weeklyFatigue = getWeeklyFatigue(w);
  const qualityLongRunScore = LONG_RUN_SESSIONS.filter((session) => isSessionLogDone(logs[session.id])).length
    ? LONG_RUN_SESSIONS.filter((session) => isSessionLogDone(logs[session.id])).reduce((sum, session, _, arr) => {
      const log = logs[session.id];
      const plannedLong = getSessionPlannedDistanceKm(session);
      const actualKm = getSessionRunningActualKm(session, log, healthRunById);
      const distanceScore = plannedLong >= 28 ? Math.min(1, actualKm / plannedLong) : 0.75;
      const feelingScore = log?.feeling ? Math.max(0.45, log.feeling / 5) : 0.65;
      return sum + ((distanceScore * 0.65) + (feelingScore * 0.35)) / arr.length;
    }, 0)
    : 0.4;
  const halfMarathonRace = ACTIVE_SESSIONS.find(
    (session) =>
      session.type === "race" &&
      getSessionPlannedDistanceKm(session) >= 21 &&
      getSessionPlannedDistanceKm(session) < 42 &&
      isSessionLogDone(logs[session.id]),
  );
  const halfMarathonSignal = halfMarathonRace
    ? Math.min(
        1,
        ((logs[halfMarathonRace.id]?.feeling || 3) / 5) * 0.55 +
          (getSessionRunningActualKm(halfMarathonRace, logs[halfMarathonRace.id], healthRunById) >= 21
            ? 0.45
            : 0.2),
      )
    : 0.45;
  const raceGoalFinish = preferences.raceGoal === "finish";
  const parsedTargetTime = parseTargetTimeToSeconds(preferences.targetTime);
  const targetSeconds = raceGoalFinish
    ? null
    : parsedTargetTime || (2 * 3600 + 49 * 60 + 50);
  const targetTimeDisplay = raceGoalFinish
    ? "Ziel: Finishen"
    : parsedTargetTime
      ? preferences.targetTime
      : undefined;
  const predictionReadiness = getPredictionReadiness({
    doneSessionsCount: doneSess,
    loggedKm: loggedRunKm,
    doneLongRuns,
    doneHardSessions,
  });
  const rawPerformancePrediction = getPerformancePrediction({
    doneLongRuns,
    longRuns,
    doneHardSessions,
    hardSessions,
    avgFeeling,
    progressRatio: completedSessionRatio,
    qualityLongRunScore,
    halfMarathonSignal,
    targetSeconds,
  });
  const performancePrediction = predictionReadiness.ready
    ? rawPerformancePrediction
    : {
      predictedSeconds: null,
      predictedTime: predictionReadiness.title,
      trend: predictionReadiness.detail,
      confidence: "wartet auf Daten",
    };
  const appNow = getAppNow();
  const personalBestSeconds = useMemo(() => {
    const raw = (preferences as { personalBestTime?: string | null }).personalBestTime;
    if (raw == null || String(raw).trim() === "") return null;
    const sec = parseTargetTimeToSeconds(String(raw));
    return sec != null && Number.isFinite(sec) && sec > 0 ? sec : null;
  }, [preferences]);
  const marathonPrediction = useMemo(
    () =>
      getMarathonPrediction({
        plan: displayPlan,
        logs,
        healthRuns,
        targetSeconds,
        personalBestSeconds,
        now: appNow,
        homeRecoveryScore0_100: recoveryDomain.homeRecoveryScore0_100,
      }),
    [
      displayPlan,
      logs,
      healthRuns,
      targetSeconds,
      personalBestSeconds,
      appNow,
      recoveryDomain.homeRecoveryScore0_100,
    ],
  );
  const homeOverallPrepLines = useMemo(() => {
    const now = appNow;
    const counts = computePlanDueSessionCounts({ plan: displayPlan, logs, healthRuns, now });
    const lines = [];

    lines.push(
      `Plan & Umsetzung (fällig): ${planAdherence.score}% (${planAdherence.dueCompleted} von ${planAdherence.dueTotal} fälligen Einheiten). Gesamtvorbereitung (Ring): ${counts.completed} von ${counts.total} Einheiten erledigt.`,
    );

    const lr = longRunPaceLastFourWeeksSnapshot(displayPlan, logs, healthRunById, now);
    if (lr.avgSecPerKm != null && lr.count > 0) {
      const secRounded = Math.round(lr.avgSecPerKm);
      const mm = Math.floor(secRounded / 60);
      const ss = String(secRounded % 60).padStart(2, "0");
      lines.push(`Ø Long Run Pace letzte 4 Wochen: ${mm}:${ss}/km (Trend: ${lr.trend})`);
    }

    if (marathonPrediction.ready && marathonPrediction.predictedTime && marathonPrediction.predictedSeconds != null) {
      const timeStr = marathonPrediction.predictedTime;
      const predSec = marathonPrediction.predictedSeconds;
      let subTag;
      if (predSec < SUB3H_TARGET_SECONDS_UI) {
        const mins = Math.max(1, Math.round((SUB3H_TARGET_SECONDS_UI - predSec) / 60));
        subTag = `${mins} min unter Sub-3h`;
      } else if (predSec <= SUB3H_TARGET_SECONDS_UI + 300) {
        subTag = "knapp bei Sub-3h";
      } else {
        const mins = Math.max(1, Math.round((predSec - SUB3H_TARGET_SECONDS_UI) / 60));
        subTag = `${mins} min über Sub-3h`;
      }
      lines.push(`Aktuelle Prognose: ${timeStr} — ${subTag}`);
    } else {
      lines.push("Mehr abgeschlossene Einheiten für Zeitprognose nötig");
    }

    const volThis = sumLoggedKmCalendarWeek(displayPlan, logs, healthRunById, now, 0);
    const volLast = sumLoggedKmCalendarWeek(displayPlan, logs, healthRunById, now, -1);
    lines.push(`Wochenvolumen: ${volLast} km (letzte Woche), ${volThis} km (diese Woche)`);

    const recWord = recoveryPrepWordDe(uiRecoveryScore0_100);
    const rhrPart = homeRecoveryRhr7dDisplay ? ` (Ruhe-HF Ø ${homeRecoveryRhr7dDisplay})` : "";
    lines.push(`Erholung: ${recWord}${rhrPart}`);

    return lines;
  }, [
    appNow,
    displayPlan,
    logs,
    healthRuns,
    healthRunById,
    planAdherence.score,
    planAdherence.dueCompleted,
    planAdherence.dueTotal,
    marathonPrediction,
    uiRecoveryScore0_100,
    homeRecoveryRhr7dDisplay,
  ]);
  const consistencyStats = getConsistencyStats(displayPlan, logs, appNow);
  const coachHints = getCoachFeedback({ plan: displayPlan, logs, consistencyStats, now: appNow });
  const weekAnalysis = analyzeWeek(w, logs, appNow, healthRunById);
  const weekBoundsForHealthKpi = getPlanWeekTimeBoundsMs(w);
  const weekHealthKpi = weekBoundsForHealthKpi
    ? sumRunBikeTotalKmFromHealthInRange(healthRuns, weekBoundsForHealthKpi.startMs, weekBoundsForHealthKpi.endMs)
    : { runKm: 0, bikeKm: 0, totalKm: 0 };

  useEffect(() => {
    if (Capacitor.getPlatform() !== "ios" || (typeof process !== "undefined" && process.env?.NODE_ENV === "test")) {
      return;
    }
    logWorkoutSanityCheckDev(healthRuns);
    const b = getPlanWeekTimeBoundsMs(w);
    if (b) {
      logRunBikeTotalFromHealthDev(healthRuns, b.startMs, b.endMs);
      sumRunBikeTotalKmFromHealthInRange(healthRuns, b.startMs, b.endMs);
    }
  }, [w, healthRuns]);

  const decisionTodayNextSession = getTodayNextSession(ALL_SESSIONS, logs, appNow);
  const marathonConfidenceLabel = marathonPrediction.ready
    ? predictionReadiness.ready
      ? performancePrediction.confidence
      : "Datenbasis wächst"
    : null;
  const nextKeySession = ACTIVE_SESSIONS.find((session) => getSessionStatus(logs[session.id]) === "open" && getSessionMilestones(session, displayPlan.find((week) => week.s.some((item) => item.id === session.id)) || w, milestoneMeta).length > 0)
    || ACTIVE_SESSIONS.find((session) => getSessionStatus(logs[session.id]) === "open");
  // phaseStatus / nextKeyDate computed previously; not needed in production UI currently
  // ────────────────────────────────────────────────────────────────────────────
  const modalLog = modal ? logs[modal.id] : null;
  const modalWeek = modal ? displayPlan.find((week) => week.s.some((session) => session.id === modal.id)) : null;
  const modalMilestones = modal && modalWeek ? getSessionMilestones(modal, modalWeek, milestoneMeta) : [];
  const modalWorkout = modal ? parseWorkoutStructure(modal) : null;
  const modalFuelingHints = modal ? getFuelingHints(modal) : [];
  const todayNextSession = decisionTodayNextSession;
  const firstTrainingSession = ACTIVE_SESSIONS[0] || null;
  const firstTrainingDate = firstTrainingSession ? parseSessionDateLabel(firstTrainingSession.date) : null;
  const today = appNow;
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const firstTrainingStart = firstTrainingDate ? new Date(firstTrainingDate.getFullYear(), firstTrainingDate.getMonth(), firstTrainingDate.getDate()) : null;
  const hasCalendarStarted = !!(firstTrainingStart && todayStart >= firstTrainingStart);
  const isPreStart = isHomePreStart(logs, ACTIVE_SESSIONS);
  const blockStartLabel = firstTrainingDate
    ? firstTrainingDate.toLocaleDateString("de-DE", { day: "2-digit", month: "long", year: "numeric" })
    : "";
  const dashboardSession = todayNextSession?.session || null;
  const isRestDay = dashboardSession?.type === "rest";
  const homeRunSession = isRestDay ? null : dashboardSession;
  const prepProgressPct = computeTrainingProgressPct({
    planSessions: ACTIVE_SESSIONS,
    logs,
  });
  monitorMetricSource("progress_pct", "computeTrainingProgressPct", prepProgressPct);
  const dashboardLog = homeRunSession ? logs[homeRunSession.id] : null;
  const dashboardDone = !!(homeRunSession && isSessionLogDone(dashboardLog));
  const dashboardHealthDone = !!(dashboardLog?.assignedRun?.runId);
  const healthSuggestPending = !!(dashboardLog?.suggestedHealthRunId && !dashboardLog?.assignedRun?.runId);
  const homeTodayHeadline = useMemo(() => {
    if (isRestDay) return "Rest Day";
    if (!homeRunSession) return "Ruhetag";
    return getHeroTitle(homeRunSession);
  }, [isRestDay, homeRunSession]);
  const homeAppleHealthBadge = useMemo(() => {
    if (!homeRunSession) {
      return { label: "Kein Training geplant", tone: "muted" };
    }
    if (dashboardDone && dashboardHealthDone) {
      return { label: "Synchronisiert · Apple Health", tone: "ok" };
    }
    if (dashboardDone && !dashboardHealthDone) {
      return { label: "Erledigt (ohne Health-Lauf)", tone: "neutral" };
    }
    if (healthSuggestPending) {
      return { label: "Lauf erkannt – zuordnen", tone: "pending" };
    }
    if (dashboardHealthDone) {
      return { label: "Synchronisiert · Apple Health", tone: "ok" };
    }
    if (Capacitor.getPlatform() === "ios" && healthKitAvailable === true && !isHealthConnected) {
      return { label: "Apple Health nicht verbunden", tone: "missing" };
    }
    return { label: "Nicht synchronisiert", tone: "missing" };
  }, [
    homeRunSession,
    dashboardDone,
    dashboardHealthDone,
    healthSuggestPending,
    isHealthConnected,
    healthKitAvailable,
  ]);
  const ringRadius = 38;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const ringDashOffset = ringCircumference * (1 - (prepProgressPct / 100));

  const deferAppleHealthPreview =
    !!(dashboardLog?.assignedRun?.runId) ||
    healthSuggestPending ||
    !!(dashboardLog?.runEvaluation);

  const todayAppleCoach = useMemo(
    () =>
      buildTodayAppleCoachLines({
        platform: Capacitor.getPlatform(),
        healthKitAvailable,
        isHealthConnected,
        healthRuns,
        plannedSession: dashboardSession,
        todaySessionMode: todayNextSession?.mode ?? null,
        deferAppleHealthPreview,
        todayCalendarYmd: getAppTodayYmd(),
      }),
    [
      healthKitAvailable,
      isHealthConnected,
      healthRuns,
      dashboardSession,
      todayNextSession?.mode,
      deferAppleHealthPreview,
    ],
  );

  const homeCoachFixed = useMemo(
    () =>
      getHomeCoachAssessmentFixedCopy({
        runEvaluationStatus: dashboardLog?.runEvaluation?.status,
        trainingLoadStatus: trainingLoadRec.status,
        appleCoachKind: todayAppleCoach.kind,
        healthSuggestPending,
        dashboardDone,
        dashboardHealthDone,
        deferApplePreview: deferAppleHealthPreview,
      }),
    [
      dashboardLog?.runEvaluation?.status,
      trainingLoadRec.status,
      todayAppleCoach.kind,
      healthSuggestPending,
      dashboardDone,
      dashboardHealthDone,
      deferAppleHealthPreview,
    ],
  );

  const homeTabLabel = getHomeTabLabel(homeRunSession, isPreStart);
  const shareSummary = getShareSummary({ pct: prepProgressPct, week: w, nextKeySession, recoveryState, consistencyStats });
  const viewTransitionStyle = viewMotionDir === 0
    ? {}
    : { animation: `${viewMotionDir > 0 ? "viewSlideNext" : "viewSlidePrev"} .34s cubic-bezier(0.22, 1, 0.36, 1)` };
  const activeView = VIEW_ORDER.includes(view) ? view : DEFAULT_VIEW;
  const resetOnboardingFlag =
    typeof localStorage !== "undefined" && localStorage.getItem(RESET_ONBOARDING_STORAGE_KEY) === "1";
  useEffect(() => {
    if (resetOnboardingFlag) {
      // eslint-disable-next-line no-console
      console.log("[ONBOARDING] reset flag detected");
    }
  }, [resetOnboardingFlag]);
  const onboardingHydrationReady = planRemoteReady && prefsRemoteReady;
  const showOnboarding = useMemo(() => {
    if (onboardingForNewPlan) return true;
    if (!onboardingHydrationReady) return false;
    return needsOnboarding({
      prefs: preferences,
      hasUserTrainingPlan,
      resetOnboarding: resetOnboardingFlag,
    });
  }, [
    onboardingHydrationReady,
    onboardingForNewPlan,
    preferences,
    hasUserTrainingPlan,
    resetOnboardingFlag,
  ]);

  const refreshAllTrainingPlans = useCallback(async () => {
    if (!user?.id) return;
    const list = await loadAllTrainingPlans(user.id);
    setAllTrainingPlans(list);
  }, [user?.id]);

  const handleSwitchPlan = useCallback(
    async (planId: string) => {
      if (!user?.id) return;
      try {
        await setActivePlan(user.id, planId);
        const remotePlan = await loadTrainingPlan(user.id);
        if (remotePlan != null && validateTrainingPlanV2Integrity(remotePlan)) {
          setTrainingPlanV2(remotePlan);
          setHasUserTrainingPlan(isUserTrainingPlan(remotePlan, preferencesRef.current));
        }
        await refreshAllTrainingPlans();
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error("[AppMain] handleSwitchPlan error:", e);
      }
    },
    [refreshAllTrainingPlans, user?.id],
  );

  const handleAddNewPlan = useCallback(() => {
    if (allTrainingPlans.length >= 5) return;
    setOnboardingForNewPlan(true);
  }, [allTrainingPlans.length]);

  const handleDeletePlan = useCallback(
    async (planId: string) => {
      if (!user?.id || allTrainingPlans.length <= 1) return;
      try {
        const { activatedPlanId } = await deletePlan(user.id, planId);
        if (activatedPlanId) {
          const remotePlan = await loadTrainingPlan(user.id);
          if (remotePlan != null && validateTrainingPlanV2Integrity(remotePlan)) {
            setTrainingPlanV2(remotePlan);
            setHasUserTrainingPlan(isUserTrainingPlan(remotePlan, preferencesRef.current));
          }
        }
        await refreshAllTrainingPlans();
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error("[AppMain] handleDeletePlan error:", e);
      }
    },
    [allTrainingPlans.length, refreshAllTrainingPlans, user?.id],
  );
  const handleAccountDeleteCancel = useCallback(() => {
    if (accountDeleteBusy) return;
    setAccountDeleteStep(0);
    setAccountDeleteError(null);
  }, [accountDeleteBusy]);

  const handleAccountDeleteConfirmFinal = useCallback(async () => {
    if (accountDeleteBusy || !user?.id) return;
    setAccountDeleteBusy(true);
    setAccountDeleteError(null);
    try {
      await deleteAccountViaApi();
      clearMarathonLocalStorage();
      setAccountDeleteStep(0);
      await signOut();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Account konnte nicht gelöscht werden";
      setAccountDeleteError(msg);
    } finally {
      setAccountDeleteBusy(false);
    }
  }, [accountDeleteBusy, user?.id, signOut]);

  const handleOnboardingComplete = useCallback(
    async (patch, plan, patches, planName?: string) => {
      // eslint-disable-next-line no-console
      console.log("[AppMain] handleOnboardingComplete called, plan:", !!plan, "patches:", patches?.length);
      try {
        setOnboardingForNewPlan(false);
        skipRemotePlanHydrationRef.current = true;
        skipRemotePatchesHydrationRef.current = true;
        skipRemotePrefsHydrationRef.current = true;

        const isolatedPrefs = buildIsolatedOnboardingPreferences(patch);
        const detachedLogs = detachSessionLogsFromPlan(logs, plan);

        if (typeof localStorage !== "undefined") {
          localStorage.removeItem(RESET_ONBOARDING_STORAGE_KEY);
          localStorage.removeItem(MIGRATION_TO_SUPABASE_DONE_KEY);
          localStorage.setItem(MARATHON_AI_PLAN_PATCHES_KEY, JSON.stringify([]));
          localStorage.setItem(MARATHON_PREFERENCES_KEY, JSON.stringify(isolatedPrefs));
          localStorage.setItem(MARATHON_LOGS_KEY, JSON.stringify(detachedLogs));
          if (plan && validateTrainingPlanV2Integrity(plan)) {
            localStorage.setItem(TRAINING_PLAN_V2_STORAGE_KEY, JSON.stringify(plan));
          }
        }

        setAiPlanPatches([]);
        setLogs(detachedLogs);
        setPreferences(isolatedPrefs);
        if (user?.id) {
          void saveProfile(user.id, isolatedPrefs);
        }

        if (plan) {
          if (validateTrainingPlanV2Integrity(plan)) {
            setTrainingPlanV2(plan);
            setHasUserTrainingPlan(true);
            if (user?.id) {
              const label =
                planName?.trim() ||
                [patch?.raceDistanceLabel ?? "Marathon", patch?.raceName, patch?.raceDate]
                  .filter(Boolean)
                  .join(" – ");
              await saveTrainingPlan(user.id, plan, label || undefined);
              await refreshAllTrainingPlans();
            }
            // eslint-disable-next-line no-console
            console.log("[AppMain] saveTrainingPlan done");
            if (patches?.length) {
              handleAiApplyPlanPatches("", null, patches);
            }
          } else {
            // eslint-disable-next-line no-console
            console.error("[ONBOARDING] generated plan failed integrity check");
          }
        }

        if (typeof localStorage !== "undefined") {
          localStorage.setItem(MIGRATION_TO_SUPABASE_DONE_KEY, "1");
        }
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error("[AppMain] handleOnboardingComplete error:", e);
      }
    },
    [handleAiApplyPlanPatches, logs, refreshAllTrainingPlans, user?.id],
  );
  const postWorkoutMaxHeartRateBpm = (() => {
    const raw = preferences?.maxHeartRateBpm ?? preferencesRef.current?.maxHeartRateBpm;
    if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) return Math.round(raw);
    if (typeof raw === "string" && String(raw).trim()) {
      const n = Number.parseInt(String(raw).trim(), 10);
      if (Number.isFinite(n) && n > 0) return n;
    }
    return null;
  })();
  // eslint-disable-next-line no-console
  console.log("[HR-FIX] maxHeartRateBpm in AppMain:", postWorkoutMaxHeartRateBpm);
  const postWorkoutSummary = usePostWorkoutSummary({
    activeView,
    planSessions: ACTIVE_SESSIONS,
    logs,
    healthRuns,
    maxHeartRateBpm: postWorkoutMaxHeartRateBpm,
    aiAnalysisEnabled: typeof process !== "undefined" ? process.env.REACT_APP_AI_ANALYSIS !== "0" : true,
    recoveryPoints:
      (recoveryDomain as any)?.series?.length
        ? (recoveryDomain as any).series
            .map((p: any) => ({ date: p?.date, score0_100: p?.score }))
            .filter((p: any) => typeof p?.date === "string" && typeof p?.score0_100 === "number" && Number.isFinite(p.score0_100))
        : null,
  });

  const persistWorkoutHeartRate = useCallback(
    ({ sessionId, runId, avgHeartRateBpm }: { sessionId: string; runId: string; avgHeartRateBpm: number }) => {
      setHealthRuns((prev) => {
        const next = prev.map((r) => (r.runId === runId ? { ...r, avgHeartRateBpm } : r));
        const uid = userIdForHealthSyncRef.current;
        if (uid && healthRemoteReadyRef.current) {
          const row = next.find((r) => r.runId === runId);
          if (row) void saveHealthWorkout(uid, row);
        }
        return next;
      });
      setLogs((prev) => {
        const log = prev[sessionId];
        if (!log) return prev;
        const ar = log.assignedRun || {};
        const updated: SessionLog = {
          ...log,
          assignedRun: { ...ar, runId: ar.runId || runId, avgHeartRateBpm },
        };
        if (user?.id && logsRemoteReady) {
          void saveSessionLog(user.id, sessionId, updated);
        }
        return {
          ...prev,
          [sessionId]: updated,
        };
      });
    },
    [user?.id, logsRemoteReady],
  );

  const postWorkoutSummaryDisplay = usePostWorkoutHrEnrichment(
    postWorkoutSummary.summary,
    postWorkoutSummary.visible,
    { logs, healthRuns, persistWorkoutHeartRate },
  );

  const modalCompletionSummary =
    modal && modalWeek && modalWorkout
      ? (() => {
          const modalLog = logs[modal.id];
          if (getSessionStatus(modalLog) !== "done") return null;
          const dayKey = planWorkoutLocalDayKey(trainingPlanV2, modal.id);
          const runId = modalLog?.assignedRun?.runId;
          if (!runId || !dayKey) return null;
          return postWorkoutSummary.getPostWorkoutSummary(runId, dayKey);
        })()
      : null;

  const modalCompletionSummaryDisplay = usePostWorkoutHrEnrichment(
    modalCompletionSummary,
    !!(modal && modalWeek && modalWorkout && modalCompletionSummary),
    { logs, healthRuns, persistWorkoutHeartRate },
  );

  /** Eingeklappte Einschätzung: kompaktere Home-Card-Paddings (Scroll siehe Main-Area — temporär aktiv). */
  const homeScrollLocked = activeView === "home" && !homeCoachAssessmentExpanded;
  const homeScale = homeViewportTight ? "compact" : "comfortable";
  const hs = getHomeSpacing(homeScale, homeCoachAssessmentExpanded);
  /** Prep-Ring-Box; Abstand Ring→primäre Actions (Done/Skip), dann Card. */
  const HOME_PREP_RING_PX = hs.ringPx;
  const spacingRingToPrimaryActions = hs.ringToActions;
  /** Zwischen Hero-Block und Coach-/Metrik-Säule bzw. innerhalb der scrollbaren Tail-Säule */
  const homeBelowFoldStackGap = hs.belowFoldGap;
  const homeColumnGap = hs.columnGap;
  const homeRingReservedMinHeight = HOME_PREP_RING_PX + spacingRingToPrimaryActions;
  const compactScreen = getCompactScreenSpacing();
  const spacing = { xs: LAYOUT_SPACING.xs, sm: LAYOUT_SPACING.sm, md: LAYOUT_SPACING.md };
  /** Week: „Mehr anzeigen“ — Detailblock scrollt im Kartenbudget, verschiebt keine Geschwister-Zeilen */
  const weekSessionDetailScrollStyle = {
    maxHeight: LAYOUT_BUDGET.expandableMaxImpact,
    overflowY: "auto",
    overflowX: "hidden",
    WebkitOverflowScrolling: "touch",
    overscrollBehaviorY: "contain",
    touchAction: "pan-y",
  };
  const safeTopPad = "max(44px, env(safe-area-inset-top, 44px))";
  /** Tabbar ~72px + Abstand; zu groß = Leerraum über fixer Nav, zu klein = Content verdeckt */
  const safeBottomContentPad = "calc(86px + env(safe-area-inset-bottom, 0px))";
  const appRootBackground = {
    backgroundColor: "#070912",
    backgroundImage: "radial-gradient(circle at top, #1a1f44 0%, #0b0b15 40%, #070912 100%)",
    backgroundRepeat: "no-repeat",
  };
  const mainScrollAreaStyle = {
    flex: 1,
    minHeight: 0,
    overflowY: "auto",
    WebkitOverflowScrolling: "touch",
    padding: 0,
    boxSizing: "border-box" as const,
    display: "flex",
    flexDirection: "column" as const,
  };
  /** Kein vertikales Scrollen: Viewport-bound (Woche, Leistung — eigene innere Scrollbereiche). */
  const mainScrollAreaStyleNoVert: typeof mainScrollAreaStyle = {
    ...mainScrollAreaStyle,
    overflow: "hidden",
    overflowY: "hidden",
    WebkitOverflowScrolling: "auto",
    overscrollBehavior: "none",
  };
  /**
   * Home / Übersicht: kein äußerer Seiten-Scroll — flex-Säule; Home-Tail (Coach/Metriken) scrollt intern bei Bedarf.
   */
  const mainScrollAreaStyleHome: typeof mainScrollAreaStyle = {
    ...mainScrollAreaStyle,
    display: "flex",
    flexDirection: "column",
    minHeight: 0,
    overflow: "hidden",
    overflowY: "hidden",
    overscrollBehavior: "none",
  };
  /** „Training wählen“: ausschließlich `healthRuns` → `buildSelectionOptionsFromHealthRuns` (keine parallelen Kandidaten-Listen). */
  const selectionOptions = useMemo(() => {
    const list = buildSelectionOptionsFromHealthRuns(healthRuns);
    return list;
  }, [healthRuns]);

  /** Picker: immer Zeile aus `healthRuns` (Source of Truth), nicht nur Schließung aus `selectionOptions`. */
  const healthLinkPickerWorkout = useMemo(() => {
    if (!healthSessionPickWorkoutId) return null;
    const id = healthSessionPickWorkoutId;
    return (
      healthRuns.find((r) => r?.runId === id) ??
      selectionOptions.find((r) => r?.runId === id) ??
      null
    );
  }, [healthSessionPickWorkoutId, healthRuns, selectionOptions]);

  const healthLinkAssignmentUi = useMemo(() => {
    if (!healthSessionPickWorkoutId || !healthLinkPickerWorkout) return null;
    const pool = HEALTH_LINKABLE_PLAN_SESSIONS;
    const selectedWorkout = healthLinkPickerWorkout;
    const rawTypeStr =
      selectedWorkout.workoutType != null && String(selectedWorkout.workoutType).trim() !== ""
        ? String(selectedWorkout.workoutType)
        : "";
    const canonical = getStoredHealthRunCanonicalType(selectedWorkout);

    if (process.env.NODE_ENV === "development") {
      if (rawTypeStr && classifyWorkoutType(rawTypeStr) === "bike" && canonical !== "bike") {
        throw new Error('❌ BIKE WORKOUT CANONICAL MISMATCH (expected canonical "bike")');
      }
    }

    const meta = getAssignableHealthLinkPlanSessionsWithMeta(canonical, pool);
    const assignableSessions = meta.assignable;

    if (process.env.NODE_ENV === "development") {
      const poolHasBike = pool.some((s) => s.type === "bike");
      if (
        canonical === "bike" &&
        poolHasBike &&
        !meta.usedFallback &&
        assignableSessions.length > 0 &&
        assignableSessions.every((s) => HEALTH_LINK_RUN_TYPES.has(s.type))
      ) {
        throw new Error("❌ UI STILL RENDERING RUN SESSIONS FOR BIKE");
      }
      if (canonical === "bike" && poolHasBike && !assignableSessions.some((s) => s.type === "bike")) {
        throw new Error("❌ BIKE CANNOT BE ASSIGNED — RUN-ONLY FILTER STILL ACTIVE");
      }
    }

    return {
      pickerWorkout: selectedWorkout,
      assignableSessions,
      canonical,
      usedFallback: meta.usedFallback,
    };
  }, [healthSessionPickWorkoutId, healthLinkPickerWorkout]);

  useLayoutEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    if (
      healthRuns.some((w) => getStoredHealthRunCanonicalType(w) === "bike") &&
      !selectionOptions.some((o) => getStoredHealthRunCanonicalType(o) === "bike")
    ) {
      throw new Error("❌ CYCLING LOST IN FINAL PIPELINE");
    }
    for (const w of selectionOptions) {
      const canonical = getStoredHealthRunCanonicalType(w);
      const mappedType = storedHealthRunToWorkout(w, { skipDevLog: true }).type;
      if (canonical !== mappedType) {
        throw new Error("❌ BIKE LOST BEFORE RENDER");
      }
    }
  }, [healthRuns, selectionOptions]);

  useEffect(() => {
    if (process.env?.NODE_ENV === "production" || process.env?.NODE_ENV === "test" || !logs) return;
    for (const row of loadSelectedWorkoutForDebug(healthRuns, logs)) {
      if (row.canonicalActivityType === "bike" && row.type !== "bike") {
        throw new Error("❌ BIKE LOST OR RECLASSIFIED AFTER MIDNIGHT");
      }
    }
  }, [healthRuns, logs]);

  useEffect(() => {
    if (typeof process !== "undefined" && process.env.NODE_ENV === "test") return;
    if (healthRuns.length > 0) return;
    const logOnly = loadSelectedWorkoutForDebug([], logs);
    if (logOnly.length === 0) return;
    // no console logging in production path
  }, [healthRuns, logs]);

  useEffect(() => {
    if (Capacitor.getPlatform() !== "ios") return;
    // no console logging in production path
  }, []);

  useLayoutEffect(() => {
    if (activeView !== "home") return;
    const main = homeMainColumnRef.current;
    const upper = homeUpperRef.current;
    if (!main || !upper) return;
    const measure = () => {
      const vh = window.visualViewport?.height ?? window.innerHeight;
      // Ignore changes caused by keyboard open/close (>150px offset) —
      // @capacitor/keyboard with resize:'body' handles those separately.
      const keyboardOffset = window.innerHeight - vh;
      if (keyboardOffset > 150) return;
      const budget = main.clientHeight;
      const upperH = upper.getBoundingClientRect().height;
      const reserveTail = 168;
      setHomeViewportTight(upperH + reserveTail > budget + 2 || vh < 664);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(main);
    ro.observe(upper);
    window.addEventListener("resize", measure);
    window.visualViewport?.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
      window.visualViewport?.removeEventListener("resize", measure);
    };
  }, [
    activeView,
    homeCoachAssessmentExpanded,
    view,
    homeRunSession,
    dashboardDone,
    isRestDay,
    prepProgressPct,
    wIdx,
  ]);

  useEffect(() => {
    if (homeViewportTight && !prevHomeViewportTightRef.current && homeCoachAssessmentExpanded) {
      setHomeCoachAssessmentExpanded(false);
    }
    prevHomeViewportTightRef.current = homeViewportTight;
  }, [homeViewportTight, homeCoachAssessmentExpanded]);

  useLayoutEffect(() => {
    if (typeof process !== "undefined" && process.env.NODE_ENV === "production") return;
    if (activeView === "home" && !homeCoachAssessmentExpanded && homeMainColumnRef.current) {
      validateNoVerticalOverflow(homeMainColumnRef.current, "home-default", 10);
    }
    if (activeView === "week" && weekSessionStackRef.current) {
      const cards = Array.from(weekSessionStackRef.current.querySelectorAll("[data-layout-week-card]")).filter(
        (n) => n instanceof HTMLElement,
      );
      if (cards.length >= 2) validateSiblingStackNoOverlap(cards, "week-sessions");
    }
  }, [activeView, homeCoachAssessmentExpanded, weekTabDescExpandedById, wIdx, view]);

  return(
    <div
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onWheel={handleWheel}
      style={{
        boxSizing: "border-box",
        flex: 1,
        minHeight: "100dvh",
        height: "100dvh",
        maxHeight: "100dvh",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        position: "relative",
        backgroundColor: "#070912",
        color: "#e2e8f0",
        fontFamily: "'Segoe UI',system-ui,sans-serif",
        fontSize: 14,
        WebkitTapHighlightColor: "transparent",
      }}
    >
      <div
        aria-hidden
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 0,
          pointerEvents: "none",
          ...appRootBackground,
        }}
      />
      <div
        style={{
          position: "relative",
          zIndex: 1,
          boxSizing: "border-box",
          flex: 1,
          display: "flex",
          flexDirection: "column",
          minHeight: 0,
          overflow: "hidden",
          paddingTop: safeTopPad,
          paddingBottom: safeBottomContentPad,
          paddingLeft: "env(safe-area-inset-left, 0px)",
          paddingRight: "env(safe-area-inset-right, 0px)",
        }}
      >
      <style>{`
        .dashboard-action,
        .bottom-nav-btn {
          -webkit-tap-highlight-color: transparent;
        }
        .dashboard-action {
          transition: transform .12s ease, background .22s ease, border-color .22s ease, box-shadow .22s ease, color .22s ease;
        }
        .dashboard-action:active {
          transform: scale(.97);
        }
        .bottom-nav-btn {
          transition: transform .12s ease, background .22s ease, color .22s ease, opacity .22s ease;
          justify-content: center !important;
          align-items: center !important;
        }
        .bottom-nav-btn:active {
          transform: scale(.97);
        }
        @keyframes viewSlideNext {
          0% { opacity: .0; transform: translate3d(18px,0,0); }
          100% { opacity: 1; transform: translate3d(0,0,0); }
        }
        @keyframes viewSlidePrev {
          0% { opacity: .0; transform: translate3d(-18px,0,0); }
          100% { opacity: 1; transform: translate3d(0,0,0); }
        }
      `}</style>
      <div
        style={
          activeView === "performance" || activeView === "week"
            ? mainScrollAreaStyleNoVert
            : activeView === "home" || activeView === "overview"
              ? mainScrollAreaStyleHome
              : mainScrollAreaStyle
        }
      >
      {activeView==="home"?(
        <div
          ref={homeMainColumnRef}
          style={{
            flex: 1,
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            overflowX: "hidden",
            width: "100%",
            maxWidth: "100%",
            boxSizing: "border-box",
            paddingLeft: hs.horizontalPadding,
            paddingRight: hs.horizontalPadding,
            gap: homeColumnGap,
            alignItems: "stretch",
            ...viewTransitionStyle,
          }}
        >
          {/* ── HERO + RING + ACTIONS: Kopf-Säule (LayoutBudget — kein flex-grow) ─────────── */}
          <div
            ref={homeUpperRef}
            style={{
              position: "relative",
              paddingTop: 0,
              paddingBottom: 0,
              flex: "0 0 auto",
              display: "flex",
              flexDirection: "column",
              width: "100%",
              minWidth: 0,
            }}
          >

            {/* Primärer Lauf-Block (flach) → Apple Health → Ring */}
            <div
              style={{
                width: "100%",
                minWidth: 0,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                textAlign: "center",
                paddingTop: 2,
                paddingBottom: homeScrollLocked ? 4 : 6,
                flexShrink: 0,
                boxSizing: "border-box",
                gap: hs.statusStackGap,
              }}
            >
              <div
                style={{
                  width: "100%",
                  maxWidth: "min(100%, 340px)",
                  margin: "0 auto",
                  padding: homeScrollLocked ? "4px 6px" : "8px 10px",
                  boxSizing: "border-box",
                }}
              >
                {homeRunSession ? (
                  <div
                    style={{
                      fontSize: 10,
                      textTransform: "uppercase",
                      letterSpacing: "0.1em",
                      color: "rgba(100,116,139,0.92)",
                      fontWeight: 700,
                      marginBottom: 6,
                      textAlign: "center",
                    }}
                  >
                    Heute · Training
                  </div>
                ) : null}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    minWidth: 0,
                  }}
                >
                  {homeRunSession ? (
                    <span
                      aria-hidden
                      style={{
                        width: 11,
                        height: 11,
                        borderRadius: 999,
                        backgroundColor: getSessionTypeAccentColor(homeRunSession.type),
                        flexShrink: 0,
                      }}
                    />
                  ) : null}
                  <span
                    style={{
                      fontSize: homeScrollLocked ? 24 : 26,
                      fontWeight: 800,
                      color: "#f8fafc",
                      lineHeight: 1.15,
                      letterSpacing: "-0.03em",
                      overflowWrap: "anywhere",
                      textAlign: "center",
                      minWidth: 0,
                    }}
                  >
                    {homeTodayHeadline}
                    {homeRunSession && (() => {
                      const lg = logs[homeRunSession.id];
                      const doneOrSynced = !!(isSessionLogDone(lg) || lg?.assignedRun?.runId);
                      return doneOrSynced ? (
                        <span
                          aria-label="Erledigt"
                          style={{
                            marginLeft: 8,
                            fontSize: 14,
                            fontWeight: 900,
                            color: "#22c55e",
                            verticalAlign: "baseline",
                            display: "inline-block",
                            transform: "translateY(-1px)",
                          }}
                        >
                          ✓
                        </span>
                      ) : null;
                    })()}
                  </span>
                </div>
              </div>

              {homeRunSession ? (
                <div
                  style={{
                    width: "100%",
                    maxWidth: "min(100%, 340px)",
                    margin: "0 auto",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "stretch",
                    gap: 6,
                  }}
                >
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 750,
                      color: "rgba(226,232,240,0.78)",
                      textAlign: "center",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      letterSpacing: "0.01em",
                    }}
                  >
                    {formatSessionHrTargetLine(homeRunSession, preferences.maxHeartRateBpm, w)}
                  </div>
                </div>
              ) : (
                !isRestDay && (dashboardDone || !homeRunSession) ? (
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: "rgba(148,163,184,0.95)",
                      letterSpacing: "0.02em",
                    }}
                  >
                    {dashboardDone ? "Heute erledigt" : "Kein Training geplant"}
                  </div>
                ) : null
              )}
            </div>

            {/* Plan-Status (Kalender) — nur wenn Plan-Datum bekannt */}
            {firstTrainingStart ? (
              <div style={{ position: "relative", display: "flex", justifyContent: "center", marginBottom: homeScrollLocked ? 4 : 6, flexShrink: 0, width: "100%" }}>
                {!hasCalendarStarted ? (
                  <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(148,163,184,0.06)", border: "1px solid rgba(148,163,184,0.1)", borderRadius: 999, padding: homeScrollLocked ? "2px 8px" : "3px 10px" }}>
                    <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#475569", display: "inline-block" }} />
                    <span style={{ fontSize: homeScrollLocked ? 10 : 11, color: "#475569", fontWeight: 700 }}>Plan startet am {blockStartLabel}</span>
                  </div>
                ) : (
                  <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(56,189,248,0.08)", border: "1px solid rgba(56,189,248,0.16)", borderRadius: 999, padding: homeScrollLocked ? "2px 8px" : "3px 10px" }}>
                    <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#38bdf8", boxShadow: "0 0 5px #38bdf8", display: "inline-block" }} />
                    <span style={{ fontSize: homeScrollLocked ? 10 : 11, color: "#7dd3fc", fontWeight: 700 }}>Training läuft</span>
                  </div>
                )}
              </div>
            ) : null}

            {/* Ring: reservierter Block — paddingBottom = Abstand zu Done/Skip/Info */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                width: "100%",
                minWidth: 0,
                flexShrink: 0,
                minHeight: homeRingReservedMinHeight,
                paddingBottom: spacingRingToPrimaryActions,
                boxSizing: "border-box",
              }}
            >
              <div
                style={{
                  position: "relative",
                  width: HOME_PREP_RING_PX,
                  height: HOME_PREP_RING_PX,
                  flexShrink: 0,
                  maxWidth: "100%",
                }}
              >
                  <svg viewBox="0 0 120 120" style={{width:"100%",height:"100%",display:"block"}}>
                    <defs>
                      <linearGradient id="prepRingGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#4ade80" />
                        <stop offset="100%" stopColor="#ecfdf5" />
                      </linearGradient>
                    </defs>
                    <circle
                      cx="60"
                      cy="60"
                      r={ringRadius}
                      fill="none"
                      stroke="rgba(148,163,184,0.08)"
                      strokeWidth="7.5"
                    />
                    <circle
                      cx="60"
                      cy="60"
                      r={ringRadius}
                      fill="none"
                      stroke="url(#prepRingGrad)"
                      strokeWidth="8.2"
                      strokeLinecap="round"
                      strokeDasharray={`${ringCircumference} ${ringCircumference}`}
                      strokeDashoffset={ringDashOffset}
                      transform="rotate(-90 60 60)"
                      style={{transition:"stroke-dashoffset .5s ease-out"}}
                    />
                  </svg>
                  <div
                    style={{
                      position: "absolute",
                      left: "50%",
                      top: "50%",
                      transform: "translate(-50%, -50%)",
                      margin: 0,
                      padding: 0,
                    fontSize: 33,
                    fontWeight: 800,
                    color: "#f8fafc",
                    letterSpacing: "-0.03em",
                    whiteSpace: "nowrap",
                    lineHeight: 1,
                    textAlign: "center",
                  }}
                >
                  {prepProgressPct}%
                  </div>
                </div>
            </div>

            {/* Done / Skip / Session-Details — Info rechts, nicht in der Einschätzungs-Card */}
            <div
              style={{
                display: "flex",
                flexDirection: "row",
                alignItems: "stretch",
                gap: 8,
                width: "100%",
                minWidth: 0,
                boxSizing: "border-box",
                flexShrink: 0,
              }}
            >
              <button
                className="dashboard-action"
                type="button"
                onClick={() => homeRunSession && quickCompleteSession(homeRunSession)}
                disabled={!homeRunSession}
                style={{
                  flex: 1,
                  minWidth: 0,
                  background: "rgba(16,185,129,0.26)",
                  border: "1px solid rgba(16,185,129,0.4)",
                  color: homeRunSession ? "#ecfdf5" : "#374151",
                  borderRadius: 999,
                  padding: "11px 12px",
                  minHeight: 46,
                  cursor: homeRunSession ? "pointer" : "not-allowed",
                  fontSize: 15,
                  fontWeight: 800,
                  boxShadow: "0 10px 28px rgba(16,185,129,0.12)",
                  boxSizing: "border-box",
                }}
              >
                ✓ Done
              </button>
              <button
                className="dashboard-action"
                type="button"
                onClick={() => homeRunSession && quickSkipSession(homeRunSession)}
                disabled={!homeRunSession}
                style={{
                  flex: 1,
                  minWidth: 0,
                  background: "rgba(239,68,68,0.18)",
                  border: "1px solid rgba(248,113,113,0.32)",
                  color: homeRunSession ? "#fecaca" : "#374151",
                  borderRadius: 999,
                  padding: "11px 12px",
                  minHeight: 46,
                  cursor: homeRunSession ? "pointer" : "not-allowed",
                  fontSize: 15,
                  fontWeight: 800,
                  boxShadow: "0 10px 26px rgba(248,113,113,0.1)",
                  boxSizing: "border-box",
                }}
              >
                Skip
              </button>
              <button
                type="button"
                className="dashboard-action"
                onClick={() => homeRunSession && openModal(homeRunSession)}
                disabled={!homeRunSession}
                style={{
                  flex: "0 0 46px",
                  width: 46,
                  minWidth: 46,
                  margin: 0,
                  padding: 0,
                  background: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(148,163,184,0.16)",
                  color: homeRunSession ? "#94a3b8" : "#374151",
                  borderRadius: 999,
                  cursor: homeRunSession ? "pointer" : "not-allowed",
                  fontSize: 16,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxSizing: "border-box",
                }}
                aria-label="Details zur Einheit öffnen"
              >
                ⓘ
              </button>
            </div>
          </div>

          {/* ── Coach + Metriken: scrollbare Tail-Säule (verhindert äußeren Home-Scroll) ─ */}
          <div
            ref={homeTailRef}
            style={{
              flex: 1,
              minHeight: 0,
              overflowX: "hidden",
              overflowY: "auto",
              display: "flex",
              flexDirection: "column",
              gap: homeBelowFoldStackGap,
              WebkitOverflowScrolling: "touch",
              overscrollBehaviorY: "contain",
            }}
          >
          {/* ── BELOW-FOLD CONTENT (Einschätzung → Metriken) ─ */}
          <div style={{display:"flex",flexDirection:"column",gap:homeBelowFoldStackGap,flexShrink:0,width:"100%",minWidth:0,boxSizing:"border-box"}}>

            {/* Daily coach decision card — Header → Plan → Performance */}
            <div
              style={{
                width:"100%",
                maxWidth:"100%",
                minWidth:0,
                boxSizing:"border-box",
                borderRadius:18,
                border:"1px solid rgba(56,189,248,0.22)",
                background:"linear-gradient(160deg,rgba(12,22,36,0.92),rgba(10,16,28,0.88))",
                padding: hs.coachCardPadding,
                display:"flex",
                flexDirection:"column",
                gap: hs.coachCardGap,
                color:"#e2e8f0",
              }}
            >
              {/* Header + Plan-Zeile: feste 8px-Lücke, eine Zeile für Label + Score */}
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  width: "100%",
                  minWidth: 0,
                  gap: 8,
                }}
              >
                <div style={{ width: "100%", minWidth: 0, margin: 0, padding: 0 }}>
                  <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: "#7c8aa5", fontWeight: 700 }}>Vorbereitungs Einschätzung</div>
                </div>

                <button
                  type="button"
                  onClick={() => navigateToView("coach")}
                  style={{
                    width: "100%",
                    margin: 0,
                    marginTop: 0,
                    padding: 0,
                    border: "none",
                    background: "transparent",
                    cursor: "pointer",
                    textAlign: "left",
                    font: "inherit",
                    color: "inherit",
                    display: "block",
                    minWidth: 0,
                  }}
                >
                  <div
                    style={{
                      paddingBottom: 6,
                      borderBottom: "1px solid rgba(148,163,184,0.12)",
                      marginTop: 0,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 10,
                        minWidth: 0,
                        marginTop: 0,
                      }}
                    >
                      <span
                        style={{
                          fontSize: 10,
                          textTransform: "uppercase",
                          letterSpacing: "0.12em",
                          color: "rgba(100,116,139,0.95)",
                          fontWeight: 700,
                          flex: "1 1 auto",
                          minWidth: 0,
                          lineHeight: 1.2,
                        }}
                      >
                        Plan &amp; Umsetzung
                      </span>
                      <span
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          flexShrink: 0,
                          whiteSpace: "nowrap",
                        }}
                      >
                        <span
                          style={{
                            fontSize: 14,
                            fontWeight: 850,
                            color: planAdherenceTextColor(planAdherence.band),
                            lineHeight: 1,
                          }}
                        >
                          {formatScore100(planAdherence.score)}
                        </span>
                      </span>
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => navigateToView("performance")}
                  style={{
                    width: "100%",
                    margin: 0,
                    marginTop: 0,
                    padding: 0,
                    border: "none",
                    background: "transparent",
                    cursor: "pointer",
                    textAlign: "left",
                    font: "inherit",
                    color: "inherit",
                    display: "block",
                    minWidth: 0,
                  }}
                >
                  <div
                    style={{
                      paddingBottom: 6,
                      borderBottom: "1px solid rgba(148,163,184,0.12)",
                      marginTop: 0,
                    }}
                  >
                    {devMarkOncePerFrame("home:recovery_score", uiRecoveryScore0_100, { view: "home" })}
                    {productionMarkOncePerFrame("home:recovery_score", uiRecoveryScore0_100, { view: "home" })}
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 10,
                        minWidth: 0,
                        marginTop: 0,
                      }}
                    >
                      <span
                        style={{
                          fontSize: 10,
                          textTransform: "uppercase",
                          letterSpacing: "0.12em",
                          color: "rgba(100,116,139,0.95)",
                          fontWeight: 700,
                          flex: "1 1 auto",
                          minWidth: 0,
                          lineHeight: 1.2,
                        }}
                      >
                        Erholung
                      </span>
                      <span
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          flexShrink: 0,
                          whiteSpace: "nowrap",
                        }}
                      >
                        <span
                          style={{
                            fontSize: 14,
                            fontWeight: 850,
                            color: recoveryPresentation.homeKpi.colorHex,
                            lineHeight: 1,
                          }}
                        >
                          {isRecoveryHydrating && uiRecoveryScore0_100 == null ? (
                            <span style={{ display: "inline-block", width: 42, height: 14, borderRadius: 4, background: "rgba(255,255,255,0.08)", animation: "pulse 1.2s ease-in-out infinite", verticalAlign: "middle" }} />
                          ) : uiRecoveryScore0_100 != null ? formatScore100(uiRecoveryScoreDisplay) : "Keine Daten verfügbar"}
                        </span>
                      </span>
                    </div>
                  </div>
                </button>
              </div>

              {homeCoachAssessmentExpanded ? (
                <div
                  style={{
                    paddingTop: 6,
                    paddingBottom: 6,
                  }}
                >
                  <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.12em", color: "rgba(100,116,139,0.95)", fontWeight: 700, marginBottom: 6 }}>
                    Leistung &amp; Coach-Feedback
                  </div>

                  {/* Coach-Status: compact, dynamic 1-sentence summary (UI-only microcopy) */}
                  <div
                    style={{
                      padding: "10px 12px",
                      borderRadius: 12,
                      background: "rgba(15,23,42,0.4)",
                      border: "1px solid rgba(148,163,184,0.1)",
                      marginBottom: 12,
                    }}
                  >
                    <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.1em", color: "rgba(100,116,139,0.88)", fontWeight: 700, marginBottom: 8 }}>
                      Coach-Status
                    </div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-start", gap: 10, minWidth: 0 }}>
                      <span style={{ fontSize: 15, fontWeight: 800, color: "#f8fafc", flex: "1 1 auto", minWidth: 0, overflowWrap: "anywhere" }}>Coach &amp; Details</span>
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        color: "rgba(226,232,240,0.82)",
                        lineHeight: 1.45,
                        marginTop: 6,
                        whiteSpace: "normal",
                        overflowWrap: "anywhere",
                        minWidth: 0,
                      }}
                    >
                      {sanitizeOneSentence((() => {
                        const s = recoveryPresentation.homeKpi.score0_100;
                        const load = trainingLoadRec.status;
                        if (s == null) return "Erholungsdaten fehlen – heute konservativ bleiben.";
                        if (s >= 80 && load === "green") return "Die Trainingsbelastung wird gut toleriert – du bist gut erholt.";
                        if (s >= 70 && load !== "red") return "Du bist gut erholt und an die aktuelle Belastung angepasst.";
                        if (s >= 70 && load === "red") return "Gute Erholung, aber Ermüdung erhöht – Intensität im Blick behalten.";
                        if (s >= 55 && load === "green") return "Leistung stabil – Intensität kontrolliert halten.";
                        if (load === "red") return "Ermüdung erhöht – Intensität reduzieren und Erholung priorisieren.";
                        return "Erholung niedrig – locker bleiben und Ruhe priorisieren.";
                      })(), "home:coach_status")}
                    </div>
                    {homeCoachFixed.assignHint ? (
                      <div style={{ fontSize: 11, color: "#7dd3fc", marginTop: 8, overflowWrap: "anywhere", minWidth: 0 }}>{homeCoachFixed.assignHint}</div>
                    ) : null}
                    {todayAppleCoach.showConnectHint ? (
                      <button
                        type="button"
                        onClick={() => navigateToView("settings")}
                        style={{
                          marginTop: 8,
                          alignSelf: "flex-start",
                          background: "rgba(56,189,248,0.14)",
                          border: "1px solid rgba(56,189,248,0.32)",
                          borderRadius: 10,
                          padding: "10px 14px",
                          minHeight: 44,
                          color: "#7dd3fc",
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: "pointer",
                        }}
                      >
                        Apple Health verbinden
                      </button>
                    ) : null}
                  </div>

                  {/* Gesamteinordnung Marathon-Vorbereitung (aggregiert, kein Plan-vs-Ist pro Einheit) */}
                  <div
                    style={{
                      padding: "10px 12px",
                      borderRadius: 12,
                      background: "rgba(56,189,248,0.07)",
                      border: "1px solid rgba(56,189,248,0.2)",
                    }}
                  >
                    {devMarkOncePerFrame("home:overall_prep", homeOverallPrepLines.join("|"), { view: "home" })}
                    {productionMarkOncePerFrame("home:overall_prep", homeOverallPrepLines.join("|"), {
                      view: "home",
                    })}
                    <div
                      style={{
                        fontSize: 9,
                        textTransform: "uppercase",
                        letterSpacing: "0.1em",
                        color: "rgba(100,116,139,0.88)",
                        fontWeight: 700,
                        marginBottom: 8,
                      }}
                    >
                      Gesamtvorbereitung
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        color: "rgba(226,232,240,0.82)",
                        lineHeight: 1.55,
                        fontWeight: 550,
                      }}
                    >
                      {homeOverallPrepLines.map((ln, i) => (
                        <div key={i} style={{ marginBottom: i === homeOverallPrepLines.length - 1 ? 0 : 8 }}>
                          {ln}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : null}
              <button
                type="button"
                onClick={() => setHomeCoachAssessmentExpanded((v) => !v)}
                style={{
                  alignSelf:"flex-start",
                  margin:0,
                  marginTop: spacing.xs,
                  padding:"6px 0",
                  border:"none",
                  background:"transparent",
                  cursor:"pointer",
                  fontSize:12,
                  fontWeight:700,
                  color:"#7dd3fc",
                  letterSpacing:"0.02em",
                }}
              >
                {homeCoachAssessmentExpanded ? "Weniger anzeigen" : "Mehr anzeigen"}
                <span style={{ marginLeft: 6, opacity: 0.85 }} aria-hidden>{homeCoachAssessmentExpanded ? "▴" : "▾"}</span>
              </button>
            </div>

            {/* Metrics group — cleaner, softer and less boxy */}
            <div style={{display:"flex",flexDirection:"column",gap: homeScrollLocked ? 5 : 6,padding: homeScrollLocked ? "6px 8px" : "8px 10px",borderRadius:18,background:"linear-gradient(160deg,rgba(15,23,42,0.33),rgba(12,18,34,0.2))",border:"1px solid rgba(148,163,184,0.1)",width:"100%",minWidth:0,boxSizing:"border-box"}}>
              <div style={{display:"grid",gridTemplateColumns:"repeat(3,minmax(0,1fr))",gap:4}}>
                <div style={{padding:"6px 5px",textAlign:"center",borderRadius:12,background:"rgba(15,23,42,0.34)"}}>
                  <div style={{fontSize:10,textTransform:"uppercase",letterSpacing:"0.09em",color:"rgba(148,163,184,0.52)",fontWeight:700,marginBottom:3}}>Erholung</div>
                  <div style={{fontSize:15,fontWeight:800,color:recoveryPresentation.session.toneHex,lineHeight:1.1}}>
                    {isRecoveryHydrating && recoveryPresentation.session.label === "Keine Daten"
                      ? <span style={{ display: "inline-block", width: 30, height: 13, borderRadius: 3, background: "rgba(255,255,255,0.08)", animation: "pulse 1.2s ease-in-out infinite", verticalAlign: "middle" }} />
                      : recoveryPresentation.session.label}
                  </div>
                </div>
                <div style={{padding:"6px 5px",textAlign:"center",borderRadius:12,background:"rgba(15,23,42,0.34)"}}>
                  <div style={{fontSize:10,textTransform:"uppercase",letterSpacing:"0.09em",color:"rgba(148,163,184,0.52)",fontWeight:700,marginBottom:3}}>Belastung</div>
                  <div style={{fontSize:15,fontWeight:800,color:weeklyFatigue.color,lineHeight:1}}>{weeklyFatigue.icon} {weeklyFatigue.label}</div>
                </div>
                <div style={{padding:"6px 5px",textAlign:"center",borderRadius:12,background:"rgba(15,23,42,0.34)"}}>
                  <div style={{fontSize:10,textTransform:"uppercase",letterSpacing:"0.09em",color:"rgba(148,163,184,0.52)",fontWeight:700,marginBottom:3}}>Serie</div>
                  <div style={{fontSize:16,fontWeight:800,color:"#c4b5fd",lineHeight:1}}>
                    {consistencyStats.sessionStreak}<span style={{fontSize:10,color:"rgba(148,163,184,0.48)",marginLeft:2}}>×</span>
                  </div>
                </div>
              </div>

              <div style={{display:"grid",gridTemplateColumns:"repeat(2,minmax(0,1fr))",gap:5}}>
                {[
                  { label: "Plan", value: `${prepProgressPct}%`, sub: "Fortschritt", color: "#10b981" },
                  { label: "km", value: `${Math.round(loggedRunKm)}`, sub: `${kmPct}%`, color: "#38bdf8" },
                  { label: "Long", value: `${doneLongRuns}/${longRuns}`, sub: "done", color: "#f59e0b" },
                  { label: "Quality", value: `${doneHardSessions}/${hardSessions}`, sub: "done", color: "#fb7185" },
                ].map(m=>(
                  <div
                    key={m.label}
                    style={{
                      padding: "7px 7px",
                      borderRadius: 12,
                      background: "rgba(15,23,42,0.28)",
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "center",
                      alignItems: "center",
                      textAlign: "center",
                      gap: 3,
                    }}
                  >
                    <div style={{fontSize:10,textTransform:"uppercase",letterSpacing:"0.08em",color:"rgba(148,163,184,0.48)",fontWeight:700}}>{m.label}</div>
                    <div style={{fontSize:16,fontWeight:800,color:m.color,lineHeight:1.05}}>{m.value}</div>
                    <div style={{fontSize:11,color:"rgba(148,163,184,0.5)"}}>{m.sub}</div>
                  </div>
                ))}
              </div>
            </div>

          </div>
          </div>
        </div>
      ):activeView==="week"?(
          <div
            style={{
              flex: 1,
              minHeight: 0,
              width: "100%",
              display: "flex",
              flexDirection: "column",
              padding: `${Math.max(2, compactScreen.screenPaddingY - 2)}px ${compactScreen.screenPaddingX}px`,
              boxSizing: "border-box",
              overflow: "hidden",
              ...viewTransitionStyle,
            }}
          >
            <div style={{ flexShrink: 0, background:"linear-gradient(160deg,rgba(16,19,39,0.96),rgba(12,15,28,0.92))",border:"1px solid rgba(148,163,184,0.1)",borderRadius:16,padding:"4px 6px 4px",boxShadow:"0 20px 40px rgba(2,6,23,0.22)"}}>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <button onClick={()=>setWIdx(i=>Math.max(0,i-1))} disabled={wIdx===0} style={{background:wIdx===0?"rgba(15,23,42,0.7)":"#1e293b",border:"1px solid rgba(148,163,184,0.12)",color:"#cbd5e1",width:36,height:36,borderRadius:11,cursor:wIdx===0?"not-allowed":"pointer",fontSize:17,display:"flex",alignItems:"center",justifyContent:"center"}}>‹</button>
                <div style={{flex:1,textAlign:"center",minWidth:0}}>
                  <span style={{display:"inline-block",padding:"3px 9px",borderRadius:999,fontSize:11,fontWeight:700,background:ph.bg,color:ph.col,marginBottom:4}}>{ph.emoji} {ph.label}</span>
                  <div style={{fontSize:17,fontWeight:800,color:"#fff",lineHeight:1.2}}>{w.label}</div>
                  <div style={{fontSize:12,color:"#7c8aa5",marginTop:2}}>{w.dates}</div>
                </div>
                <button onClick={()=>setWIdx(i=>Math.min(displayPlan.length-1,i+1))} disabled={wIdx===displayPlan.length-1} style={{background:wIdx===displayPlan.length-1?"rgba(15,23,42,0.7)":"#1e293b",border:"1px solid rgba(148,163,184,0.12)",color:"#cbd5e1",width:36,height:36,borderRadius:11,cursor:wIdx===displayPlan.length-1?"not-allowed":"pointer",fontSize:17,display:"flex",alignItems:"center",justifyContent:"center"}}>›</button>
              </div>

              <div style={{display:"grid",gridTemplateColumns:"repeat(2,minmax(0,1fr))",gap:3,marginTop:2}}>
                <div style={{minWidth:0}}>
                  <div style={{fontSize:10,textTransform:"uppercase",letterSpacing:"0.08em",color:"rgba(148,163,184,0.52)",fontWeight:700,marginBottom:2}}>Geplant (Lauf)</div>
                  <div style={{fontSize:18,fontWeight:800,color:"#38bdf8",lineHeight:1.1}}>{weekAnalysis.plannedKm} km</div>
                  <div style={{fontSize:11,color:"rgba(148,163,184,0.48)",marginTop:2}}>Woche</div>
                  {Math.abs(weekAnalysis.plannedLoadKm - weekAnalysis.plannedKm) > 0.05 ? (
                    <div style={{ fontSize: 10, color: "rgba(148,163,184,0.4)", marginTop: 3, lineHeight: 1.2 }}>
                      Trainingsvolumen: {formatKm(weekAnalysis.plannedLoadKm)} km
                    </div>
                  ) : null}
                </div>
                <div style={{minWidth:0}}>
                  <div style={{fontSize:10,textTransform:"uppercase",letterSpacing:"0.08em",color:"rgba(148,163,184,0.52)",fontWeight:700,marginBottom:2}}>Ist (Lauf, Health)</div>
                  <div style={{fontSize:18,fontWeight:800,color:"#10b981",lineHeight:1.1}}>{resolveWeekDisplayRunKm(weekHealthKpi.runKm, weekAnalysis.actualKm).toFixed(1)} km</div>
                  <div style={{fontSize:11,color:"rgba(148,163,184,0.48)",marginTop:2}}>{Math.round(clampPct(weekAnalysis.plannedKm > 0 ? (resolveWeekDisplayRunKm(weekHealthKpi.runKm, weekAnalysis.actualKm) / weekAnalysis.plannedKm) * 100 : 0))}% erledigt</div>
                  {weekHealthKpi.bikeKm > 0.05 ? (
                    <div style={{ fontSize: 10, color: "rgba(148,163,184,0.38)", marginTop: 4, lineHeight: 1.35 }}>
                      + Rad (Health): {weekHealthKpi.bikeKm.toFixed(1)} km · Gesamt: {weekHealthKpi.totalKm.toFixed(1)} km
                    </div>
                  ) : null}
                </div>
              </div>

              <div style={{marginTop:2}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",gap:8,fontSize:11,color:"#7c8aa5",marginBottom:2}}>
                  <span>Wochenfortschritt (Lauf)</span>
                  <span style={{fontWeight:700,color:"rgba(226,232,240,0.75)",whiteSpace:"nowrap"}}>{Math.round(clampPct(weekAnalysis.plannedKm > 0 ? (resolveWeekDisplayRunKm(weekHealthKpi.runKm, weekAnalysis.actualKm) / weekAnalysis.plannedKm) * 100 : 0))}%</span>
                </div>
                <div style={{height:6,background:"rgba(15,23,42,0.85)",borderRadius:999,overflow:"hidden"}}>
                  <div style={{height:"100%",background:"linear-gradient(90deg,#10b981,#38bdf8)",borderRadius:999,width:`${clampPct(weekAnalysis.plannedKm > 0 ? (resolveWeekDisplayRunKm(weekHealthKpi.runKm, weekAnalysis.actualKm) / weekAnalysis.plannedKm) * 100 : 0)}%`,transition:"width .3s"}}/>
                </div>
              </div>

              <div style={{display:"flex",gap:3,marginTop:2}}>
                <div style={{flex:1,minWidth:0,textAlign:"center",padding:"3px 4px",borderRadius:10,background:"rgba(10,14,26,0.55)",border:"1px solid rgba(148,163,184,0.08)"}}>
                  <div style={{fontSize:10,textTransform:"uppercase",letterSpacing:"0.08em",color:"rgba(148,163,184,0.48)",fontWeight:700,marginBottom:2}}>Einheiten</div>
                  <div style={{fontSize:15,fontWeight:800,color:"#e2e8f0",lineHeight:1.15}}>{weekAnalysis.doneSessions}/{weekAnalysis.plannedTrainSessions}</div>
                </div>
                <div style={{flex:1,minWidth:0,textAlign:"center",padding:"3px 4px",borderRadius:10,background:"rgba(10,14,26,0.55)",border:"1px solid rgba(148,163,184,0.08)"}}>
                  <div style={{fontSize:10,textTransform:"uppercase",letterSpacing:"0.08em",color:"rgba(148,163,184,0.48)",fontWeight:700,marginBottom:2}}>Intensiv</div>
                  <div style={{fontSize:15,fontWeight:800,color:"#fb7185",lineHeight:1.15}}>{weekAnalysis.intenseDone}/{weekAnalysis.intensePlanned}</div>
                </div>
              </div>
            </div>

            <div
              ref={weekSessionStackRef}
              style={{
                flex: 1,
                minHeight: 0,
                display: "flex",
                flexDirection: "column",
                justifyContent: weekHasExpandedSessionDesc ? "flex-start" : "space-evenly",
                gap: weekHasExpandedSessionDesc ? 4 : 0,
                marginTop: 2,
                overflowX: "hidden",
                overflowY: weekHasExpandedSessionDesc ? "auto" : "hidden",
                WebkitOverflowScrolling: "touch",
                overscrollBehaviorY: "contain",
              }}
            >
              {w.s.length === 0 && (
                <div style={{background:"rgba(11,16,28,0.94)",border:"1px solid rgba(148,163,184,0.1)",borderRadius:18,padding:18,fontSize:13,color:"#94a3b8",lineHeight:1.6}}>
                  Für diese Woche sind keine Einheiten im Plan hinterlegt.
                </div>
              )}
              {w.s.map(session=>{
                const ti=TI[session.type];
                const weekTitleColor = session.type === "rest" ? "#94a3b8" : ti?.col || "#fff";
                const log=logs[session.id];
                const status = getSessionStatus(log);
                const isDone=status==="done";
                const isSkipped=status==="skipped";
                const statusTone = getSessionStatusTone(log, ti.col);
                const milestones = getSessionMilestones(session, w, milestoneMeta);
                const hasHint = session.type !== "rest";
                const sessionDescText = (session.desc && String(session.desc).trim()) || "";
                const descExpanded = !!weekTabDescExpandedById[session.id];
                const sessionTargets =
                  session.type !== "rest" ? getSessionTargetLines(session, preferences.maxHeartRateBpm, w) : null;
                const weekLinkedEvalPrefix = getWeekLinkedRunFixedPrefix(log?.runEvaluation?.status);
                const weekCompact = !weekHasExpandedSessionDesc;
                const sessionRowWrap = weekHasExpandedSessionDesc
                  ? {
                      flex: "0 0 auto" as const,
                      minHeight: 0,
                      overflow: "visible" as const,
                      display: "flex" as const,
                      flexDirection: "column" as const,
                    }
                  : {
                      flex: "1 1 0%" as const,
                      minHeight: 0,
                      overflow: "hidden" as const,
                      display: "flex" as const,
                      flexDirection: "column" as const,
                    };
                const sessionCardShell = {
                  background:isDone
                    ?"linear-gradient(160deg,rgba(7,36,31,0.94),rgba(13,19,32,0.96))"
                    : isSkipped
                      ?"linear-gradient(160deg,rgba(40,14,14,0.9),rgba(18,18,30,0.96))"
                      :"linear-gradient(160deg,rgba(18,18,36,0.98),rgba(11,16,28,0.94))",
                  borderRadius: weekCompact ? 10 : 14,
                  display:"flex",
                  gap: weekCompact ? 4 : 8,
                  alignItems:"flex-start",
                  cursor:hasHint?"pointer":"default",
                  opacity:session.type==="rest"?0.78:1,
                  border:`1px solid ${isDone?"rgba(16,185,129,0.26)":isSkipped?"rgba(248,113,113,0.2)":"rgba(148,163,184,0.1)"}`,
                  boxShadow:isDone?"0 12px 30px rgba(16,185,129,0.08)":isSkipped?"0 12px 28px rgba(248,113,113,0.08)":"0 14px 32px rgba(2,6,23,0.16)",
                  minHeight: 0,
                };
                if (sessionDescText && !descExpanded) {
                  return(
                    <div key={session.id} style={sessionRowWrap} data-layout-week-card="1">
                    <div
                      onClick={()=>hasHint&&openModal(session)}
                      style={{...sessionCardShell,padding: weekCompact ? "3px 5px 3px" : "6px 9px 7px"}}
                    >
                      <div style={{width:34,flexShrink:0,textAlign:"center"}}>
                        <div style={{fontSize:10,fontWeight:800,color:"#94a3b8",textTransform:"uppercase",letterSpacing:"0.08em"}}>{session.day}</div>
                      </div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{display:"flex",flexWrap:"wrap",alignItems:"baseline",gap:"4px 10px",lineHeight:1.35}}>
                          <span style={{fontSize: weekCompact ? 13 : 15,fontWeight:700,color:weekTitleColor}}>{session.title}</span>
                          {(() => {
                            const displayPk = getDisplayPlannedDistanceKm(session);
                            return displayPk != null && displayPk > 0 ? (
                            <span style={{fontSize: weekCompact ? 12 : 14,fontWeight:700,color:"rgba(148,163,184,0.88)",whiteSpace:"nowrap"}}>
                              {`${formatKm(displayPk).toFixed(1)} km`}
                            </span>
                            ) : null;
                          })()}
                        </div>
                        {(session.type === "rest" || hasHint) ? (
                          <div style={{ fontSize: 10, color: "#64748b", marginTop: 4, lineHeight: 1.35, overflowWrap: "anywhere" }}>
                            <span style={{ fontWeight: 700 }}>Trainingsziele</span>
                            <span> · {getSessionTargetPreviewOneLiner(session, w)}</span>
                          </div>
                        ) : null}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setWeekTabDescExpandedById((prev) => ({ ...prev, [session.id]: true }));
                          }}
                          style={{
                            marginTop: weekCompact ? 3 : 6,
                            padding: 0,
                            border: "none",
                            background: "transparent",
                            cursor: "pointer",
                            fontSize: 12,
                            fontWeight: 700,
                            color: "#7dd3fc",
                            textAlign: "left",
                          }}
                        >
                          Mehr anzeigen
                        </button>
                      </div>
                    </div>
                    </div>
                  );
                }
                return(
                  <div key={session.id} style={sessionRowWrap} data-layout-week-card="1">
                  <div
                    onClick={()=>hasHint&&openModal(session)}
                    style={{...sessionCardShell,padding: weekCompact ? "4px 5px 4px" : "8px 9px 9px"}}
                  >
                    <div style={{width: weekCompact ? 28 : 36,flexShrink:0,textAlign:"center"}}>
                      <div style={{fontSize: weekCompact ? 9 : 10,fontWeight:800,color:"#94a3b8",textTransform:"uppercase",letterSpacing:"0.08em"}}>{session.day}</div>
                      <div style={{marginTop: weekCompact ? 2 : 4,width: weekCompact ? 30 : 36,height: weekCompact ? 28 : 36,borderRadius:10,background:`${ti.col}1a`,border:`1px solid ${ti.col}33`,display:"flex",alignItems:"center",justifyContent:"center",fontSize: weekCompact ? 14 : 16}}>{ti.emoji}</div>
                    </div>

                    <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", minHeight: 0 }}>
                      <div style={{display:"flex",justifyContent:"space-between",gap:8,alignItems:"flex-start",flexWrap:"wrap"}}>
                        <div style={{display:"flex",flexDirection:"column",gap:6,minWidth:0}}>
                          <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                            <span style={{fontSize:11,padding:"3px 8px",borderRadius:999,background:`${ti.col}22`,color:ti.col,fontWeight:700}}>{getSessionTypeLabel(session.type)}</span>
                            <span style={{fontSize:11,padding:"3px 8px",borderRadius:999,background:statusTone.background,color:statusTone.color,fontWeight:700,border:`1px solid ${statusTone.border}`}}>
                              {getSessionStatusLabel(log)}
                            </span>
                            {log?.assignedRun?.runId ? (
                              <span style={{fontSize:11,padding:"3px 8px",borderRadius:999,background:"rgba(56,189,248,0.14)",color:"#7dd3fc",fontWeight:700,border:"1px solid rgba(56,189,248,0.28)"}}>
                                {weekLinkedEvalPrefix ? `${weekLinkedEvalPrefix} · ` : ""}Mit Einheit verknüpft ✔
                              </span>
                            ) : log?.suggestedHealthRunId ? (
                              <span style={{fontSize:11,padding:"3px 8px",borderRadius:999,background:"rgba(251,191,36,0.14)",color:"#fcd34d",fontWeight:700,border:"1px solid rgba(251,191,36,0.28)"}}>Apple Health Lauf erkannt</span>
                            ) : null}
                            {milestones.map((milestone)=>(
                              <span key={milestone.label} style={{fontSize:11,padding:"3px 8px",borderRadius:999,background:`${milestone.color}1f`,color:milestone.color,fontWeight:700}}>
                                {milestone.emoji} {milestone.label}
                              </span>
                            ))}
                            {(() => {
                              const linkId = log?.assignedRun?.runId;
                              const linkedRun = linkId ? healthRunById.get(linkId) : undefined;
                              const ivs = linkedRun?.intervalIntensitySnapshot;
                              const showIv =
                                isDone &&
                                linkId &&
                                shouldUseIntervalScoring({
                                  sessionType: session.type,
                                  sessionTitle: session.title,
                                  planDescription: session.pace ?? null,
                                }) &&
                                typeof ivs?.intensityScore === "number";
                              return showIv ? (
                                <span
                                  style={{
                                    fontSize: 11,
                                    padding: "3px 8px",
                                    borderRadius: 999,
                                    background: "rgba(16,185,129,0.14)",
                                    color: "#6ee7b7",
                                    fontWeight: 700,
                                    border: "1px solid rgba(16,185,129,0.32)",
                                  }}
                                >
                                  Intervall {ivs!.intensityScore}/100
                                </span>
                              ) : null;
                            })()}
                          </div>
                          <div>
                            <div style={{fontSize: weekCompact ? 13 : 15,fontWeight:700,color:weekTitleColor,lineHeight:1.35}}>{session.title}</div>
                            <div style={{fontSize: weekCompact ? 10 : 12,color:"#7c8aa5",marginTop: weekCompact ? 1 : 3}}>{session.date}</div>
                          </div>
                        </div>
                        <div style={{display:"flex",alignItems:"center",gap:8}}>
                          {hasHint && !isDone && !isSkipped && <div style={{fontSize:11,color:"#4b5563",fontWeight:700,whiteSpace:"nowrap"}}>Details</div>}
                          {hasHint && (
                            <button
                              onClick={(e)=>{e.stopPropagation(); quickCompleteSession(session);}}
                              style={{
                                width:34,
                                height:34,
                                borderRadius:12,
                                border:`1px solid ${isDone?"rgba(16,185,129,0.28)":"rgba(148,163,184,0.14)"}`,
                                background:isDone?"rgba(16,185,129,0.18)":"rgba(15,23,42,0.82)",
                                color:isDone?"#86efac":"#cbd5e1",
                                cursor:"pointer",
                                fontSize:16,
                                fontWeight:800,
                                transition:"transform .18s ease, background .18s ease"
                              }}
                              aria-label={`${session.title} schnell als erledigt markieren`}
                            >
                              ✓
                            </button>
                          )}
                        </div>
                      </div>

                      <div style={{ ...weekSessionDetailScrollStyle, marginTop: 8, flex: "1 1 auto", minHeight: 0 }}>
                      {sessionDescText ? (
                        <div>
                          <div style={{ fontSize: 12, color: "#cbd5e1", lineHeight: 1.55 }}>{sessionDescText}</div>
                          {session.type === "rest" ? (
                            <div
                              style={{
                                marginTop: 10,
                                paddingTop: 8,
                                borderTop: "1px solid rgba(148,163,184,0.08)",
                                fontSize: 11,
                                color: "#64748b",
                                lineHeight: 1.45,
                              }}
                            >
                              <span style={{ fontWeight: 700, color: "rgba(100,116,139,0.95)" }}>Trainingsziele</span>
                              <span> · {getSessionTargetPreviewOneLiner(session, w)}</span>
                            </div>
                          ) : sessionTargets ? (
                            <div
                              style={{
                                marginTop: 10,
                                paddingTop: 8,
                                borderTop: "1px solid rgba(148,163,184,0.08)",
                              }}
                            >
                              <div
                                style={{
                                  fontSize: 11,
                                  color: "#64748b",
                                  lineHeight: 1.45,
                                  marginBottom: 8,
                                  overflowWrap: "anywhere",
                                }}
                              >
                                <span style={{ fontWeight: 700, color: "rgba(100,116,139,0.95)" }}>Trainingsziele</span>
                                <span style={{ fontWeight: 600 }}> · {getSessionTargetPreviewOneLiner(session, w)}</span>
                              </div>
                              <div style={{ fontSize: 11, color: "#64748b", lineHeight: 1.45 }}>{sessionTargets.pulseLabel}</div>
                              <div style={{ fontSize: 11, color: "#64748b", lineHeight: 1.45 }}>{sessionTargets.paceLabel}</div>
                              {sessionTargets.distanceLabel ? (
                                <div style={{ fontSize: 11, color: "#64748b", lineHeight: 1.45 }}>{sessionTargets.distanceLabel}</div>
                              ) : null}
                            </div>
                          ) : null}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setWeekTabDescExpandedById((prev) => ({ ...prev, [session.id]: false }));
                            }}
                            style={{
                              marginTop: 6,
                              padding: 0,
                              border: "none",
                              background: "transparent",
                              cursor: "pointer",
                              fontSize: 12,
                              fontWeight: 700,
                              color: "#7dd3fc",
                              textAlign: "left",
                            }}
                          >
                            Weniger anzeigen
                          </button>
                        </div>
                      ) : null}

                      <div style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:8}}>
                        {(() => {
                          const displayPk = getDisplayPlannedDistanceKm(session);
                          return displayPk != null && displayPk > 0 ? (
                          <div style={{fontSize:12,color:"#38bdf8",fontWeight:700}}>
                            Distanzziel: {`${formatKm(displayPk).toFixed(1)} km`}
                          </div>
                          ) : null;
                        })()}
                        {session.pace && <div style={{fontSize:12,color:"#c084fc",fontWeight:700}}>Tempoziel: {session.pace}</div>}
                      </div>

                      {!sessionDescText ? (
                        <div
                          style={{
                            marginTop: 8,
                            fontSize: 11,
                            color: "#64748b",
                            lineHeight: 1.45,
                            overflowWrap: "anywhere",
                          }}
                        >
                          <span style={{ fontWeight: 700, color: "rgba(100,116,139,0.95)" }}>Trainingsziele</span>
                          <span style={{ fontWeight: 600 }}> · {getSessionTargetPreviewOneLiner(session, w)}</span>
                        </div>
                      ) : null}

                      {log ? (
                        <div style={{marginTop:8,padding:"6px 8px",borderRadius:10,background:"rgba(15,23,42,0.5)",border:"1px solid rgba(148,163,184,0.08)"}}>
                          <div style={{fontSize:12,color:"#f8fafc",lineHeight:1.5}}>
                            {getSessionStatusLabel(log)}
                            {log.feeling > 0 ? ` · ${"★".repeat(log.feeling)}` : ""}
                            {log.actualKm ? ` · ${log.actualKm} km` : ""}
                            {log.notes
                              ? (() => {
                                  const raw = String(log.notes || "").replace(/\s+/g, " ").trim();
                                  if (!raw) return "";
                                  if (raw.length <= 80) return ` · ${raw}`;
                                  const clipped = raw.slice(0, 160);
                                  const i = Math.max(clipped.indexOf("."), clipped.indexOf("!"), clipped.indexOf("?"));
                                  if (i >= 20 && i <= 120) return ` · ${clipped.slice(0, i + 1).trim()}`;
                                  return "";
                                })()
                              : ""}
                          </div>
                        </div>
                      ) : null}
                      </div>
                    </div>
                  </div>
                  </div>
                );
              })}
            </div>

            <div
              style={{
                flexShrink: 0,
                marginTop: 2,
                display: "flex",
                justifyContent: "center",
                gap: 6,
                paddingTop: 4,
                paddingBottom: 4,
                flexWrap: "wrap",
              }}
            >
              {displayPlan.map((week,i)=>{
                const weekDone=week.s.filter(session=>isSessionLogDone(logs[session.id])).length;
                const weekSkipped=week.s.filter(session=>logs[session.id]?.skipped).length;
                const weekTotal=week.s.filter(session=>session.type!=="rest").length;
                const full=weekTotal>0&&weekDone===weekTotal;
                return(
                  <button key={week.wn} onClick={()=>setWIdx(i)} style={{width:i===wIdx?28:10,height:10,borderRadius:999,cursor:"pointer",background:i===wIdx?"#f8fafc":full?"#10b981":weekSkipped>0?"#f87171":weekDone>0?"#38bdf8":"#1e293b",border:"none",transition:"all .2s"}} aria-label={`Woche ${week.wn} öffnen`} />
                );
              })}
            </div>
          </div>
      ):activeView==="performance"?(
          <div
            style={{
              flex: 1,
              minHeight: 0,
              display: "flex",
              flexDirection: "column",
              gap: 8,
              padding: "8px 12px 14px",
              boxSizing: "border-box",
              overflowY: "auto",
              overflowX: "hidden",
              WebkitOverflowScrolling: "touch",
              ...viewTransitionStyle,
            }}
          >
            <div style={{ flexShrink: 0 }}>
              <MarathonPredictionCard
                variant="full"
                prediction={marathonPrediction}
                targetTimeLabel={targetTimeDisplay}
                confidenceLabel={marathonConfidenceLabel}
                coachHints={coachHints}
                weekProgress={
                  weekAnalysis.plannedKm > 0
                    ? {
                        plannedKm: weekAnalysis.plannedKm,
                        actualKm: resolveWeekDisplayRunKm(weekHealthKpi.runKm, weekAnalysis.actualKm),
                        plannedLoadKm: weekAnalysis.plannedLoadKm,
                      }
                    : null
                }
                recoveryBlendHint={
                  marathonPrediction.ready &&
                    uiRecoveryScore0_100 != null &&
                    uiRecoveryScore0_100 < 50
                    ? "Prognose leicht konservativ — Erholung unter 50."
                    : null
                }
              />
            </div>

            <div
              onTouchStart={(e) => e.stopPropagation()}
              onTouchMove={(e) => e.stopPropagation()}
              onTouchEnd={(e) => e.stopPropagation()}
            >
              <RecoveryVerlaufCard
                presentation={{
                  ...recoveryPresentation.verlauf,
                  load7dDisplay: homeRecoveryLoad7dDisplay,
                }}
                sleepStatus={sleepStatus}
                hrvStatus={hrvStatus}
                rhrStatus={rhrStatus}
              />
            </div>

          </div>
      ):activeView==="overview"?(
        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflowX: "hidden",
            overflowY: "auto",
            WebkitOverflowScrolling: "touch",
            padding: `${compactScreen.screenPaddingY}px ${compactScreen.screenPaddingX}px`,
            display: "flex",
            flexDirection: "column",
            gap: compactScreen.cardGap,
            ...viewTransitionStyle,
          }}
        >
          <SurfaceCard>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6,flexWrap:"wrap",gap:6}}>
              <div style={{fontSize:15,fontWeight:800,color:"#fff"}}>Alle Wochen</div>
              <div style={{fontSize:10,color:"#94a3b8"}}>Längster Lauf: {Math.round(longestLongRunKm)} km</div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: compactScreen.cardGap }}>
              {PHASE_ORDER.map((phaseKey)=>{
                const phaseWeeks=displayPlan.filter(week=>week.phase===phaseKey);
                if (phaseWeeks.length === 0) return null;
                const phase=PI[phaseKey];
                const expanded = !!overviewPhaseExpandedByKey[phaseKey];
                return(
                  <div
                    key={phaseKey}
                    style={{
                      borderRadius:14,
                      border:`1px solid ${phase.col}2a`,
                      background:"rgba(9,12,22,0.88)",
                      overflow:"hidden",
                      flexShrink:0,
                    }}
                  >
                    <div style={{padding:"6px 8px 6px"}}>
                      <div style={{fontSize:13,fontWeight:800,color:phase.col,lineHeight:1.25}}>{phase.emoji} {phase.label}</div>
                      <div style={{fontSize:10,color:"#94a3b8",marginTop:2,lineHeight:1.35}}>
                        {phaseWeeks.length} Wochen
                        {phaseWeeks.length > 0
                          ? ` · Woche ${phaseWeeks[0].wn}${phaseWeeks.length > 1 ? `–${phaseWeeks[phaseWeeks.length - 1].wn}` : ""}`
                          : ""}
                      </div>
                      <button
                        type="button"
                        onClick={()=>setOverviewPhaseExpandedByKey((prev)=>({ ...prev, [phaseKey]: !prev[phaseKey] }))}
                        style={{
                          width:"100%",
                          marginTop:4,
                          padding:"8px 10px",
                          minHeight:40,
                          boxSizing:"border-box",
                          border:"1px solid rgba(56,189,248,0.22)",
                          borderRadius:10,
                          background:"rgba(15,23,42,0.55)",
                          color:"#7dd3fc",
                          fontSize:11,
                          fontWeight:700,
                          cursor:"pointer",
                          textAlign:"center",
                        }}
                      >
                        {expanded ? "Weniger anzeigen" : "Mehr anzeigen"}
                      </button>
                    </div>
                    {expanded ? (
                      <div style={{display:"flex",flexDirection:"column",gap:8,padding:"0 6px 0 8px"}}>
                        {phaseWeeks.map(week=>{
                          const idx=displayPlan.indexOf(week);
                          const weekDone=week.s.filter(session=>isSessionLogDone(logs[session.id])).length;
                          const weekSkipped=week.s.filter(session=>logs[session.id]?.skipped).length;
                          const weekTotal=week.s.filter(session=>session.type!=="rest").length;
                          const weekPct=weekTotal > 0 ? Math.round((weekDone / weekTotal) * 100) : 0;
                          const weekRunKm = getWeekRunningDistanceKm(week);
                          const weekLoadKm = getWeekPlannedLoadKm(week);
                          // WARNING: week.km is legacy — peak-phase heuristic only (may not match session sum).
                          const phaseHasPeak = week.km >= 90;
                          return(
                            <button
                              key={week.wn}
                              onClick={()=>{setWIdx(idx);setView("week");}}
                              style={{background:"rgba(11,15,28,0.9)",borderRadius:12,padding:"8px 10px",display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer",border:"1px solid rgba(148,163,184,0.1)",textAlign:"left",flexShrink:0}}
                            >
                              <div style={{minWidth:0}}>
                                <div style={{fontSize:12,fontWeight:700,color:"#fff"}}>{week.label}</div>
                                <div style={{ fontSize: 10, color: "#7c8aa5", marginTop: 2 }}>
                                  {week.dates} · {formatKm(weekRunKm).toFixed(1)} km
                                  {Math.abs(weekLoadKm - weekRunKm) > 0.05 ? (
                                    <span style={{ display: "block", fontSize: 9, color: "rgba(148,163,184,0.45)", marginTop: 2 }}>
                                      Trainingsvolumen: {formatKm(weekLoadKm)} km
                                    </span>
                                  ) : null}
                                </div>
                                {phaseHasPeak ? <div style={{fontSize:10,color:"#10b981",marginTop:3,fontWeight:700}}>🔥 Peak Woche</div> : null}
                                {weekSkipped > 0 ? <div style={{fontSize:10,color:"#fca5a5",marginTop:3,fontWeight:700}}>⏭ {weekSkipped} ausgelassen</div> : null}
                              </div>
                              <div style={{display:"flex",alignItems:"center",gap:8,marginLeft:8}}>
                                <div style={{width:56,height:5,background:"#0b0f1c",borderRadius:999,overflow:"hidden"}}>
                                  <div style={{height:"100%",background:phase.col,borderRadius:999,width:`${weekPct}%`}}/>
                                </div>
                                <div style={{fontSize:12,fontWeight:700,color:phase.col,minWidth:36,textAlign:"right"}}>{weekDone}/{weekTotal}</div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </SurfaceCard>
        </div>
      ):activeView==="coach"?(
        <div style={{display:"flex",flexDirection:"column",flex:1,minHeight:0,gap:6,...viewTransitionStyle}}>
          <div style={{flex:1,minHeight:0,display:"flex",flexDirection:"column",padding:"0 10px"}}>
            <AiCoachPanel
              getContext={buildCurrentAiContext}
              onApplyPlanPatches={handleAiApplyPlanPatches}
              onReplaceTrainingPlanV2={handleAiReplaceTrainingPlanV2}
              onNavigate={handleAiNavigate}
              onSwapWorkoutsV2={handleSwapWorkoutsV2}
              onApplyPreferencesPatch={handleAiPreferencesPatch}
              messages={aiChatMessages}
              setMessages={setAiChatMessages}
            />
          </div>
        </div>
      ):activeView==="settings"?(
        <div style={{padding:"16px 16px 40px",display:"flex",flexDirection:"column",gap:10,overflowY:"auto",flex:1,minHeight:0,...viewTransitionStyle}}>
          <CollapsibleSettingsCard
            title="Einstellungen"
            subtitle="Zielzeit, Herzfrequenz"
            expanded={settingsCards.einstellungen}
            onToggle={() => toggleSettingsCard("einstellungen")}
          >
            {aiNavHint?.screen === "settings" && (
              <div style={{fontSize:11,color:"#7dd3fc",marginBottom:10,marginTop:12,background:"rgba(56,189,248,0.12)",border:"1px solid rgba(56,189,248,0.28)",borderRadius:10,padding:"8px 10px"}}>
                AI Navigation: {aiNavHint.section === "race_goal" ? "Rennziel" : aiNavHint.section}
              </div>
            )}
            <div style={{fontSize:11,textTransform:"uppercase",letterSpacing:"0.08em",color:"#7c8aa5",fontWeight:700,marginBottom:6,marginTop:12}}>Zielzeit</div>
            <input
              type="text"
              lang="de-DE"
              inputMode="text"
              value={preferences.targetTime}
              onChange={(e)=>setPreferences((prev)=>({...prev,targetTime:e.target.value}))}
              placeholder="2:49:50"
              style={{width:"100%",background:"#070b16",border:aiNavHint?.screen === "settings" && aiNavHint?.section === "race_goal" ? "1px solid rgba(56,189,248,0.5)" : "1px solid rgba(148,163,184,0.14)",borderRadius:12,padding:"11px 12px",color:"#e2e8f0",fontSize:16,boxSizing:"border-box",marginBottom:6,boxShadow:aiNavHint?.screen === "settings" && aiNavHint?.section === "race_goal" ? "0 0 0 2px rgba(56,189,248,0.2)" : "none"}}
            />
            <div style={{fontSize:11,color:"#64748b"}}>Format: hh:mm:ss</div>

            <div style={{fontSize:11,textTransform:"uppercase",letterSpacing:"0.08em",color:"#7c8aa5",fontWeight:700,marginBottom:6,marginTop:14}}>
              Max. Herzfrequenz (optional)
            </div>
            <input
              type="number"
              inputMode="numeric"
              min={120}
              max={230}
              placeholder="z. B. 178"
              value={
                preferences.maxHeartRateBpm != null && Number.isFinite(preferences.maxHeartRateBpm)
                  ? String(preferences.maxHeartRateBpm)
                  : ""
              }
              onChange={(e) => {
                const raw = e.target.value.trim();
                if (raw === "") {
                  setPreferences((prev) => {
                    const next = { ...prev };
                    delete next.maxHeartRateBpm;
                    return next;
                  });
                  return;
                }
                const n = Number.parseInt(raw, 10);
                if (!Number.isFinite(n) || n < 1) return;
                setPreferences((prev) => ({ ...prev, maxHeartRateBpm: n }));
              }}
              style={{
                width: "100%",
                background: "#070b16",
                border: "1px solid rgba(148,163,184,0.14)",
                borderRadius: 12,
                padding: "11px 12px",
                color: "#e2e8f0",
                fontSize: 16,
                boxSizing: "border-box",
                marginBottom: 6,
              }}
            />
            <div style={{fontSize:11,color:"#64748b",lineHeight:1.45}}>
              Für konkrete Pulsbereiche, Trainingsziele und die Puls-Abweichung in „Plan vs. Ist“. Leer lassen, wenn unbekannt.
            </div>
          </CollapsibleSettingsCard>

          <CollapsibleSettingsCard
            title="Meine Trainingspläne"
            subtitle={`${allTrainingPlans.length}/5 Pläne`}
            expanded={settingsCards.trainingPlans}
            onToggle={() => toggleSettingsCard("trainingPlans")}
          >
            <PlanSwitcher
              plans={allTrainingPlans}
              onSwitch={(planId) => void handleSwitchPlan(planId)}
              onAddNew={handleAddNewPlan}
              onDelete={(planId) => void handleDeletePlan(planId)}
            />
          </CollapsibleSettingsCard>

          <CollapsibleSettingsCard
            title="Teilen"
            subtitle="Trainingsübersicht exportieren"
            expanded={settingsCards.teilen}
            onToggle={() => toggleSettingsCard("teilen")}
          >
            <div style={{fontSize:12,color:"#cbd5e1",lineHeight:1.7,whiteSpace:"pre-line",marginTop:12}}>{shareSummary}</div>
            <button
              type="button"
              onClick={copyShareSummary}
              style={{marginTop:12,background:"rgba(56,189,248,0.18)",color:"#dbeafe",border:"1px solid rgba(56,189,248,0.28)",borderRadius:12,padding:"10px 12px",cursor:"pointer",fontSize:12,fontWeight:700}}
            >
              Zusammenfassung kopieren
            </button>
            {shareFeedback ? <div style={{fontSize:11,color:"#94a3b8",marginTop:8}}>{shareFeedback}</div> : null}
          </CollapsibleSettingsCard>

          {Capacitor.getPlatform() === "ios" ? (
            <CollapsibleSettingsCard
              title="Apple Health"
              subtitle={isHealthConnected ? "Verbunden · Aktivitäten zuordnen" : "Nicht verbunden"}
              expanded={settingsCards.appleHealth}
              onToggle={() => toggleSettingsCard("appleHealth")}
            >
              <div style={{marginTop:12}}>
              <div style={{fontSize:11,textTransform:"uppercase",letterSpacing:"0.08em",color:"#7c8aa5",fontWeight:700,marginBottom:10}}>Apple Health · Lauf zuordnen</div>
              {healthKitAvailable === null ? (
                <div style={{fontSize:12,color:"#94a3b8",marginBottom:8}}>Apple Health wird geprüft …</div>
              ) : null}
              {healthKitAvailable === false ? (
                <div style={{fontSize:12,color:"#fca5a5",marginBottom:8}}>Apple Health ist auf diesem Gerät nicht verfügbar.</div>
              ) : null}
              <div
                style={{
                  fontSize:13,
                  fontWeight:700,
                  marginBottom:8,
                  color:isHealthConnected ? "#86efac" : "#94a3b8",
                  lineHeight:1.45,
                }}
              >
                {isHealthConnected ? "Apple Health ist verbunden" : "Nicht verbunden — tippe auf „Apple Health verbinden“"}
              </div>
              <>
              {appleHealthFetchStats ? (
                <div style={{fontSize:12,color:"#94a3b8",marginBottom:8,lineHeight:1.5}}>
                  <div>Gesamt (Health): {appleHealthFetchStats.fetchedTotal}</div>
                  <div>Lauf: {appleHealthFetchStats.runningCount} · Rad: {appleHealthFetchStats.cyclingCount}</div>
                  <div>Übernommen: {appleHealthFetchStats.syncedTotal}</div>
                  {appleHealthFetchStats.unknownDistanceCount > 0 ? (
                    <div style={{marginTop:4,opacity:0.95}}>
                      Keine Distanz in Health: {appleHealthFetchStats.unknownDistanceCount}
                    </div>
                  ) : null}
                  {appleHealthFetchStats.ignoredCount > 0 ? (
                    <div style={{marginTop:4,opacity:0.95}}>
                      Ignoriert: {appleHealthFetchStats.ignoredCount}
                    </div>
                  ) : null}
                </div>
              ) : null}
              {appleHealthFetchStats?.missingCyclingDistance ? (
                <div style={{fontSize:12,color:"#fbbf24",marginBottom:10,lineHeight:1.45}}>
                  Rad-Aktivitäten werden importiert, aber Distanz ist ggf. nicht lesbar. In iOS: Einstellungen › Gesundheit › Datenzugriff › diese App › „Radfahren + Distanz“ erlauben.
                </div>
              ) : null}
              {appleHealthFetchStats && appleHealthFetchStats.fetchedTotal === 0 ? (
                <div style={{fontSize:12,color:"#fca5a5",marginBottom:10,lineHeight:1.45}}>
                  Keine Apple-Health-Workouts im Zeitraum gefunden. Bitte Aktivitäten aufzeichnen und dann aktualisieren.
                </div>
              ) : null}
              {appleHealthFetchStats &&
              appleHealthFetchStats.fetchedTotal > 0 &&
              appleHealthFetchStats.syncedTotal === 0 ? (
                <div style={{fontSize:12,color:"#fbbf24",marginBottom:10,lineHeight:1.45}}>
                  HealthKit hat Workouts geliefert, aber keine Lauf-/Rad-Typen erkannt. Bitte Gesamt- und Filter-Zähler oben prüfen.
                </div>
              ) : null}
              <div style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:8}}>
                {!isHealthConnected ? (
                  <button
                    type="button"
                    onClick={() => handleAppleHealthConnectInSettings()}
                    disabled={healthAppleConnectBusy || healthKitAvailable !== true}
                    style={{
                      background:"rgba(16,185,129,0.16)",
                      border:"1px solid rgba(52,211,153,0.4)",
                      borderRadius:12,
                      padding:"10px 14px",
                      color:"#6ee7b7",
                      fontSize:13,
                      fontWeight:700,
                      cursor:healthAppleConnectBusy || healthKitAvailable !== true ? "default" : "pointer",
                      opacity:healthAppleConnectBusy || healthKitAvailable !== true ? 0.55 : 1,
                    }}
                  >
                    {healthAppleConnectBusy ? "Verbinde …" : "Apple Health verbinden"}
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => reloadHealthRunsFromApple()}
                  disabled={healthRunsFetchBusy || healthKitAvailable !== true}
                  style={{
                    background:"rgba(56,189,248,0.18)",
                    border:"1px solid rgba(56,189,248,0.35)",
                    borderRadius:12,
                    padding:"10px 14px",
                    color:"#7dd3fc",
                    fontSize:13,
                    fontWeight:700,
                    cursor:healthRunsFetchBusy || healthKitAvailable !== true ? "default" : "pointer",
                    opacity:healthRunsFetchBusy || healthKitAvailable !== true ? 0.55 : 1,
                  }}
                >
                  {healthRunsFetchBusy ? "Aktualisiere …" : "Aktivitäten aktualisieren"}
                </button>
                <button
                  type="button"
                  onClick={() => reloadHealthRunsFromApple({ forceLastThreeCalendarDays: true })}
                  disabled={healthRunsFetchBusy || healthKitAvailable !== true}
                  style={{
                    background:"rgba(167,139,250,0.15)",
                    border:"1px solid rgba(167,139,250,0.35)",
                    borderRadius:12,
                    padding:"10px 14px",
                    color:"#ddd6fe",
                    fontSize:13,
                    fontWeight:700,
                    cursor:healthRunsFetchBusy || healthKitAvailable !== true ? "default" : "pointer",
                    opacity:healthRunsFetchBusy || healthKitAvailable !== true ? 0.55 : 1,
                  }}
                  title="Lädt die letzten drei Kalendertage neu (ohne persistierten Anchor; hilft wenn ein Workout fehlt)."
                >
                  {healthRunsFetchBusy ? "Lade …" : "3 Tage neu laden"}
                </button>
              </div>
              <button
                type="button"
                aria-hidden
                tabIndex={-1}
                onClick={() => void runDebugAppleHealth180DayBackfill()}
                disabled={healthRunsFetchBusy || healthKitAvailable !== true}
                style={{
                  display: "block",
                  width: "100%",
                  height: 44,
                  marginTop: 2,
                  padding: 0,
                  border: "none",
                  background: "red",
                  cursor: healthRunsFetchBusy || healthKitAvailable !== true ? "default" : "pointer",
                  opacity: 0.5,
                }}
              />
              <button
                type="button"
                aria-hidden
                tabIndex={-1}
                onClick={() => {
                  try {
                    localStorage.removeItem(MIGRATION_TO_SUPABASE_DONE_KEY);
                  } catch {
                    // ignore
                  }
                  window.location.reload();
                }}
                style={{
                  display: "block",
                  width: "100%",
                  height: 10,
                  marginTop: 2,
                  padding: 0,
                  border: "none",
                  background: "transparent",
                  cursor: "pointer",
                  opacity: 0.05,
                }}
              />
              {appleHealthConnectFeedback ? (
                <div
                  style={{
                    fontSize:12,
                    lineHeight:1.45,
                    marginBottom:8,
                    color:appleHealthConnectFeedback.tone === "ok" ? "#86efac" : "#fca5a5",
                    fontWeight:650,
                  }}
                >
                  {appleHealthConnectFeedback.text}
                </div>
              ) : null}
              {appleHealthLoadFeedback ? (
                <div
                  style={{
                    fontSize:12,
                    lineHeight:1.45,
                    marginBottom:10,
                    color:appleHealthLoadFeedback.tone === "ok" ? "#86efac" : "#fca5a5",
                    fontWeight:650,
                  }}
                >
                  {appleHealthLoadFeedback.text}
                </div>
              ) : null}
              {!homeRunSession ? (
                <div style={{fontSize:13,color:"#94a3b8",lineHeight:1.5,marginBottom:10}}>
                  Heute ist keine Trainingseinheit geplant – du kannst Läufe trotzdem einer beliebigen Plan-Einheit zuordnen.
                </div>
              ) : null}
              {healthRuns.length === 0 ? (
                <div style={{display:"flex",flexDirection:"column",gap:12}}>
                  <div style={{fontSize:13,color:"#e2e8f0",fontWeight:650}}>
                    {appleHealthFetchStats && appleHealthFetchStats.fetchedTotal === 0
                      ? "Keine Aktivitäten in den letzten 7 Tagen gefunden."
                      : appleHealthFetchStats && appleHealthFetchStats.fetchedTotal > 0 && appleHealthFetchStats.syncedTotal === 0
                        ? "Keine Lauf-/Rad-Aktivitäten im Abfragezeitraum (siehe Hinweis oben)."
                        : appleHealthFetchStats == null
                          ? "Noch keine Aktivitäten geladen — „Aktivitäten aktualisieren“ tippen."
                          : "Keine Lauf-/Rad-Daten in der App — oben Total/Import prüfen."}
                  </div>
                </div>
              ) : selectionOptions.length === 0 ? (
                <div style={{display:"flex",flexDirection:"column",gap:12}}>
                  <div style={{fontSize:13,color:"#94a3b8",lineHeight:1.5}}>
                    Keine Lauf- oder Rennrad-Einträge im Store (nur &quot;andere&quot; Health-Typen?) — Workout-Typen prüfen.
                  </div>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ fontSize: 12, color: "#7c8aa5", fontWeight: 700 }}>
                    Aktivitäten (Lauf &amp; Rennrad, neueste zuerst)
                  </div>
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 10,
                      maxHeight: 480,
                      overflowY: "auto",
                      WebkitOverflowScrolling: "touch",
                    }}
                  >
                    {selectionOptions.map((workout, workoutIndex) => {
                    const kmNum = storedHealthRunDistanceKmNumeric(workout);
                    const canonicalType = getStoredHealthRunCanonicalType(workout);
                    const kindShort = workoutLabelDeFromCanonical(canonicalType);
                    const dateLabel = formatWorkoutSelectionDate(workout.startDate);
                    const durSec =
                      typeof workout.duration === "number" && Number.isFinite(workout.duration)
                        ? workout.duration
                        : 0;
                    const durMin = durSec > 0 ? Math.max(1, Math.round(durSec / 60)) : null;
                    const linkedLabel = planRowLabelForAssignedRun(workout.runId, logs, ALL_SESSIONS);
                    const pickerOpen = healthSessionPickWorkoutId === workout.runId;
                    return (
                      <div
                        key={`apple-health-settings-${workoutIndex}-${workout.runId}-${workout.startDate}`}
                        style={{
                          fontSize:13,
                          color:"#cbd5e1",
                          lineHeight:1.55,
                          background:"rgba(15,23,42,0.75)",
                          border:"1px solid rgba(56,189,248,0.2)",
                          borderRadius:14,
                          padding:"10px 12px",
                          display:"flex",
                          flexDirection:"column",
                          gap:8,
                        }}
                      >
                        <div style={{ fontSize: 14, fontWeight: 800, color: "#e2e8f0" }}>{kindShort}</div>
                        <div style={{ fontSize: 13, color: "#e2e8f0" }}>{dateLabel}</div>
                        <div style={{ fontSize: 13, color: "#94a3b8" }}>
                          {durMin != null ? `Dauer: ca. ${durMin} Min.` : "Dauer: —"}
                        </div>
                        <div>
                          <span style={{color:"#7c8aa5"}}>Typ:</span> {appleHealthWorkoutKindLabel(workout.workoutType)}
                        </div>
                        <div>
                          <span style={{color:"#7c8aa5"}}>Distanz:</span>{" "}
                          {kmNum != null && kmNum > 0 ? `${kmNum.toFixed(2)} km` : "—"}
                          {workout.distanceUnknown ? (
                            <span style={{color:"#94a3b8",fontSize:11,marginLeft:6}}>(nicht von Health)</span>
                          ) : null}
                        </div>
                        {linkedLabel ? (
                          <div style={{fontSize:12,color:"#86efac",fontWeight:650}}>Bereits verknüpft: {linkedLabel}</div>
                        ) : null}
                        <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
                          <button
                            type="button"
                            onClick={() =>
                              setHealthSessionPickWorkoutId((prev) =>
                                prev === workout.runId ? null : workout.runId,
                              )
                            }
                            style={{
                              alignSelf:"flex-start",
                              background:"rgba(56,189,248,0.22)",
                              border:"1px solid rgba(56,189,248,0.45)",
                              borderRadius:12,
                              padding:"8px 12px",
                              color:"#e0f2fe",
                              fontSize:13,
                              fontWeight:800,
                              cursor:"pointer",
                            }}
                          >
                            Training wählen
                          </button>
                          {linkedLabel ? (
                            <button
                              type="button"
                              onClick={() => void clearHealthRunAssignmentByRunId(workout.runId)}
                              style={{
                                alignSelf:"flex-start",
                                background:"rgba(15,23,42,0.85)",
                                border:"1px solid rgba(148,163,184,0.2)",
                                borderRadius:12,
                                padding:"8px 12px",
                                color:"#cbd5e1",
                                fontSize:13,
                                fontWeight:700,
                                cursor:"pointer",
                              }}
                            >
                              Verknüpfung aufheben
                            </button>
                          ) : null}
                        </div>
                        {pickerOpen ? (
                          <div
                            style={{
                              marginTop:4,
                              paddingTop:10,
                              borderTop:"1px solid rgba(148,163,184,0.12)",
                              display:"flex",
                              flexDirection:"column",
                              gap:6,
                              maxHeight:220,
                              overflowY:"auto",
                            }}
                          >
                            <div style={{fontSize:11,color:"#7c8aa5",fontWeight:700}}>Plan-Einheit wählen</div>
                            {healthLinkAssignmentUi &&
                            healthLinkAssignmentUi.pickerWorkout.runId === workout.runId
                              ? healthLinkAssignmentUi.assignableSessions.map((sess) => {
                                  const lg = logs[sess.id];
                                  const arId = lg?.assignedRun?.runId;
                                  const kindDe = healthLinkAssignmentBucketLabelDe(sess.type);
                                  const rowLabel = `${sess.day}, ${sess.date} – ${sess.title}`;
                                  const isThisWorkout = arId === workout.runId;
                                  const hasOther = arId && arId !== workout.runId;
                                  const workoutToAssign = healthLinkAssignmentUi.pickerWorkout;
                                  return (
                                    <button
                                      key={sess.id}
                                      type="button"
                                      onClick={() => {
                                        void assignHealthRunToSession(sess, workoutToAssign).then(() =>
                                          setHealthSessionPickWorkoutId(null),
                                        );
                                      }}
                                      style={{
                                        textAlign:"left",
                                        background:"rgba(9,13,24,0.9)",
                                        border:"1px solid rgba(56,189,248,0.18)",
                                        borderRadius:10,
                                        padding:"8px 10px",
                                        color:"#e2e8f0",
                                        fontSize:12,
                                        fontWeight:650,
                                        cursor:"pointer",
                                        lineHeight:1.4,
                                      }}
                                    >
                                      <span style={{ color: "#7dd3fc", fontWeight: 800 }}>{kindDe}</span>
                                      {" · "}
                                      {rowLabel}
                                      {isThisWorkout ? " · diese Aktivität" : null}
                                      {hasOther ? " · andere Zuordnung wird ersetzt" : null}
                                    </button>
                                  );
                                })
                              : null}
                            <button
                              type="button"
                              onClick={() => setHealthSessionPickWorkoutId(null)}
                              style={{
                                alignSelf:"flex-start",
                                marginTop:4,
                                background:"transparent",
                                border:"1px solid rgba(148,163,184,0.25)",
                                borderRadius:10,
                                padding:"6px 10px",
                                color:"#94a3b8",
                                fontSize:12,
                                fontWeight:700,
                                cursor:"pointer",
                              }}
                            >
                              Abbrechen
                            </button>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                  </div>
                  {homeRunSession && dashboardHealthDone ? (
                    <button
                      type="button"
                      onClick={() => clearHealthRunAssignment(homeRunSession)}
                      style={{
                        alignSelf:"flex-start",
                        background:"rgba(15,23,42,0.85)",
                        border:"1px solid rgba(148,163,184,0.2)",
                        borderRadius:12,
                        padding:"10px 14px",
                        color:"#cbd5e1",
                        fontSize:13,
                        fontWeight:700,
                        cursor:"pointer",
                      }}
                    >
                      Zuordnung für heute zurücksetzen
                    </button>
                  ) : null}
                </div>
              )}
              </>
              </div>
            </CollapsibleSettingsCard>
          ) : null}

          <CollapsibleSettingsCard
            title="Race Calculator"
            subtitle="Pace, Splits, Halbmarathon"
            expanded={settingsCards.raceCalc}
            onToggle={() => toggleSettingsCard("raceCalc")}
          >
            <div style={{marginTop:12}}>
              <RaceCalculator noCard />
            </div>
          </CollapsibleSettingsCard>

          <CollapsibleSettingsCard
            title="Backup"
            subtitle="Daten sichern & wiederherstellen"
            expanded={settingsCards.backup}
            onToggle={() => toggleSettingsCard("backup")}
          >
            <div style={{marginTop:12}}>
              <BackupControls logs={logs} onImportSuccess={handleBackupLogsImport} />
            </div>
          </CollapsibleSettingsCard>

          <button
            type="button"
            onClick={() => {
              void signOut();
            }}
            style={{
              marginTop: 8,
              width: "100%",
              padding: "13px 16px",
              fontSize: 14,
              fontWeight: 700,
              borderRadius: 12,
              cursor: "pointer",
              background: "rgba(239, 68, 68, 0.1)",
              border: "1px solid rgba(239, 68, 68, 0.32)",
              color: "#fca5a5",
            }}
          >
            Abmelden
          </button>

          {user?.id ? (
            <button
              type="button"
              disabled={accountDeleteBusy}
              onClick={() => {
                setAccountDeleteError(null);
                setAccountDeleteStep(1);
              }}
              style={{
                marginTop: 10,
                marginBottom: 8,
                width: "100%",
                padding: "13px 16px",
                fontSize: 14,
                fontWeight: 700,
                borderRadius: 12,
                cursor: accountDeleteBusy ? "not-allowed" : "pointer",
                opacity: accountDeleteBusy ? 0.6 : 1,
                background: "rgba(220, 38, 38, 0.14)",
                border: "1px solid rgba(220, 38, 38, 0.45)",
                color: "#f87171",
              }}
            >
              Account löschen
            </button>
          ) : null}
        </div>
      ):null}

      </div>

      </div>

      {postWorkoutSummary.visible && postWorkoutSummaryDisplay ? (
        <PostWorkoutSummaryCard
          open={postWorkoutSummary.visible}
          summary={postWorkoutSummaryDisplay}
          onDone={postWorkoutSummary.dismiss}
        />
      ) : null}

      <div style={{position:"fixed",left:"calc(12px + env(safe-area-inset-left, 0px))",right:"calc(12px + env(safe-area-inset-right, 0px))",bottom:"calc(12px + env(safe-area-inset-bottom, 0px))",zIndex:90}}>
        <div style={{display:"grid",gridTemplateColumns:"repeat(6,minmax(0,1fr))",gap:6,background:"rgba(9,12,22,0.72)",border:"1px solid rgba(148,163,184,0.08)",borderRadius:24,padding:"10px 8px 11px",boxShadow:"0 20px 50px rgba(2,6,23,0.32)",backdropFilter:"blur(22px)"}}>
          {[
            { key: "home", label: homeTabLabel, icon: null },
            { key: "week", label: "Woche", icon: "▤" },
            { key: "performance", label: "Leistung", icon: "◔" },
            { key: "overview", label: "Übersicht", icon: "◎" },
            { key: "coach", label: "AI Coach", icon: "✦" },
            { key: "settings", label: "Einstellungen", icon: "⚙" },
          ].map((item)=>{
            const active = activeView === item.key;
            return (
              <button
                className="bottom-nav-btn"
                key={item.key}
                onClick={()=>navigateToView(item.key)}
                style={{
                  background:active ? "linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))" : "transparent",
                  border:"1px solid transparent",
                  color:active ? "#fff" : "rgba(148,163,184,0.88)",
                  borderRadius:18,
                  padding:"6px 6px 6px",
                  margin:0,
                  cursor:"pointer",
                  display:"flex",
                  flexDirection:"column",
                  alignItems:"center",
                  justifyContent:"center",
                  gap:4,
                }}
                aria-label={`${item.label} öffnen`}
              >
                {item.key === "home" ? (
                  /^\d+$/.test(item.label) ? (
                    <span
                      aria-hidden
                      style={{
                        fontSize:24,
                        fontWeight:900,
                        color:active ? "#fff" : "rgba(148,163,184,0.88)",
                        lineHeight:1,
                        letterSpacing:"-0.03em",
                        flexShrink:0,
                      }}
                    >
                      {item.label}
                    </span>
                  ) : item.label !== "HOME" && item.label !== "START" ? (
                    <span
                      aria-hidden
                      style={{
                        fontSize:20,
                        lineHeight:1,
                        flexShrink:0,
                        opacity:active ? 1 : 0.82,
                      }}
                    >
                      {item.label}
                    </span>
                  ) : null
                ) : item.icon != null ? (
                  <span
                    aria-hidden
                    style={{
                      width:16,
                      height:16,
                      display:"flex",
                      alignItems:"center",
                      justifyContent:"center",
                      fontSize:16,
                      lineHeight:1,
                      flexShrink:0,
                      opacity:active ? 1 : 0.82,
                    }}
                  >
                    {item.icon}
                  </span>
                ) : null}
                {item.key !== "home" && (
                  <span style={{fontSize:item.key === "settings" || item.key === "coach" ? 8.8 : 10,fontWeight:800,opacity:active ? 1 : 0.7,letterSpacing:"0",whiteSpace:"nowrap",margin:0,lineHeight:1}}>
                    {item.label}
                  </span>
                )}
                <span style={{width:4,height:4,borderRadius:"50%",background:active ? "#fff" : "transparent",flexShrink:0,margin:0,boxShadow:active ? "0 0 10px rgba(255,255,255,0.5)" : "none"}} />
              </button>
            );
          })}
        </div>
      </div>

      {modal&&modalWeek&&modalWorkout&&(modalCompletionSummaryDisplay ? (
        <PostWorkoutSummaryCard open summary={modalCompletionSummaryDisplay} onDone={closeModal} />
      ) : (
        <div onClick={closeModal} style={{position:"fixed",inset:0,background:"rgba(2,6,23,0.82)",display:"flex",alignItems:"stretch",justifyContent:"center",padding:0,zIndex:1000}}>
          <div onClick={e=>e.stopPropagation()} style={{background:"linear-gradient(180deg,#0c1020 0%, #090d18 100%)",width:"100%",maxWidth:720,height:"100%",overflowY:"auto",borderLeft:"1px solid rgba(148,163,184,0.12)",borderRight:"1px solid rgba(148,163,184,0.12)"}}>
            <div style={{padding:"calc(18px + max(0px, env(safe-area-inset-top, 0px))) 16px 140px",display:"flex",flexDirection:"column",gap:14}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:12}}>
                <div>
                  <div style={{fontSize:11,textTransform:"uppercase",letterSpacing:"0.12em",color:"#7c8aa5",fontWeight:700,marginBottom:8}}>Session Details</div>
                  <div style={{fontSize:24,fontWeight:800,color:"#fff",lineHeight:1.15}}>{modal.title}</div>
                  <div style={{fontSize:12,color:"#94a3b8",marginTop:6}}>{modal.day}, {modal.date} · {modalWeek.label}</div>
                </div>
                <button onClick={closeModal} style={{background:"rgba(15,23,42,0.8)",border:"1px solid rgba(148,163,184,0.12)",color:"#cbd5e1",borderRadius:12,padding:"10px 12px",cursor:"pointer",fontSize:13}}>Schließen</button>
              </div>

              <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                <span style={{fontSize:11,padding:"5px 10px",borderRadius:999,background:`${TI[modal.type].col}22`,color:TI[modal.type].col,fontWeight:700}}>{TI[modal.type].emoji} {getSessionTypeLabel(modal.type)}</span>
                {(() => {
                  const effLog = { ...(logs[modal.id] || {}), ...form, assignedRun: logs[modal.id]?.assignedRun };
                  const st = getSessionStatusTone(effLog, TI[modal.type].col);
                  return (
                    <span style={{fontSize:11,padding:"5px 10px",borderRadius:999,background:st.background,color:st.color,fontWeight:700,border:`1px solid ${st.border}`}}>
                      {getSessionStatusLabel(effLog)}
                    </span>
                  );
                })()}
                {logs[modal.id]?.assignedRun?.runId ? (
                  <span style={{fontSize:11,padding:"5px 10px",borderRadius:999,background:"rgba(56,189,248,0.14)",color:"#7dd3fc",fontWeight:700}}>Apple Health · {logs[modal.id].assignedRun.distanceKm} km</span>
                ) : null}
                {modal.type !== "rest" ? (
                  <span
                    style={{
                      fontSize: 11,
                      padding: "5px 10px",
                      borderRadius: 999,
                      background: logs[modal.id]?.assignedRun?.runId ? "rgba(16,185,129,0.14)" : "rgba(148,163,184,0.08)",
                      color: logs[modal.id]?.assignedRun?.runId ? "#86efac" : "#cbd5e1",
                      fontWeight: 700,
                      border: `1px solid ${logs[modal.id]?.assignedRun?.runId ? "rgba(16,185,129,0.24)" : "rgba(148,163,184,0.14)"}`,
                    }}
                  >
                    {(() => {
                      const ar = logs[modal.id]?.assignedRun;
                      if (ar?.runId) {
                        const t = typeof ar.startDate === "string" && ar.startDate ? new Date(ar.startDate) : null;
                        const ts = t && Number.isFinite(t.getTime()) ? ` · ${t.toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}` : "";
                        return `Apple Health: verknüpft${ts}`;
                      }
                      return "Apple Health: nicht verknüpft";
                    })()}
                  </span>
                ) : null}
                {(() => {
                  const displayPk = getDisplayPlannedDistanceKm(modal);
                  return displayPk != null && displayPk > 0 ? (
                  <span style={{fontSize:11,padding:"5px 10px",borderRadius:999,background:"rgba(56,189,248,0.14)",color:"#38bdf8",fontWeight:700}}>
                    Distanzziel: {`${formatKm(displayPk).toFixed(1)} km`}
                  </span>
                  ) : null;
                })()}
                {modal.pace && <span style={{fontSize:11,padding:"5px 10px",borderRadius:999,background:"rgba(168,85,247,0.14)",color:"#c084fc",fontWeight:700}}>Tempoziel: {modal.pace}</span>}
                {modalMilestones.map((milestone)=>(
                  <span key={milestone.label} style={{fontSize:11,padding:"5px 10px",borderRadius:999,background:`${milestone.color}1f`,color:milestone.color,fontWeight:700}}>
                    {milestone.emoji} {milestone.label}
                  </span>
                ))}
              </div>

              {modal.type !== "rest" ? (
                <div style={{ marginTop: 2 }}>
                  <div
                    style={{
                      fontSize: 11,
                      color: "#64748b",
                      marginTop: 6,
                      lineHeight: 1.45,
                      overflowWrap: "anywhere",
                      minWidth: 0,
                    }}
                  >
                    <span style={{ fontWeight: 700, color: "rgba(100,116,139,0.95)" }}>Trainingsziele</span>
                    <span style={{ fontWeight: 600 }}> · {getSessionTargetPreviewOneLiner(modal, modalWeek || undefined)}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setModalPlanTargetsExpanded((v) => !v)}
                    style={{
                      margin: 0,
                      marginTop: 4,
                      padding: "6px 0",
                      border: "none",
                      background: "transparent",
                      cursor: "pointer",
                      fontSize: 12,
                      fontWeight: 700,
                      color: "#7dd3fc",
                      letterSpacing: "0.02em",
                      textAlign: "left",
                    }}
                  >
                    {modalPlanTargetsExpanded ? "Weniger anzeigen" : "Mehr anzeigen"}
                    <span style={{ marginLeft: 6, opacity: 0.85 }} aria-hidden>
                      {modalPlanTargetsExpanded ? "▴" : "▾"}
                    </span>
                    <span style={{ marginLeft: 6, fontWeight: 600, color: "#64748b", fontSize: 11 }}>
                      (Trainingsziele)
                    </span>
                  </button>
                  {modalPlanTargetsExpanded ? (
                    <div
                      style={{
                        marginTop: 8,
                        padding: "10px 12px",
                        borderRadius: 14,
                        background: "rgba(15,23,42,0.42)",
                        border: "1px solid rgba(148,163,184,0.1)",
                      }}
                    >
                      <div
                        style={{
                          fontSize: 10,
                          textTransform: "uppercase",
                          letterSpacing: "0.1em",
                          color: "rgba(100,116,139,0.9)",
                          fontWeight: 700,
                          marginBottom: 8,
                        }}
                      >
                        Trainingsziele
                      </div>
                      {(() => {
                        const t = getSessionTargetLines(modal, preferences.maxHeartRateBpm, modalWeek || undefined);
                        if (!t) return null;
                        return (
                          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                            <div style={{ fontSize: 12, color: "#94a3b8", lineHeight: 1.5 }}>{t.pulseLabel}</div>
                            <div style={{ fontSize: 12, color: "#94a3b8", lineHeight: 1.5 }}>{t.paceLabel}</div>
                            {t.distanceLabel ? (
                              <div style={{ fontSize: 12, color: "#94a3b8", lineHeight: 1.5 }}>{t.distanceLabel}</div>
                            ) : null}
                          </div>
                        );
                      })()}
                    </div>
                  ) : null}
                </div>
              ) : null}

              <DetailBlock title="Warum diese Einheit?">
                <div style={{fontSize:14,color:"#e2e8f0",lineHeight:1.7}}>{getSessionWhy(modal, modalWeek)}</div>
              </DetailBlock>

              <DetailBlock title="Workout-Struktur">
                <div style={{display:"flex",flexDirection:"column",gap:12}}>
                  <div>
                    <div style={{fontSize:12,fontWeight:700,color:"#38bdf8",marginBottom:4}}>Warm-up</div>
                    <div style={{fontSize:13,color:"#e2e8f0",lineHeight:1.6}}>{modalWorkout.warmup}</div>
                  </div>
                  <div>
                    <div style={{fontSize:12,fontWeight:700,color:"#f59e0b",marginBottom:4}}>Main Set</div>
                    <div style={{fontSize:13,color:"#e2e8f0",lineHeight:1.6}}>{modalWorkout.mainSet}</div>
                  </div>
                  <div>
                    <div style={{fontSize:12,fontWeight:700,color:"#10b981",marginBottom:4}}>Cool-down</div>
                    <div style={{fontSize:13,color:"#e2e8f0",lineHeight:1.6}}>{modalWorkout.cooldown}</div>
                  </div>
                </div>
              </DetailBlock>

              <DetailBlock title="Coach-Hinweis">
                <div style={{fontSize:14,color:"#e2e8f0",lineHeight:1.7}}>{getCoachHint(modal, modalWeek)}</div>
              </DetailBlock>

              {modalFuelingHints.length > 0 && (
                <DetailBlock title="Fueling-Hinweise">
                  <div style={{display:"flex",flexDirection:"column",gap:10}}>
                    {modalFuelingHints.map((hint) => (
                      <div key={hint} style={{fontSize:13,color:"#e2e8f0",lineHeight:1.7}}>
                        {hint}
                      </div>
                    ))}
                  </div>
                </DetailBlock>
              )}

              <DetailBlock title="Letzter gespeicherter Eintrag">
                <div style={{display:"grid",gridTemplateColumns:"repeat(2,minmax(0,1fr))",gap:10}}>
                  <MetricCard label="Status" value={getSessionStatusLabel(modalLog)} sublabel={modalLog?.at ? formatLogTimestamp(modalLog.at) : "Noch nicht gespeichert"} accent={isSessionLogDone(modalLog) ? "#10b981" : modalLog?.skipped ? "#f87171" : "#94a3b8"} />
                  <MetricCard label="Gefühl" value={modalLog?.feeling ? `${"★".repeat(modalLog.feeling)}` : "Keine"} sublabel={modalLog?.feeling ? `${modalLog.feeling}/5` : "Noch kein Rating"} accent="#f59e0b" />
                  <MetricCard
                    label="Gelaufene km"
                    value={modalLog?.assignedRun?.distanceKm != null ? String(modalLog.assignedRun.distanceKm) : modalLog?.actualKm || "—"}
                    sublabel={
                      (() => {
                        const displayPk = getDisplayPlannedDistanceKm(modal);
                        if (displayPk != null && displayPk > 0) {
                          return `Distanzziel: ${formatKm(displayPk).toFixed(1)} km`;
                        }
                        if (modal.type === "strength" || modal.type === "bike") {
                          return "Kein Distanzziel";
                        }
                        return "Keine Distanz geplant";
                      })()
                    }
                    accent="#38bdf8"
                  />
                  <MetricCard label="Notizen" value={modalLog?.notes ? "Vorhanden" : "Keine"} sublabel={modalLog?.notes || "Noch keine Notiz gespeichert"} accent="#c084fc" />
                </div>
              </DetailBlock>

              <DetailBlock title="Dein Eintrag">
                {(() => {
                  const displayPk = getDisplayPlannedDistanceKm(modal);
                  return displayPk != null && displayPk > 0 ? (
                  <div style={{marginBottom:14}}>
                    <label style={{display:"block",fontSize:11,fontWeight:700,color:"#7c8aa5",textTransform:"uppercase",letterSpacing:".08em",marginBottom:6}}>Tatsächliche km</label>
                    <input
                      type="number"
                      step="0.1"
                      placeholder={`Distanzziel: ${formatKm(displayPk).toFixed(1)} km`}
                      value={form.actualKm}
                      onChange={e=>setForm(f=>({...f,actualKm:e.target.value}))}
                      style={{width:"100%",background:"#070b16",border:"1px solid rgba(148,163,184,0.14)",borderRadius:12,padding:"12px 14px",color:"#e2e8f0",fontSize:14,boxSizing:"border-box"}}
                    />
                  </div>
                  ) : null;
                })()}

                <div style={{marginBottom:14}}>
                  <label style={{display:"block",fontSize:11,fontWeight:700,color:"#7c8aa5",textTransform:"uppercase",letterSpacing:".08em",marginBottom:8}}>Gefühl</label>
                  <div style={{display:"flex",gap:8}}>
                    {[1,2,3,4,5].map(n=>(
                      <button key={n} onClick={()=>setForm(f=>({...f,feeling:n}))} style={{flex:1,background:form.feeling>=n?"rgba(245,158,11,0.2)":"#070b16",border:`1px solid ${form.feeling>=n?"#f59e0b":"rgba(148,163,184,0.14)"}`,borderRadius:12,padding:"10px 0",cursor:"pointer",fontSize:18}}>
                        ⭐
                      </button>
                    ))}
                  </div>
                  <div style={{fontSize:12,color:"#94a3b8",textAlign:"center",marginTop:8}}>
                    {["","😓 Sehr schwer","😕 Schlecht","😐 Okay","😊 Gut","🔥 Fantastisch!"][form.feeling]}
                  </div>
                </div>

                <div style={{marginBottom:14}}>
                  <label style={{display:"block",fontSize:11,fontWeight:700,color:"#7c8aa5",textTransform:"uppercase",letterSpacing:".08em",marginBottom:6}}>Notizen</label>
                  <textarea
                    placeholder="Wie lief's? Besonderheiten? Stimmung?"
                    value={form.notes}
                    onChange={e=>setForm(f=>({...f,notes:e.target.value}))}
                    style={{width:"100%",background:"#070b16",border:"1px solid rgba(148,163,184,0.14)",borderRadius:12,padding:"12px 14px",color:"#e2e8f0",fontSize:13,boxSizing:"border-box",minHeight:92,resize:"vertical"}}
                  />
                </div>

                <label style={{display:"flex",alignItems:"center",gap:10,cursor:"pointer",fontSize:14,color:"#e2e8f0",marginBottom:10}}>
                  <input type="checkbox" checked={form.done} onChange={e=>setForm(f=>({...f,done:e.target.checked,skipped:e.target.checked?false:f.skipped}))} style={{width:18,height:18,accentColor:"#10b981"}}/>
                  Als abgeschlossen markieren
                </label>
                <label style={{display:"flex",alignItems:"center",gap:10,cursor:"pointer",fontSize:14,color:"#e2e8f0"}}>
                  <input type="checkbox" checked={form.skipped} onChange={e=>setForm(f=>({...f,skipped:e.target.checked,done:e.target.checked?false:f.done}))} style={{width:18,height:18,accentColor:"#f87171"}}/>
                  Als ausgelassen markieren
                </label>
              </DetailBlock>
            </div>

            <div style={{position:"sticky",bottom:0,padding:16,background:"linear-gradient(180deg,rgba(9,13,24,0) 0%, rgba(9,13,24,0.94) 18%, rgba(9,13,24,1) 100%)",borderTop:"1px solid rgba(148,163,184,0.08)"}}>
              <div style={{display:"flex",gap:10}}>
                <button onClick={closeModal} style={{flex:1,background:"#0b1220",border:"1px solid rgba(148,163,184,0.12)",color:"#94a3b8",borderRadius:14,padding:"13px",cursor:"pointer",fontSize:14,fontWeight:600}}>Abbrechen</button>
                <button onClick={saveModal} style={{flex:1.4,background:"linear-gradient(135deg,#10b981,#3b82f6)",border:"none",color:"#fff",borderRadius:14,padding:"13px",cursor:"pointer",fontSize:14,fontWeight:700}}>Speichern</button>
              </div>
            </div>
          </div>
        </div>
      ))}

      {showOnboarding ? <Onboarding onComplete={handleOnboardingComplete} /> : null}

      {accountDeleteStep > 0 ? (
        <AccountDeleteDialog
          step={accountDeleteStep}
          busy={accountDeleteBusy}
          error={accountDeleteError}
          onCancel={handleAccountDeleteCancel}
          onContinue={() => {
            setAccountDeleteError(null);
            setAccountDeleteStep(2);
          }}
          onConfirmDelete={() => void handleAccountDeleteConfirmFinal()}
        />
      ) : null}
    </div>
  );
}
