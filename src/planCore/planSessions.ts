/**
 * Einheiten für den ganzen Plan (Schritt 6): verbindet Wochenumfang (§5, `planVolume`), Paces (§3, `buildPaceProfile`)
 * und Wochenformen (§6, `layoutWeeks`) zu konkreten Einheiten (§7, §8). `buildPlan` (Schritt 7) macht daraus
 * `TrainingPlanV2`.
 *
 * Je Woche, in dieser Reihenfolge:
 * 1. Q-Arten (`qTypes.ts`), LR+M-Woche, Long-Run-Grenze aus dem Verlauf (`longRun.ts`).
 * 2. Q-Budget = 20 % der Wochen-km (15 % bei 3–4 Lauftagen; Taper/Rennwoche × 0,6). Reihenfolge: M-Block des LR+M,
 *    Q1, Q2; folgt noch eine, bekommt die erste höchstens 70 %. Jede Einheit höchstens ihr Limit (I12). Ist das Budget
 *    aufgebraucht, wird Q2 zu E + Strides; Q1 bekommt mindestens einen Minimalblock (5 min), wenn Limit und 25 % ihn
 *    zulassen, sonst ebenfalls E + Strides.
 * 3. Long Run = Grenze, aber höchstens so groß, dass E/REC/MLR ihre Mindestdauer bekommen.
 * 4. Rest gewichtet auf E/REC/MLR (`distribute.ts`), jede höchstens ihr Limit, 75 % des Long Runs (in Wochen ohne Long
 *    Run des letzten davor), in den letzten 2 Tagen vor dem Rennen 30 min. Zu viel Rest → Woche kleiner.
 * Passt eine Woche nicht, wird sie schrittweise weicher (nie härter, Hart-Annahme der Platzierung): erst MLR → E, dann
 * Q2 → E + Strides, dann Q1 → E + Strides, dann E/REC bis zur harten Untergrenze 15 min statt 25/20 min (Hinweis
 * `e-shortened-to-fit-week`, freigegeben 2026-11-05, nur außerhalb von Taper und Rennwoche und nur, wenn Stufe 3 die
 * Woche anheben würde: sonst wäre der Verlauf nicht mehr monoton); reicht auch das nicht, bekommen alle Einheiten diese Untergrenze und die Woche wird größer (Hinweis).
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
  easyHardMinKm,
  easyMaxKmByMinutes,
  easyMaxShareOfLongRun,
  easyMinKm,
  longRunPlusMBlockLimitKm,
  minQualityKm,
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
  | "week-km-raised";

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
  /** Erster Durchlauf von `planVolume` ohne Tragfähigkeit: Bezug des Long-Run-Anteils (Review-Punkt 29) und Long-Run-Ziel. */
  uncappedVolume: PlanVolume;
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
  /** Gelieferte km der Vorwoche (Vollwoche; Rennwoche ohne Rennen), `null` in Woche 1. Bezug für Q1 der Entlastungswoche. */
  previousWeekKm: number | null;
  /** Bezug des Long-Run-Anteils: geplante Wochen-km ohne Tragfähigkeit (Vollwoche; Review-Punkt 29). */
  shareBaseKm: number;
};

function nearLongRun(ymd: Ymd, longRunDates: Ymd[]): boolean {
  const maxDays = CONFIG.library.m.nearLongRunDays.value;
  return longRunDates.some((lr) => {
    const days = diffDays(lr, ymd);
    return days >= 1 && days <= maxDays;
  });
}

type WeekResult = { week: WeekSessions; longRunKm: number | null; spreadStatus: "ok" | "reduced" | "raised" };

/**
 * Eine Woche. Wird sie kleiner als geplant (Limits von E/REC/MLR), rechnet sie mit den tatsächlichen km noch einmal,
 * damit Q-Limits (I12) und Q-Budget (I8) für die Woche gelten, die tatsächlich gelaufen wird. Der Long-Run-Anteil (I9)
 * bleibt auf die geplanten Wochen-km bezogen.
 * Die Hinweise `week-km-reduced`/`-raised` vergleichen das Ergebnis mit `planVolume`.
 */
function assembleWeek(args: WeekArgs): { week: WeekSessions; longRunKm: number | null } {
  const isRace = args.layout.mode === "race";
  const planned = isRace ? args.volumeWeek.raceWeekExtraKm ?? 0 : args.volumeWeek.targetKm;
  const raceKm = isRace ? CONFIG.scope.raceKm.value[args.inputs.distance] : 0;
  let weekKm = planned;
  let result = assembleWeekAt(args, weekKm);
  // Konvergiert schnell (nur die Q-Größen hängen an den Wochen-km); 30 Runden als Obergrenze.
  for (let round = 0; round < 30 && result.spreadStatus === "reduced"; round += 1) {
    const actual = roundTenth(result.week.totalKm - raceKm);
    if (!(actual < weekKm - EPS)) break;
    weekKm = actual;
    result = assembleWeekAt(args, weekKm);
  }
  const { week } = result;
  const notes: WeekNoteCode[] = [];
  const diff = roundTenth(week.totalKm - week.targetKm);
  if (diff < 0) notes.unshift("week-km-reduced");
  if (diff > 0) notes.unshift("week-km-raised");
  return { week: { ...week, notes }, longRunKm: result.longRunKm };
}

function assembleWeekAt(args: WeekArgs, weekKm: number): WeekResult {
  const { inputs, layout, volumeWeek, paces } = args;
  const runDays = inputs.runDaysPerWeek;
  const isRace = layout.mode === "race";
  const taperLike = isRace || layout.mode === "taper";
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
          // Anteil am geplanten Verlauf ohne Tragfähigkeit (erster Durchlauf von `planVolume`, Vollwochen-Äquivalent):
          // sonst schrumpfen Woche und Long Run gemeinsam (Tragfähigkeit und monotoner Verlauf senken die Wochen, der
          // kleinere Long Run senkt die Tragfähigkeit weiter); mit nur E + LR in einer angebrochenen Woche 1 wäre der
          // Anteil sonst zwingend über 55 %. Review-Punkt 29.
          weekKm: args.shareBaseKm,
          ePaceSecPerKm: paces.E,
          startCapKm: args.startCapKm,
          hardMinKm: easyHardMinKm("LR", paces),
        });

  const shareTarget =
    runDays <= intensity.fewRunDaysUpTo.value ? intensity.qualityShareTargetFewDays.value : intensity.qualityShareTarget.value;
  const budget = shareTarget * weekKm * (taperLike ? CONFIG.taper.qualityKmFactor.value : 1);
  // Entlastungswoche: Q1 mit dem Faktor der Woche (Review-Punkt 36). Typ-Limit wie in einer Woche mit den km der Vorwoche,
  // mal Wochen-km ÷ Vorwoche; Anteilsgrenzen bleiben damit gleich, feste km-Grenzen schrumpfen mit.
  const recoveryFactor =
    volumeWeek.isRecoveryWeek && intensity.recoveryWeekQ1ScalesWithWeek.value && args.previousWeekKm !== null && args.previousWeekKm > 0
      ? Math.min(1, weekKm / args.previousWeekKm)
      : null;
  const limitOf = (choice: QualityType, light: boolean, near: boolean): number => {
    const plain = qualityLimitKm(choice, weekKm, paces, { light, nearLongRun: near });
    if (recoveryFactor === null || args.previousWeekKm === null) return plain;
    return Math.min(plain, floorTenth(recoveryFactor * qualityLimitKm(choice, args.previousWeekKm, paces, { light, nearLongRun: near })));
  };

  // Stufe 4 (E/REC bis 15 min) nur in Wochen bis zur Peak-Woche (ohne Taper und Rennwoche), wo der Verlauf monoton sein
  // muss, und nur wenn Stufe 3 die Woche anheben würde; sonst gilt Stufe 3 wie bisher. Taper- und Rennwochen werden wie
  // bisher angehoben.
  const maxLevel = !taperLike ? 4 : 3;
  for (let level = 0; level <= maxLevel; level += 1) {
    const lastLevel = level >= 3;
    // Stufe 4: E/REC nur noch mit der harten Untergrenze (15 min) statt ihrer Mindestdauer.
    const hardMins = level >= 4;
    const minKmOf = (kind: EasyKind): number => (hardMins && kind !== "MLR" ? easyHardMinKm(kind, paces) : easyMinKm(kind, paces));
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
      const limit = limitOf(choice, light, near);
      const free = allowance();
      let target = Math.min(limit, free);
      // Q1 entfällt nicht wegen des Budgets (I13: 1 Q pro Taper-Woche; weicher machen bei aufgebrauchtem Budget gilt
      // nur für Q2): mindestens ein Minimalblock, solange Typ-Limit und die harte 25-%-Grenze ihn zulassen.
      if (plan.slot !== "Q2") {
        const floor = minQualityKm(choice, paces);
        const hardRoom = intensity.qualityShareHard.value * weekKm - (budget - remaining);
        if (floor <= limit + EPS && floor <= hardRoom + EPS) target = Math.max(target, floor);
      }
      const parts = buildQualityParts(choice, target, weekKm, paces);
      consumerIndex += 1;
      if (parts === null) {
        plan.choice = { type: "STRIDES" };
        plan.notes.push("q-softened-budget");
        return;
      }
      if (near && Math.min(limitOf(choice, light, false), free) > limit + EPS) plan.notes.push("m-block-near-long-run");
      const unscaled = qualityLimitKm(choice, weekKm, paces, { light, nearLongRun: near });
      if (recoveryFactor !== null && Math.min(unscaled, free) > limit + EPS) plan.notes.push("q1-scaled-recovery-week");
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
    const fmin = fillerDays.map((filler) => minKmOf(filler.kind));
    const sumMin = fmin.reduce((sum, km) => sum + km, 0);
    const weekNotes: WeekNoteCode[] = [];

    let lr: number | null = null;
    if (lrLimit !== null) {
      // Der Long Run bleibt in seinen Grenzen (Start, Steigerung, Entlastung, Taper, Anteil; freigegeben 2026-11-05) und
      // ist mindestens so lang wie jeder Füller (I11), mindestens ein E von 25 min.
      // Liegt die Grenze selbst darunter, gilt sie (E/REC werden dann auf die Länge des Long Runs gekürzt).
      const lrMin = Math.min(lrLimit.km, fillerDays.reduce((most, filler, k) => Math.max(most, fmin[k]), minKmOf("E")));
      lr = Math.min(lrLimit.km, floorTenth(weekKm - qKm - sumMin));
      if (lr < lrMin - EPS || !(lr > 0)) {
        if (!lastLevel) continue;
        lr = Math.min(lrLimit.km, Math.max(lr, lrMin));
      }
    }
    const refLongRun = lr !== null ? lr : args.longRunState.last;
    // E und REC nie länger als der Long Run (I11, freigegeben 2026-11-05), auch wenn die Mindestdauer dann nicht passt.
    const shortened = fillerDays.map((filler, k) => filler.kind !== "MLR" && refLongRun !== null && fmin[k] > refLongRun + EPS);
    // Harte Untergrenze 15 min (Review-Punkt 34): der Long Run ist mindestens so lang (`longRunLimitKm`), E/REC damit auch.
    shortened.forEach((short, k) => {
      if (short && refLongRun !== null) fmin[k] = Math.max(floorTenth(refLongRun), easyHardMinKm(fillerDays[k].kind, paces));
    });
    const fmax = fillerDays.map((filler, k) => {
      const pace = filler.kind === "REC" ? paces.REC : paces.E;
      let max = Math.min(easyMaxKmByMinutes(filler.kind, paces, runDays, inputs.distance), lastDaysMaxKm(filler.ymd, inputs.raceDate, pace));
      if (refLongRun !== null) {
        // REC höchstens so lang wie der Long Run, MLR höchstens 75 %. E höchstens 75 %, aber mindestens seine
        // Mindestdauer, nie länger als der Long Run (freigegeben 2026-11-05).
        if (filler.kind === "REC") max = Math.min(max, refLongRun);
        else if (filler.kind === "MLR") max = Math.min(max, floorTenth(easyMaxShareOfLongRun("MLR") * refLongRun));
        else max = Math.min(max, refLongRun, Math.max(floorTenth(easyMaxShareOfLongRun("E") * refLongRun), fmin[k], easyMinKm("E", paces)));
      }
      return max;
    });
    if (fmax.some((max, k) => max < fmin[k] - EPS) && !lastLevel) continue;
    const rest = weekKm - (lr === null ? 0 : lr) - qKm;
    if (lr === null && rest < sumMin - EPS && !lastLevel) continue;
    const fillers: Filler[] = fillerDays.map((filler, k) => ({ kind: filler.kind, minKm: fmin[k], maxKm: Math.max(fmin[k], fmax[k]) }));
    const spread = distributeFillers(fillers, rest);
    // Stufe 3 würde die Woche anheben: in Wochen bis zur Peak-Woche stattdessen Stufe 4 (E/REC bis 15 min).
    if (spread.status === "raised" && level < maxLevel) continue;
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
        if (lrLimit.raisedToMinimum) notes.push("long-run-raised-to-minimum");
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
      if (filler.kind === "E" && refLongRun !== null && spread.km[k] > floorTenth(easyMaxShareOfLongRun("E") * refLongRun) + EPS) {
        notes.push("e-above-75-percent-long-run");
      }
      if (shortened[k]) notes.push("e-shortened-to-long-run");
      else if (filler.kind !== "MLR" && spread.km[k] < easyMinKm(filler.kind, paces) - EPS) notes.push("e-shortened-to-fit-week");
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
      spreadStatus: spread.status,
    };
  }
  // Die letzte Stufe kehrt immer zurück.
  throw new Error("unreachable");
}

type PlanContext = {
  inputs: CoreInputs;
  paces: SessionPaces;
  beginner: boolean;
  layouts: WeekLayout[];
  /** Wochenraster (Phasen, Tage, Entlastung) aus dem ersten Durchlauf von `planVolume`; km werden je Woche ersetzt. */
  grid: PlanVolumeWeek[];
  schedule: Array<number | null>;
  startCapKm: number;
  longRunDates: Ymd[];
};

/** Volumen-Woche mit geplantem Wert `km` (Vollwoche; Rennwoche ohne Rennen) und Verlauf `curveKm` (vor der Tragfähigkeit). */
function volumeWeekWith(base: PlanVolumeWeek, km: number, curveKm: number, raceKm: number, isRace: boolean): PlanVolumeWeek {
  if (isRace) return { ...base, fullWeekKm: km, curveKm, raceWeekExtraKm: km, targetKm: roundTenth(raceKm + km) };
  const targetKm = base.days < 7 ? Math.round((km * base.days) / 7) : km;
  return { ...base, fullWeekKm: km, curveKm, targetKm };
}

/**
 * Plant die Wochen der Reihe nach mit dem Long-Run-Verlauf; liefert je Woche die Einheiten. Für `planVolume` als
 * Tragfähigkeit (`deliver`): Wird die Woche durch die Limits kleiner, gilt der lieferbare Wert (abgerundet auf 0,1 km)
 * und die Woche wird damit neu gerechnet.
 */
function weekRunner(ctx: PlanContext): { deliver(index: number, km: number): number; take(index: number, week: PlanVolumeWeek): WeekSessions } {
  let state = INITIAL_LONG_RUN_STATE;
  let previousWeekKm: number | null = null;
  const counters: Record<CorePhase, number> = { base: 0, build: 0, peak: 0, taper: 0 };
  const raceKm = CONFIG.scope.raceKm.value[ctx.inputs.distance];
  const assemble = (index: number, volumeWeek: PlanVolumeWeek) =>
    assembleWeek({
      inputs: ctx.inputs,
      layout: ctx.layouts[index],
      volumeWeek,
      paces: ctx.paces,
      beginner: ctx.beginner,
      desiredLongRunKm: ctx.schedule[index],
      longRunState: state,
      startCapKm: ctx.startCapKm,
      phaseIndex: counters[ctx.layouts[index].phase],
      longRunDates: ctx.longRunDates,
      previousWeekKm,
      shareBaseKm: ctx.grid[index].fullWeekKm,
    });
  const commit = (index: number, result: { week: WeekSessions; longRunKm: number | null }, weekKm: number): WeekSessions => {
    const layout = ctx.layouts[index];
    previousWeekKm = weekKm;
    const isRecoveryWeek = ctx.grid[index].isRecoveryWeek;
    if (result.longRunKm !== null) state = advanceLongRun(state, { isRecoveryWeek, taper: layout.mode === "taper" }, result.longRunKm);
    if (!isRecoveryWeek) counters[layout.phase] += 1;
    return result.week;
  };
  return {
    deliver(index: number, km: number): number {
      const base = ctx.grid[index];
      const isRace = ctx.layouts[index].mode === "race";
      let result = assemble(index, volumeWeekWith(base, km, km, raceKm, isRace));
      let delivered = km;
      // Eine angebrochene Woche 1 deckelt den Verlauf nicht: ihre Lauftage im Fenster sagen nichts über eine volle Woche
      // (ohne Lauftag im Fenster wäre sie 0 km und I3 hielte den ganzen Plan bei 0). Sie wird nur gekürzt (Hinweis).
      const partial = !isRace && base.days < 7;
      if (!partial && result.week.notes.indexOf("week-km-reduced") >= 0) {
        const total = result.week.totalKm - (isRace ? raceKm : 0);
        delivered = Math.min(km, floorTenth(total));
        result = assemble(index, volumeWeekWith(base, delivered, km, raceKm, isRace));
      }
      commit(index, result, delivered);
      return delivered;
    },
    take(index: number, week: PlanVolumeWeek): WeekSessions {
      return commit(index, assemble(index, week), week.fullWeekKm);
    },
  };
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
  // Durchlauf 1 ohne Tragfähigkeit: Wochenraster und Peak für das Ziel des längsten Long Runs.
  const grid = planVolume(inputs, { peakPosition: options.peakPosition, minWeekKm: minWeek });
  const layouts = layoutWeeks(inputs, planPhases(inputs), { beginner });

  const startCapKm = longRunStartCapKm(inputs);
  const peakTarget = longRunPeakTargetKm(inputs.distance, runDays, grid.peakKm, paces.E);
  const schedule = longRunSchedule(
    layouts.map((layout, index) => ({
      hasLongRun: layout.hasLongRun,
      isRecoveryWeek: grid.weeks[index].isRecoveryWeek,
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

  // Durchlauf 2: `planVolume` plant nur, was die Wochen liefern können (Tragfähigkeit, freigegeben 2026-11-05).
  const ctx: PlanContext = { inputs, paces, beginner, layouts, grid: grid.weeks, schedule, startCapKm, longRunDates };
  const volume = planVolume(inputs, {
    peakPosition: options.peakPosition,
    minWeekKm: minWeek,
    capacity: { begin: () => weekRunner(ctx) },
  });
  const runner = weekRunner(ctx);
  const weeks = layouts.map((_, index) => runner.take(index, volume.weeks[index]));

  return { pace, paces, volume, uncappedVolume: grid, layouts, weeks, minWeekKm: minWeek, longRunPeakTargetKm: peakTarget };
}
