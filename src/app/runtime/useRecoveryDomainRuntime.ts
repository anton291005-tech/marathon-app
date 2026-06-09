import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { safeParseJSON } from "../../appSmartFeatures";
import { computeHomeRecoveryScoreFromInputs } from "../../recovery/homeRecoveryScore";
import { getRecoveryDomainState } from "../../recovery/recoveryDomainState";
import { getRecoveryPresentationState } from "../../recovery/recoveryPresentation";
import { deriveSleepStatus, deriveSignalStatus, type PermissionState, type RecoverySignalStatus } from "../../recovery/recoveryDisplayState";
import { weeklyTrainingStressIndex } from "../../recovery/planTrainingLoad";
import { buildDailyTrainingLoadByDate } from "../../recovery/trainingDailyLoad";
import {
  readRecoveryHomeScoreDayMap,
  readRecoveryBootPhaseComplete,
  readRecoveryHasEverKpiFromStorage,
  recoveryHealthVersionFingerprint,
  recoverySnapshotVersionHash,
  recoveryTrendLinePreferred,
  recoveryWorkoutsVersionFingerprint,
  upsertRecoveryHomeScoreForDay,
  writeRecoveryBootPhaseComplete,
  writeRecoveryHasEverKpiToStorage,
} from "../../recovery/recoveryStorage";
import { getAppNow, getAppTodayYmd } from "../../core/time/timeSystem";
import type { SessionLog } from "../../marathonPrediction";
import type { RecoveryDailyRow } from "../../recovery/recoveryTypes";
import type { TrainingPlanV2 } from "../../planV2/types";
import {
  formatRecoverySevenDayWindowYmds,
  formatSleepHoursAvg,
  interpret7dTrainingLoad,
  meanFiniteNumbers,
} from "./recoveryRuntimePresentation";
import {
  asLegacyPlanWeekFromDisplaySlice,
  asLegacyPlanWeeksMutable,
  asLegacyRecoveryDailyRowsMutable,
} from "./legacyRecoveryReadModelBoundaries";
import type { RuntimeDisplayPlan } from "./runtimeDisplayPlanTypes";
import {
  clampScore0_100,
  monitorMetricSource,
  warnOnce,
} from "../../ui/productionGuards";

export type RecoveryDomainRuntimeArgs = {
  /** Canonical read-model from `deriveDisplayPlan` (`useDisplayPlanFromTrainingState`). */
  readonly displayPlan: RuntimeDisplayPlan;
  readonly wIdx: number;
  readonly logs: Readonly<Record<string, SessionLog>>;
  readonly recoveryDailyRows: readonly RecoveryDailyRow[];
  readonly aiPlanPatches: unknown;
  readonly trainingPlanV2: TrainingPlanV2;
  readonly sleepPermission: PermissionState;
  readonly hrvPermission: PermissionState;
  readonly rhrPermission: PermissionState;
};

export function useRecoveryDomainRuntime(args: RecoveryDomainRuntimeArgs) {
  const {
    displayPlan,
    wIdx,
    logs,
    recoveryDailyRows,
    aiPlanPatches,
    trainingPlanV2,
    sleepPermission,
    hrvPermission,
    rhrPermission,
  } = args;

  /** DEV-only: shallow-freeze a copied row list so accidental pushes/splices fail fast (production keeps upstream ref). */
  const recoveryDailyRowsRead = useMemo(() => {
    if (typeof process !== "undefined" && process.env.NODE_ENV === "development") {
      const copy = recoveryDailyRows.slice();
      Object.freeze(copy);
      return copy;
    }
    return recoveryDailyRows;
  }, [recoveryDailyRows]);

  const recoveryHasEverKpiRef = useRef(
    typeof localStorage !== "undefined" &&
      readRecoveryHasEverKpiFromStorage((k: string) => localStorage.getItem(k)),
  );
  const [recoveryBootPhaseComplete, setRecoveryBootPhaseComplete] = useState(() => {
    if (typeof localStorage === "undefined") return false;
    const read = (k: string) => localStorage.getItem(k);
    return readRecoveryBootPhaseComplete(read) || readRecoveryHasEverKpiFromStorage(read);
  });
  const recoveryWorkoutsVersion = useMemo(() => recoveryWorkoutsVersionFingerprint(logs), [logs]);
  const recoveryHealthVersion = useMemo(
    () => recoveryHealthVersionFingerprint([...recoveryDailyRowsRead]),
    [recoveryDailyRowsRead],
  );
  const recoveryPlanPatchesVersion = useMemo(() => JSON.stringify(aiPlanPatches ?? []), [aiPlanPatches]);
  /** Stable digest of persisted V2 structure (ids + dates); patches alone miss swaps / edits. */
  const recoveryV2PlanDigest = useMemo(() => {
    const w = trainingPlanV2?.workouts ?? [];
    if (!w.length) return "";
    return w
      .map((x) => `${x.id}@${String(x.dateIso)}`)
      .sort()
      .join(",");
  }, [trainingPlanV2]);
  const recoveryUserId = useMemo(() => {
    try {
      if (typeof localStorage === "undefined") return "anon";
      const v = localStorage.getItem("marathonUserId");
      return typeof v === "string" && v.length > 0 ? v : "anon";
    } catch {
      return "anon";
    }
  }, []);

  const recoveryInputVersion = useMemo(
    () =>
      recoverySnapshotVersionHash({
        workoutsFingerprint: recoveryWorkoutsVersion,
        healthFingerprint: recoveryHealthVersion,
        planFingerprint: `${recoveryPlanPatchesVersion}|v2:${recoveryV2PlanDigest}|wIdx=${wIdx}`,
      }),
    [recoveryWorkoutsVersion, recoveryHealthVersion, recoveryPlanPatchesVersion, recoveryV2PlanDigest, wIdx],
  );

  const recoveryDebounceSeqRef = useRef(0);
  const [committedRecoveryVersion, setCommittedRecoveryVersion] = useState(() => recoveryInputVersion);
  const lastGoodRecoveryDomainRef = useRef<ReturnType<typeof getRecoveryDomainState> | null>(null);

  const recoveryTimeAnchor = getAppNow();
  const todayCalendarYmd = getAppTodayYmd();

  const homeRecoverySleep7dDisplay = useMemo(() => {
    const last7 = formatRecoverySevenDayWindowYmds(todayCalendarYmd, new Date(recoveryTimeAnchor));
    const byDate = new Map((recoveryDailyRowsRead || []).map((r) => [r.date, r]));
    const vals = last7.map((d) => byDate.get(d)?.sleepHours).filter((v) => typeof v === "number" && Number.isFinite(v) && v > 0);
    const avg = meanFiniteNumbers(vals);
    const label = avg != null ? formatSleepHoursAvg(avg) : null;
    if (typeof process !== "undefined" && process.env.REACT_APP_RECOVERY_DEBUG === "1") {
      // eslint-disable-next-line no-console
      console.log("[RECOVERY_PIPELINE][sleep_7d]", {
        window: last7,
        perDay: last7.map((d) => ({ d, sleepHours: byDate.get(d)?.sleepHours ?? null })),
        avg,
        label,
      });
    }
    return label;
  }, [recoveryDailyRowsRead, todayCalendarYmd]);

  const homeRecoveryHrv7dDisplay = useMemo(() => {
    const last7 = formatRecoverySevenDayWindowYmds(todayCalendarYmd, new Date(recoveryTimeAnchor));
    const byDate = new Map((recoveryDailyRowsRead || []).map((r) => [r.date, r]));
    const vals = last7
      .map((d) => byDate.get(d)?.hrvMs)
      .filter((v): v is number => typeof v === "number" && Number.isFinite(v) && v > 0);
    const avg = meanFiniteNumbers(vals);
    return avg != null ? `${Math.round(avg)} ms` : null;
  }, [recoveryDailyRowsRead, todayCalendarYmd]);

  const homeRecoveryRhr7dDisplay = useMemo(() => {
    const last7 = formatRecoverySevenDayWindowYmds(todayCalendarYmd, new Date(recoveryTimeAnchor));
    const byDate = new Map((recoveryDailyRowsRead || []).map((r) => [r.date, r]));
    const vals = last7
      .map((d) => byDate.get(d)?.restingHr)
      .filter((v): v is number => typeof v === "number" && Number.isFinite(v) && v > 0);
    const avg = meanFiniteNumbers(vals);
    return avg != null ? `${Math.round(avg)} bpm` : null;
  }, [recoveryDailyRowsRead, todayCalendarYmd]);

  const hrvStatus = useMemo((): RecoverySignalStatus => deriveSignalStatus(homeRecoveryHrv7dDisplay, hrvPermission), [
    homeRecoveryHrv7dDisplay,
    hrvPermission,
  ]);

  const rhrStatus = useMemo((): RecoverySignalStatus => deriveSignalStatus(homeRecoveryRhr7dDisplay, rhrPermission), [
    homeRecoveryRhr7dDisplay,
    rhrPermission,
  ]);

  const homeRecoveryLoad7dDisplay = useMemo(() => {
    const last7 = formatRecoverySevenDayWindowYmds(todayCalendarYmd, new Date(recoveryTimeAnchor));
    const byDate = buildDailyTrainingLoadByDate(asLegacyPlanWeeksMutable(displayPlan), logs);
    let total = 0;
    let days = 0;
    for (const d of last7) {
      const v = byDate.get(d) ?? 0;
      if (typeof v === "number" && Number.isFinite(v) && v > 0) {
        total += v;
        days += 1;
      }
    }
    return interpret7dTrainingLoad(total, days);
  }, [logs, todayCalendarYmd, displayPlan]);

  useEffect(() => {
    if (committedRecoveryVersion === recoveryInputVersion) return;
    const seq = ++recoveryDebounceSeqRef.current;
    const id = setTimeout(() => {
      if (seq !== recoveryDebounceSeqRef.current) return;
      setCommittedRecoveryVersion(recoveryInputVersion);
    }, 80);
    return () => clearTimeout(id);
  }, [recoveryInputVersion, committedRecoveryVersion]);

  const recoveryDomain = useMemo(() => {
    const plan = displayPlan;
    const loadStressIdx = weeklyTrainingStressIndex(asLegacyPlanWeekFromDisplaySlice(plan[wIdx] ?? plan[0]));
    const homeScoreByDay = readRecoveryHomeScoreDayMap((k) => localStorage.getItem(k), safeParseJSON);
    const domain = getRecoveryDomainState({
      recoveryDayKey: `${recoveryUserId}:${todayCalendarYmd}`,
      now: recoveryTimeAnchor,
      plan: asLegacyPlanWeeksMutable(plan),
      logs,
      recoveryDailyRows: asLegacyRecoveryDailyRowsMutable(recoveryDailyRowsRead),
      loadStressIdx,
      todayCalendarYmd,
      homeScoreByDay: { ...homeScoreByDay },
      snapshotVersion: committedRecoveryVersion,
      recoveryInputVersion,
      workoutsFingerprint: recoveryWorkoutsVersion,
      healthFingerprint: recoveryHealthVersion,
      planFingerprint: `${recoveryPlanPatchesVersion}|v2:${recoveryV2PlanDigest}|wIdx=${wIdx}`,
      hasEverComputedRecoveryScore: recoveryHasEverKpiRef.current,
      bootPhaseComplete: recoveryBootPhaseComplete,
    });
    if (domain.domainKind === "live") {
      lastGoodRecoveryDomainRef.current = domain;
    }
    return domain;
  }, [
    todayCalendarYmd,
    committedRecoveryVersion,
    recoveryInputVersion,
    logs,
    recoveryDailyRowsRead,
    displayPlan,
    wIdx,
    recoveryWorkoutsVersion,
    recoveryHealthVersion,
    recoveryPlanPatchesVersion,
    recoveryBootPhaseComplete,
    recoveryTimeAnchor,
    recoveryUserId,
  ]);

  const isRecoveryHydrating = committedRecoveryVersion !== recoveryInputVersion;

  // During the debounce window, hold the last known good (live) domain so the
  // UI does not briefly drop to null / "insufficient" between data updates.
  const displayDomain = useMemo(() => {
    if (
      recoveryDomain.domainKind === "insufficient" &&
      lastGoodRecoveryDomainRef.current?.domainKind === "live"
    ) {
      return lastGoodRecoveryDomainRef.current;
    }
    return recoveryDomain;
  }, [recoveryDomain]);

  useEffect(() => {
    if (recoveryDomain.domainKind !== "live") return;
    if (recoveryBootPhaseComplete) return;
    setRecoveryBootPhaseComplete(true);
    try {
      writeRecoveryBootPhaseComplete((k, v) => localStorage.setItem(k, v));
    } catch {
      // ignore
    }
  }, [recoveryDomain.domainKind, recoveryBootPhaseComplete]);

  useEffect(() => {
    if (typeof localStorage === "undefined") return;
    if (readRecoveryBootPhaseComplete((k) => localStorage.getItem(k))) return;
    if (!readRecoveryHasEverKpiFromStorage((k) => localStorage.getItem(k))) return;
    try {
      writeRecoveryBootPhaseComplete((k, v) => localStorage.setItem(k, v));
    } catch {
      // ignore
    }
  }, []);

  useLayoutEffect(() => {
    if (recoveryDomain.domainKind !== "live") return;
    if (recoveryDomain.homeRecoveryScore0_100 == null) return;
    if (!recoveryHasEverKpiRef.current) {
      recoveryHasEverKpiRef.current = true;
      try {
        writeRecoveryHasEverKpiToStorage((k, v) => localStorage.setItem(k, v));
      } catch {
        // ignore
      }
    }
  }, [recoveryDomain.domainKind, recoveryDomain.homeRecoveryScore0_100]);

  useEffect(() => {
    if (recoveryInputVersion !== committedRecoveryVersion) return;
    if (recoveryDomain.domainKind !== "live") return;
    if (recoveryDomain.homeRecoveryScore0_100 == null) return;
    try {
      upsertRecoveryHomeScoreForDay({
        readItem: (k) => localStorage.getItem(k),
        writeItem: (k, v) => localStorage.setItem(k, v),
        safeParseJSON: safeParseJSON,
        ymd: todayCalendarYmd,
        score: recoveryDomain.homeRecoveryScore0_100,
      });
    } catch {
      // ignore
    }
  }, [
    recoveryInputVersion,
    committedRecoveryVersion,
    recoveryDomain.domainKind,
    recoveryDomain.homeRecoveryScore0_100,
    todayCalendarYmd,
  ]);

  const recoveryPresentation = useMemo(
    () =>
      getRecoveryPresentationState(displayDomain, wIdx, {
        trendVsYesterdayLine: recoveryTrendLinePreferred({
          todayYmd: todayCalendarYmd,
          todayScore: displayDomain.homeRecoveryScore0_100,
          isInsufficient: displayDomain.domainKind === "initial" || displayDomain.isInsufficient,
          readItem: (k) => localStorage.getItem(k),
          safeParseJSON: safeParseJSON,
        }),
      }),
    [displayDomain, wIdx, todayCalendarYmd],
  );

  // sleepStatus depends on recoveryPresentation — must be defined after it
  const sleepStatus = useMemo((): RecoverySignalStatus =>
    deriveSleepStatus(
      homeRecoverySleep7dDisplay,
      recoveryPresentation.verlauf.fallback7d,
      sleepPermission,
    ),
  [homeRecoverySleep7dDisplay, recoveryPresentation, sleepPermission]);

  const uiRecoveryScore0_100 = clampScore0_100(recoveryPresentation.homeKpi.score0_100, "home_recovery");
  const uiRecoveryScoreDisplay =
    uiRecoveryScore0_100 != null
      ? String(uiRecoveryScore0_100)
      : (recoveryPresentation.homeKpi.scoreDisplay === "-" ? "—" : recoveryPresentation.homeKpi.scoreDisplay);

  monitorMetricSource("recovery_score", "recoveryPresentation", uiRecoveryScore0_100);

  if (typeof process !== "undefined" && process.env?.NODE_ENV === "development") {
    const d = recoveryDomain?.homeRecoveryScore0_100;
    if (typeof d === "number" && Number.isFinite(d) && uiRecoveryScore0_100 != null && d !== uiRecoveryScore0_100) {
      warnOnce("recovery_presentation_mismatch", { domain: d, presentation: uiRecoveryScore0_100 });
    }
  }

  useEffect(() => {
    if (typeof process === "undefined") return;
    if (process.env.REACT_APP_RECOVERY_DEBUG !== "1") return;
    try {
      const today = todayCalendarYmd;
      const row = recoveryDailyRowsRead.find((r) => r.date === today);
      const rawInputs = row
        ? {
            sleepHours: row.sleepHours ?? null,
            hrvMs: row.hrvMs ?? null,
            restingHr: row.restingHr ?? null,
            activeEnergyKcal: row.activeEnergyKcal ?? null,
          }
        : { sleepHours: null, hrvMs: null, restingHr: null, activeEnergyKcal: null };
      const computedFromInputs = computeHomeRecoveryScoreFromInputs(rawInputs);
      const inputsValid = computedFromInputs != null && Number.isFinite(computedFromInputs);
      const uiHomeValue = recoveryPresentation.homeKpi.score0_100;
      const uiHomeDisplay = recoveryPresentation.homeKpi.scoreDisplay;
      const uiLeistungValue = recoveryPresentation.verlauf.header.score;
      const uiLeistungDisplay = uiLeistungValue === null ? "—" : String(uiLeistungValue);
      const scoreReachedUi =
        uiHomeValue != null &&
        uiHomeDisplay !== "-" &&
        uiLeistungValue != null &&
        uiHomeValue === recoveryDomain.homeRecoveryScore0_100 &&
        uiLeistungValue === recoveryDomain.homeRecoveryScore0_100;
      // eslint-disable-next-line no-console
      console.log("[RECOVERY_PIPELINE]", {
        todayYmd: today,
        inputs: rawInputs,
        rawInputsPresent: row != null,
        inputsValid,
        computedScore: computedFromInputs,
        domain: {
          domainKind: recoveryDomain.domainKind,
          isInsufficient: recoveryDomain.isInsufficient,
          homeRecoveryScore0_100: recoveryDomain.homeRecoveryScore0_100,
        },
        presentation: {
          homeKpiScore0_100: recoveryPresentation.homeKpi.score0_100,
          homeKpiScoreDisplay: recoveryPresentation.homeKpi.scoreDisplay,
          leistungHeaderScore: recoveryPresentation.verlauf.header.score,
        },
        ui: {
          home: { value: uiHomeValue, display: uiHomeDisplay },
          leistung: { value: uiLeistungValue, display: uiLeistungDisplay === "—" ? "—" : uiLeistungDisplay },
        },
        "SCORE REACHED UI": scoreReachedUi,
      });

      if (!scoreReachedUi) {
        let classification: { code: "A" | "B" | "C" | "D" | "E" | "F"; firstInvalidStage: string; reason: string } | null =
          null;

        const domainScore = recoveryDomain.homeRecoveryScore0_100;
        const layer1Score = computedFromInputs;
        const layer2Score = recoveryDomain.homeRecoveryScoreSource === "fallback7d" ? domainScore : null;

        const anyRows = (recoveryDailyRowsRead?.length ?? 0) > 0;
        if (!anyRows) {
          classification = { code: "A", firstInvalidStage: "RAW INPUTS", reason: "recoveryDailyRows empty (not hydrated yet)" };
        } else if (layer1Score == null && recoveryDomain.homeRecoveryScoreSource == null && domainScore == null) {
          classification = {
            code: "B",
            firstInvalidStage: "VALIDATION RESULT",
            reason: "same-day invalid and fallback not eligible (validDays<3 or missing averages)",
          };
        } else if (layer1Score == null && layer2Score == null && recoveryDomain.homeRecoveryScoreSource !== "fallback7d") {
          classification = {
            code: "C",
            firstInvalidStage: "LAYER OUTPUTS",
            reason: "fallback not triggered despite eligibility (unexpected source)",
          };
        } else if ((layer1Score != null || layer2Score != null) && domainScore == null) {
          classification = {
            code: "D",
            firstInvalidStage: "DOMAIN ASSIGNMENT",
            reason: "score computed but domain score is null",
          };
        } else if (domainScore != null && uiHomeValue == null) {
          classification = {
            code: "E",
            firstInvalidStage: "PRESENTATION MAPPING",
            reason: "domain score exists but presentation dropped it",
          };
        } else if (uiHomeDisplay === "-" && uiHomeValue != null) {
          classification = {
            code: "F",
            firstInvalidStage: "FINAL RENDER VALUE",
            reason: "UI formatted numeric value as '-'",
          };
        }

        // eslint-disable-next-line no-console
        console.log(
          "[RECOVERY_PIPELINE][classification]",
          classification ?? { code: "B", firstInvalidStage: "UNKNOWN", reason: "no match" },
        );
      }
    } catch {
      // ignore
    }
  }, [
    recoveryDomain.domainKind,
    recoveryDomain.isInsufficient,
    recoveryDomain.homeRecoveryScore0_100,
    recoveryPresentation.homeKpi.score0_100,
    recoveryPresentation.homeKpi.scoreDisplay,
    recoveryPresentation.verlauf.header.score,
    recoveryDailyRowsRead,
    todayCalendarYmd,
  ]);

  const recoveryState = recoveryDomain.sessionRecovery;

  return {
    recoveryWorkoutsVersion,
    recoveryHealthVersion,
    recoveryPlanPatchesVersion,
    recoveryV2PlanDigest,
    recoveryInputVersion,
    committedRecoveryVersion,
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
  };
}
