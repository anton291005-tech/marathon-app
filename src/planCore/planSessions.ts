/**
 * Einheiten für den ganzen Plan (Schritt 6): verbindet Wochenumfang (§5, `planVolume`), Paces (§3, `buildPaceProfile`)
 * und Wochenformen (§6, `layoutWeeks`) zu konkreten Einheiten (§7, §8). `buildPlan` (Schritt 7) macht daraus
 * `TrainingPlanV2`.
 *
 * Je Woche, in dieser Reihenfolge:
 * 1. Q-Arten (`qTypes.ts`), LR+M-Woche, Long-Run-Grenze aus dem Verlauf (`longRun.ts`).
 * 2. Q-Budget = 20 % der Wochen-km (15 % bei 3–4 Lauftagen; Taper/Rennwoche × 0,6). Reihenfolge: M-Block des LR+M,
 *    Q1, Q2; folgt noch eine, bekommt die erste höchstens 70 %. Jede Einheit höchstens ihr Limit (I12); ist das Budget
 *    aufgebraucht oder der Block zu klein, wird das Q zu E + Strides.
 * 3. Long Run = Grenze, aber höchstens so groß, dass E/REC/MLR ihre Mindestdauer bekommen.
 * 4. Rest gewichtet auf E/REC/MLR (`distribute.ts`), jede höchstens ihr Limit, 75 % des Long Runs (in Wochen ohne Long
 *    Run des letzten davor), in den letzten 2 Tagen vor dem Rennen 30 min. Zu viel Rest → Woche kleiner.
 * Passt eine Woche nicht, wird sie schrittweise weicher (nie härter, Hart-Annahme der Platzierung): erst MLR → E, dann
 * Q2 → E + Strides, dann Q1 → E + Strides; reicht auch das nicht, bekommen alle Einheiten ihre Mindestdauer und die
 * Woche wird größer (Hinweis).
 */

import { CONFIG } from "./config";
import { diffDays } from "./dates";
import { distributeFillers, minWeekKm } from "./distribute";
import type { Filler } from "./distribute";
import {
  advanceLongRun,
  floorTenth,
  INITIAL_LONG_RUN_STATE,
  longRunLimitKm,
  longRunPeakTargetKm,
  longRunSchedule,
  longRunStartCapKm,
  roundTenth,
} from "./longRun";
import type { LongRunState } from "./longRun";
import { buildPaceProfile } from "./pace";
import type { PaceProfile } from "./pace";
import { planPhases } from "./phases";
import { layoutWeeks } from "./placement";
import type { WeekLayout } from "./placement";
import { chooseQuality, isLongRunPlusMWeek } from "./qTypes";
import type { QualityPick, QualitySlot } from "./qTypes";
import { buildRaceSession, lastDaysMaxKm, stridesBeforeRace } from "./raceWeek";
import {
  buildEasySession,
  buildLongRunPlusM,
  buildQualityParts,
  buildQualitySession,
  buildRestSession,
  easyMaxKmByMinutes,
  easyMaxShareOfLongRun,
  easyMinKm,
  longRunPlusMBlockLimitKm,
  qualityLimitKm,
  segmentsKm,
  sessionPacesOf,
  stridesSegment,
} from "./sessions";
import type { CoreSession, EasyKind, QualityBuild, QualityType, SessionNoteCode, SessionPaces } from "./sessions";
import type { LayoutNote, PlacedSlot, WeekMode } from "./templates";
import type { CoreInputs, CorePhase, Ymd } from "./types";
import { planVolume } from "./volume";
import type { PlanVolume, PlanVolumeWeek } from "./volume";

const EPS = 1e-9;

export type WeekNoteCode =
  /** Rest passte nicht in die Limits von E/REC/MLR: Woche kleiner als geplant. */
  | "week-km-reduced"
  /** Mindestdauern passten nicht: Woche größer als geplant. */
  | "week-km-raised"
  /** Long Run auf das Minimum angehoben, damit E/REC/MLR ihre Mindestdauer und höchstens 75 % davon haben. */
  | "long-run-raised-to-min";

export type WeekSessions = {
  wn: number;
  phase: CorePhase;
  mode: WeekMode;
  isRecoveryWeek: boolean;
  /** Montag der Woche. */
  startYmd: Ymd;
  /** Wochen-km laut `planVolume` (Rennwoche inkl. Rennen). */
  targetKm: number;
  /** Summe der Einheiten (Rennwoche inkl. Rennen), auf 0,1 km. */
  totalKm: number;
  /** Eine Einheit je Plantag, Ruhetage als `REST`. */
  sessions: CoreSession[];
  notes: WeekNoteCode[];
  layoutNotes: LayoutNote[];
};

export type SessionPlan = {
  pace: PaceProfile;
  paces: SessionPaces;
  volume: PlanVolume;
  layouts: WeekLayout[];
  weeks: WeekSessions[];
  /** An `planVolume` übergebene Mindest-Wochen-km. */
  minWeekKm: number;
  /** Ziel des längsten Long Runs. */
  longRunPeakTargetKm: number;
};

const isQSlot = (slot: PlacedSlot): slot is QualitySlot => slot === "Q1" || slot === "Q1L" || slot === "Q2";

const STRIDES_PICK = (note: SessionNoteCode): { choice: { type: "STRIDES" }; note: SessionNoteCode } => ({
  choice: { type: "STRIDES" },
  note,
});

type QPlan = { ymd: Ymd; slot: QualitySlot; choice: QualityPick["choice"]; notes: SessionNoteCode[]; parts: QualityBuild | null };

type WeekArgs = {
  inputs: CoreInputs;
  layout: WeekLayout;
  volumeWeek: PlanVolumeWeek;
  paces: SessionPaces;
  beginner: boolean;
  desiredLongRunKm: number | null;
  longRunState: LongRunState;
  startCapKm: number;
  phaseIndex: number;
  longRunDates: Ymd[];
};

function nearLongRun(ymd: Ymd, longRunDates: Ymd[]): boolean {
  const maxDays = CONFIG.library.m.nearLongRunDays.value;
  return longRunDates.some((lr) => {
    const days = diffDays(lr, ymd);
    return days >= 1 && days <= maxDays;
  });
}

function assembleWeek(args: WeekArgs): { week: WeekSessions; longRunKm: number | null } {
  const { inputs, layout, volumeWeek, paces } = args;
  const runDays = inputs.runDaysPerWeek;
  const isRace = layout.mode === "race";
  const taperLike = isRace || layout.mode === "taper";
  const weekKm = isRace ? volumeWeek.raceWeekExtraKm ?? 0 : volumeWeek.targetKm;
  const { intensity } = CONFIG;

  const qDays = layout.days.filter((day) => isQSlot(day.slot));
  const lrDay = layout.days.filter((day) => day.slot === "LR")[0];
  const lrPlusM = isLongRunPlusMWeek({
    distance: inputs.distance,
    mode: layout.mode,
    phase: layout.phase,
    isRecoveryWeek: volumeWeek.isRecoveryWeek,
    phaseIndex: args.phaseIndex,
    hasLongRun: lrDay !== undefined,
  });
  const picks = qDays.map((day) =>
    chooseQuality({
      distance: inputs.distance,
      mode: layout.mode,
      phase: layout.phase,
      wn: layout.wn,
      slot: day.slot as QualitySlot,
      phaseIndex: args.phaseIndex,
      isRecoveryWeek: volumeWeek.isRecoveryWeek,
      beginner: args.beginner,
      runDays,
      qSlots: qDays.length,
      longRunPlusM: lrPlusM,
    }),
  );
  const lrLimit =
    lrDay === undefined
      ? null
      : longRunLimitKm(args.longRunState, {
          desired: args.desiredLongRunKm,
          isRecoveryWeek: volumeWeek.isRecoveryWeek,
          taper: layout.mode === "taper",
          runDays,
          weekKm,
          ePaceSecPerKm: paces.E,
          startCapKm: args.startCapKm,
        });

  const shareTarget =
    runDays <= intensity.fewRunDaysUpTo.value ? intensity.qualityShareTargetFewDays.value : intensity.qualityShareTarget.value;
  const budget = shareTarget * weekKm * (taperLike ? CONFIG.taper.qualityKmFactor.value : 1);

  for (let level = 0; level <= 3; level += 1) {
    const lastLevel = level === 3;
    // 1. Q-Arten nach Stufe weicher machen
    const qPlans: QPlan[] = qDays.map((day, k) => {
      let pick: { choice: QPlan["choice"]; note?: SessionNoteCode } = picks[k];
      const softenQ2 = level >= 2 && day.slot === "Q2";
      const softenQ1 = level >= 3 && day.slot !== "Q2";
      if ((softenQ2 || softenQ1) && pick.choice.type !== "STRIDES") pick = STRIDES_PICK("q-softened-room");
      return { ymd: day.ymd, slot: day.slot as QualitySlot, choice: pick.choice, notes: pick.note ? [pick.note] : [], parts: null };
    });

    // 2. Q-Budget: LR+M-Block, Q1/Q1L, Q2
    const order = qPlans
      .map((plan, index) => ({ plan, index }))
      .filter((entry) => entry.plan.choice.type !== "STRIDES")
      .sort((a, b) => (a.plan.slot === "Q2" ? 1 : 0) - (b.plan.slot === "Q2" ? 1 : 0) || a.index - b.index);
    const consumers = (lrPlusM && lrLimit !== null ? 1 : 0) + order.length;
    let remaining = budget;
    let consumerIndex = 0;
    const allowance = (): number =>
      consumerIndex === 0 && consumers > 1 ? Math.min(remaining, intensity.firstQualityBudgetShare.value * budget) : remaining;
    let lrmTarget = 0;
    if (lrPlusM && lrLimit !== null) {
      lrmTarget = Math.min(allowance(), longRunPlusMBlockLimitKm(lrLimit.km, paces));
      remaining = Math.max(0, remaining - lrmTarget);
      consumerIndex += 1;
    }
    order.forEach(({ plan }) => {
      const choice = plan.choice as QualityType;
      const near = choice.type === "M" && nearLongRun(plan.ymd, args.longRunDates);
      const light = plan.slot === "Q1L";
      const limit = qualityLimitKm(choice, weekKm, paces, { light, nearLongRun: near });
      const free = allowance();
      const parts = buildQualityParts(choice, Math.min(limit, free), weekKm, paces);
      consumerIndex += 1;
      if (parts === null) {
        plan.choice = { type: "STRIDES" };
        plan.notes.push("q-softened-budget");
        return;
      }
      if (near && Math.min(qualityLimitKm(choice, weekKm, paces, { light }), free) > limit + EPS) plan.notes.push("m-block-near-long-run");
      plan.parts = parts;
      remaining = Math.max(0, remaining - parts.qualityKm);
    });
    const qKm = qPlans.reduce((sum, plan) => sum + (plan.parts === null ? 0 : segmentsKm(plan.parts.segments)), 0);

    // 3. Füller und Long Run
    type FillerDay = { ymd: Ymd; slot: PlacedSlot; kind: EasyKind; qPlan: QPlan | null };
    const fillerDays: FillerDay[] = [];
    layout.days.forEach((day) => {
      if (day.slot === "E" || day.slot === "REC") fillerDays.push({ ymd: day.ymd, slot: day.slot, kind: day.slot, qPlan: null });
      else if (day.slot === "MLR") fillerDays.push({ ymd: day.ymd, slot: day.slot, kind: level >= 1 ? "E" : "MLR", qPlan: null });
      else if (isQSlot(day.slot)) {
        const plan = qPlans.filter((p) => p.ymd === day.ymd)[0];
        if (plan.parts === null) fillerDays.push({ ymd: day.ymd, slot: day.slot, kind: "E", qPlan: plan });
      }
    });
    const fmin = fillerDays.map((filler) => easyMinKm(filler.kind, paces));
    const sumMin = fmin.reduce((sum, km) => sum + km, 0);
    const weekNotes: WeekNoteCode[] = [];

    let lr: number | null = null;
    if (lrLimit !== null) {
      // Mindestens ein E von 25 min, und jeder Füller höchstens 75 % (REC: 100 %, I11) des Long Runs.
      const lrMin = fillerDays.reduce((most, filler, k) => {
        const share = filler.kind === "REC" ? 1 : easyMaxShareOfLongRun(filler.kind);
        return Math.max(most, fmin[k] / share);
      }, easyMinKm("E", paces));
      lr = Math.min(lrLimit.km, floorTenth(weekKm - qKm - sumMin));
      if (lr < lrMin - EPS || !(lr > 0)) {
        if (!lastLevel) continue;
        lr = Math.max(lr, Math.ceil(lrMin * 10 - EPS) / 10);
        weekNotes.push("long-run-raised-to-min");
      }
    }
    const refLongRun = lr !== null ? lr : args.longRunState.last;
    const fmax = fillerDays.map((filler) => {
      let max = Math.min(easyMaxKmByMinutes(filler.kind, paces, runDays), lastDaysMaxKm(filler.ymd, inputs.raceDate, paces));
      if (refLongRun !== null) {
        const share = filler.kind === "REC" ? 1 : easyMaxShareOfLongRun(filler.kind);
        max = Math.min(max, floorTenth(share * refLongRun));
      }
      return max;
    });
    if (fmax.some((max, k) => max < fmin[k] - EPS) && !lastLevel) continue;
    const rest = weekKm - (lr === null ? 0 : lr) - qKm;
    if (lr === null && rest < sumMin - EPS && !lastLevel) continue;
    const fillers: Filler[] = fillerDays.map((filler, k) => ({ kind: filler.kind, minKm: fmin[k], maxKm: Math.max(fmin[k], fmax[k]) }));
    const spread = distributeFillers(fillers, rest);
    if (spread.status === "reduced") weekNotes.push("week-km-reduced");
    if (spread.status === "raised") weekNotes.push("week-km-raised");

    // 4. Einheiten bauen
    const baseStrides =
      layout.mode === "base" && runDays === 3 && CONFIG.weekTemplates.stridesInBase3Days.value && !fillerDays.some((f) => f.qPlan !== null);
    const lastEasy = fillerDays.filter((f) => f.kind === "E").slice(-1)[0];
    const sessions: CoreSession[] = layout.days.map((day) => {
      if (day.slot === "REST") return buildRestSession(day.ymd);
      if (day.slot === "RACE") return buildRaceSession(day.ymd, inputs.distance, paces);
      if (day.slot === "LR" && lr !== null && lrLimit !== null) {
        const notes: SessionNoteCode[] = lrLimit.taperCut && lr <= lrLimit.km + EPS ? ["taper-long-run-cut"] : [];
        const withM = lrPlusM && lrmTarget > 0 ? buildLongRunPlusM({ ymd: day.ymd, slot: "LR", longRunKm: lr, blockKm: lrmTarget, paces, notes }) : null;
        return withM !== null ? withM : buildEasySession({ ymd: day.ymd, slot: "LR", kind: "LR", km: lr, paces, notes });
      }
      const plan = qPlans.filter((p) => p.ymd === day.ymd)[0];
      if (plan !== undefined && plan.parts !== null) {
        return buildQualitySession({ ymd: day.ymd, slot: day.slot, parts: plan.parts, paces, notes: plan.notes });
      }
      const k = fillerDays.map((f) => f.ymd).indexOf(day.ymd);
      const filler = fillerDays[k];
      const notes: SessionNoteCode[] = filler.qPlan !== null ? filler.qPlan.notes.slice() : [];
      if (day.slot === "MLR" && filler.kind === "E") notes.push("mlr-as-e");
      let strides = null;
      if (stridesBeforeRace(day.ymd, inputs.raceDate)) strides = stridesSegment(true);
      else if (filler.qPlan !== null) strides = stridesSegment(isRace);
      else if (baseStrides && lastEasy !== undefined && lastEasy.ymd === day.ymd) strides = stridesSegment(false);
      return buildEasySession({ ymd: day.ymd, slot: day.slot, kind: filler.kind, km: spread.km[k], paces, strides, notes });
    });

    const totalKm = roundTenth(sessions.reduce((sum, session) => sum + session.km, 0));
    return {
      week: {
        wn: layout.wn,
        phase: layout.phase,
        mode: layout.mode,
        isRecoveryWeek: volumeWeek.isRecoveryWeek,
        startYmd: volumeWeek.startYmd,
        targetKm: volumeWeek.targetKm,
        totalKm,
        sessions,
        notes: weekNotes,
        layoutNotes: layout.notes,
      },
      longRunKm: lr,
    };
  }
  // Stufe 3 kehrt immer zurück.
  throw new Error("unreachable");
}

/**
 * Einheiten für den ganzen Plan. `todayYmd` ist der Bezugstag für das Rennalter (`buildPaceProfile`).
 * `minWeekKm` aus den Paces geht als Option an `planVolume` (Folgepunkt aus Schritt 2).
 */
export function planSessions(inputs: CoreInputs, todayYmd: Ymd, options: { peakPosition?: number } = {}): SessionPlan {
  const pace = buildPaceProfile(inputs, todayYmd);
  const paces = sessionPacesOf(pace, inputs.distance);
  const beginner = pace.mode === "beginner";
  const runDays = inputs.runDaysPerWeek;
  const minWeek = minWeekKm(runDays, paces);
  const volume = planVolume(inputs, { peakPosition: options.peakPosition, minWeekKm: minWeek });
  const layouts = layoutWeeks(inputs, planPhases(inputs), { beginner });

  const startCapKm = longRunStartCapKm(inputs);
  const peakTarget = longRunPeakTargetKm(inputs.distance, runDays, volume.peakKm, paces.E);
  const schedule = longRunSchedule(
    layouts.map((layout, index) => ({
      hasLongRun: layout.hasLongRun,
      isRecoveryWeek: volume.weeks[index].isRecoveryWeek,
      taper: layout.mode === "taper",
    })),
    { startKm: startCapKm, peakKm: peakTarget, distance: inputs.distance, runDays },
  );
  const longRunDates: Ymd[] = [];
  layouts.forEach((layout) =>
    layout.days.forEach((day) => {
      if (day.slot === "LR") longRunDates.push(day.ymd);
    }),
  );

  let state = INITIAL_LONG_RUN_STATE;
  const counters: Record<CorePhase, number> = { base: 0, build: 0, peak: 0, taper: 0 };
  const weeks = layouts.map((layout, index) => {
    const volumeWeek = volume.weeks[index];
    const { week, longRunKm } = assembleWeek({
      inputs,
      layout,
      volumeWeek,
      paces,
      beginner,
      desiredLongRunKm: schedule[index],
      longRunState: state,
      startCapKm,
      phaseIndex: counters[layout.phase],
      longRunDates,
    });
    if (longRunKm !== null) {
      state = advanceLongRun(state, { isRecoveryWeek: volumeWeek.isRecoveryWeek, taper: layout.mode === "taper" }, longRunKm);
    }
    if (!volumeWeek.isRecoveryWeek) counters[layout.phase] += 1;
    return week;
  });

  return { pace, paces, volume, layouts, weeks, minWeekKm: minWeek, longRunPeakTargetKm: peakTarget };
}
