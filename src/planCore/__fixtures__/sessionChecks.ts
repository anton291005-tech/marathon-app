/**
 * Unabhängiger Prüfer für die Einheiten eines Plans (Tests). Er benutzt die Bau-Funktionen nicht, sondern rechnet aus den
 * Bausteinen und den Config-Zahlen nach: I1, I2, I6 (fertige Einheiten), I8, I9, I10, I11, I12, I13 (Qualität und
 * Taper-Volumen als Mittel der Taper-Phase), I14, I15, I17 und die Schritt-6-Regeln (Einsteiger, M-Block vor dem Long Run).
 * Leer = alles gehalten. Liegt unter `__fixtures__`, weil Jest jede Datei unter `__tests__` als Testdatei behandelt.
 */

import { CONFIG } from "../config";
import { diffDays } from "../dates";
import { findHardSpacingViolations, isHardSession, isHardSlot } from "../hard";
import type { SessionPlan } from "../planSessions";
import type { CoreSession, Segment } from "../sessions";
import type { CoreInputs, CoreKind } from "../types";

const EPS = 1e-6;
const TOL_MIN = 0.05; // Minuten-Toleranz (km auf 0,1 gerundet, Grenzen sind auf- bzw. abgerundet)

const r1 = (value: number): number => Math.round(value * 10) / 10;
const QUALITY_KINDS: CoreKind[] = ["T", "I", "R", "M"];

function kmOf(segments: Segment[]): number {
  let sum = 0;
  segments.forEach((s) => {
    if (s.type === "reps") sum += s.reps * s.repKm + s.restKm;
    else if (s.type !== "strides") sum += s.km;
  });
  return r1(sum);
}

function qualityOf(segments: Segment[]): number {
  let sum = 0;
  segments.forEach((s) => {
    if (s.type === "reps") sum += s.reps * s.repKm;
    else if (s.type === "steady") sum += s.km;
  });
  return r1(sum);
}

const workOf = (session: CoreSession): Segment | undefined =>
  session.segments.filter((s) => s.type === "steady" || s.type === "reps")[0];

export function checkSessionPlan(plan: SessionPlan, inputs: CoreInputs): string[] {
  const out: string[] = [];
  const { library, longRun, intensity, raceWeek } = CONFIG;
  const { paces, weeks, layouts } = plan;
  const runDays = inputs.runDaysPerWeek;
  const minutesAt = (km: number, secPerKm: number): number => (km * secPerKm) / 60;
  const all = weeks.reduce((list, week) => list.concat(week.sessions), [] as CoreSession[]);
  const raceKm = CONFIG.scope.raceKm.value[inputs.distance];

  // I14
  const races = all.filter((s) => s.kind === "RACE");
  if (races.length !== 1 || all[all.length - 1].kind !== "RACE" || all[all.length - 1].ymd !== inputs.raceDate) out.push("I14:race");
  if (races.length === 1 && races[0].km !== raceKm) out.push("I14:race-km");

  // I6 an den fertigen Einheiten: hart nur, wo die Platzierung hart angenommen hat; Abstände über den ganzen Plan.
  const hardOf = (s: CoreSession): boolean => {
    const w = workOf(s);
    const mKm = w !== undefined && (s.kind === "M" || s.kind === "LR+M") ? qualityOf([w]) : 0;
    return isHardSession({ kind: s.kind, durationMinutes: minutesAt(s.km, paces.E), kmAtMPaceOrFaster: mKm });
  };
  all.forEach((s) => {
    if (hardOf(s) && !isHardSlot(s.slot)) out.push(`I6:harder-than-layout:${s.ymd}`);
  });
  findHardSpacingViolations(all.map((s) => ({ ymd: s.ymd, hard: hardOf(s) }))).forEach((code) => out.push(`I6:${code}`));

  // I17 (Bänder)
  if (!paces.beginner) {
    const mid = (code: "REC" | "E" | "M" | "T" | "I" | "R"): number => (paces.bands[code]!.fast + paces.bands[code]!.slow) / 2;
    const order = ["REC", "E", "M", "T", "I", "R"] as const;
    for (let i = 1; i < order.length; i += 1) if (!(mid(order[i - 1]) > mid(order[i]))) out.push(`I17:${order[i]}`);
  }

  let lastLr: number | null = null;
  let level: number | null = null;
  let longest = 0;
  let afterRecovery = false;
  const lrDates = all.filter((s) => s.kind === "LR" || s.kind === "LR+M").map((s) => s.ymd);
  const hardMinKm = Math.ceil(((library.easyHardMinMinutes.value * 60) / paces.E) * 10 - EPS) / 10;
  const longestRecent =
    inputs.longestRecentRunKm !== undefined
      ? inputs.longestRecentRunKm
      : Math.max(CONFIG.inputs.longestRecentRunFallbackMinKm.value, inputs.currentWeeklyKm * CONFIG.inputs.longestRecentRunFallbackShare.value);

  weeks.forEach((week, index) => {
    const tag = `W${week.wn}`;
    const layout = layouts[index];
    const isRace = week.mode === "race";
    const race = week.sessions.filter((s) => s.kind === "RACE")[0];
    const weekKm = r1(week.totalKm - (race === undefined ? 0 : race.km));

    // I1
    const sum = r1(week.sessions.reduce((total, s) => total + s.km, 0));
    if (Math.abs(sum - week.totalKm) > EPS) out.push(`I1:${tag}:sum`);
    week.sessions.forEach((s) => {
      if (s.kind !== "RACE" && s.kind !== "REST" && Math.abs(kmOf(s.segments) - s.km) > EPS) out.push(`I1:${s.ymd}:segments`);
      if (s.kind !== "REST" && s.kind !== "RACE" && !(s.km > 0)) out.push(`I1:${s.ymd}:zero`);
    });
    const diff = r1(week.totalKm - week.targetKm);
    if (diff < 0 && week.notes.indexOf("week-km-reduced") < 0) out.push(`I1:${tag}:below-target-without-note:${diff}`);
    if (diff > 0 && week.notes.indexOf("week-km-raised") < 0) out.push(`I1:${tag}:above-target-without-note:${diff}`);

    // Rollen ↔ Arten (I2)
    week.sessions.forEach((s) => {
      const ok =
        (s.slot === "REST" && s.kind === "REST") ||
        (s.slot === "RACE" && s.kind === "RACE") ||
        (s.slot === "LR" && (s.kind === "LR" || s.kind === "LR+M")) ||
        ((s.slot === "E" || s.slot === "REC") && s.kind === s.slot) ||
        (s.slot === "MLR" && (s.kind === "MLR" || (s.kind === "E" && s.notes.indexOf("mlr-as-e") >= 0))) ||
        ((s.slot === "Q1" || s.slot === "Q1L" || s.slot === "Q2") &&
          (QUALITY_KINDS.indexOf(s.kind) >= 0 || (s.kind === "E" && s.segments.some((x) => x.type === "strides"))));
      if (!ok) out.push(`I2:${s.ymd}:slot-${s.slot}-kind-${s.kind}`);
      if (s.kind === "MLR" && CONFIG.weekTemplates.mlrDistances.value.indexOf(inputs.distance) < 0) out.push(`I2:${s.ymd}:mlr-distance`);
      s.segments.forEach((x) => {
        if ((x.type === "warmup" || x.type === "cooldown") && (x.km < library.warmupCooldownKm.value.min - EPS || x.km > library.warmupCooldownKm.value.max + EPS)) {
          out.push(`I2:${s.ymd}:wu-cd`);
        }
        if (x.type === "strides" && (x.reps < library.strides.reps.value.min || x.reps > library.strides.reps.value.max)) out.push(`I2:${s.ymd}:strides`);
      });
    });

    // Long Run (I9, I10)
    const lr = week.sessions.filter((s) => s.kind === "LR" || s.kind === "LR+M")[0];
    if (layout.hasLongRun !== (lr !== undefined)) out.push(`I10:${tag}:lr-mismatch`);
    if (lr !== undefined) {
      // Anteil am geplanten Verlauf ohne Tragfähigkeit (erster Durchlauf, Vollwochen-Äquivalent; Review-Punkt 29). Kein
      // Long Run über Start-, Steigerungs-, Entlastungs-, Taper- oder Anteilsgrenze; einzige Ausnahme (Review-Punkt 34):
      // liegen die Grenzen unter 15 min, ist der Long Run genau 15 min lang (Hinweis).
      const shareBase = plan.uncappedVolume.weeks[index].fullWeekKm;
      const raised = lr.notes.indexOf("long-run-raised-to-minimum") >= 0;
      if (raised && lr.km !== hardMinKm) out.push(`I9:${tag}:raised-not-to-minimum`);
      if (minutesAt(lr.km, paces.E) < library.easyHardMinMinutes.value - TOL_MIN) out.push(`I9:${tag}:below-15-min`);
      if (lr.km > longRun.maxShareOfWeek.value[runDays] * shareBase + EPS && !raised) out.push(`I9:${tag}:share`);
      if (minutesAt(lr.km, paces.E) > longRun.minutesHard.value + TOL_MIN) out.push(`I9:${tag}:minutes`);
      if (raised) {
        // Grenzen nicht nachgerechnet: die Untergrenze gilt nur, wenn der Kern sie braucht (Test in planSessions.test).
      } else if (week.mode === "taper") {
        if (lr.km > CONFIG.taper.longRunShareOfPeak.value * longest + EPS) out.push(`I9:${tag}:taper`);
      } else if (week.isRecoveryWeek) {
        if (lastLr !== null && lr.km > (1 - longRun.recoveryReduction.value.min) * lastLr + EPS) out.push(`I9:${tag}:recovery`);
      } else if (lastLr === null) {
        if (lr.km > r1(longestRecent + longRun.startAboveLongestRecentKm.value) + EPS) out.push(`I9:${tag}:start`);
      } else if (afterRecovery && level !== null) {
        if (lr.km > level + EPS) out.push(`I9:${tag}:after-recovery`);
      } else {
        const step = Math.min(longRun.absoluteMaxStepKm.value, Math.max(longRun.maxStepKm.value, longRun.maxStepShare.value * lastLr));
        if (lr.km > lastLr + step + EPS) out.push(`I9:${tag}:step`);
      }
      if (lr.kind === "LR+M") {
        const block = qualityOf(lr.segments);
        if (block < library.m.minKm.value - EPS) out.push(`Qmin:${tag}:lrm-block`);
        if (block > library.longRunPlusM.maxShareOfLongRun.value * lr.km + EPS) out.push(`I12:${tag}:lrm-share`);
        if (block > library.longRunPlusM.maxKm.value + EPS) out.push(`I12:${tag}:lrm-km`);
        const w = workOf(lr);
        const minutes = w !== undefined && w.type === "steady" && w.minutes !== undefined ? w.minutes : minutesAt(block, paces.M ?? paces.E);
        if (minutes > library.longRunPlusM.maxMinutes.value + TOL_MIN) out.push(`I12:${tag}:lrm-minutes`);
      }
    }

    // I11 und Limits der lockeren Einheiten (I2)
    const refLr = lr !== undefined ? lr.km : lastLr;
    week.sessions.forEach((s) => {
      if (s.kind !== "E" && s.kind !== "REC" && s.kind !== "MLR") return;
      const pace = s.kind === "REC" ? paces.REC : paces.E;
      const minutes = minutesAt(s.km, pace);
      const lim =
        s.kind === "REC"
          ? library.rec.minutes.value
          : s.kind === "MLR"
            ? library.mlr.minutes.value
            : {
                min: library.e.minutes.value.min,
                max:
                  runDays >= 6
                    ? library.e.minutesMaxSixDays.value
                    : runDays <= library.e.minutesMaxFewDays.value.upToRunDays && library.e.minutesMaxFewDays.value.distances.indexOf(inputs.distance) >= 0
                      ? library.e.minutesMaxFewDays.value.minutes
                      : library.e.minutes.value.max,
              };
      if (minutes < library.easyHardMinMinutes.value - TOL_MIN) out.push(`I2:${s.ymd}:${s.kind}-below-15-min`);
      // Ausnahme (freigegeben 2026-11-05): E/REC nie länger als der Long Run, auch unter der Mindestdauer (Hinweis).
      // Gekürzt heißt: genau auf die Länge des Long Runs (auf 0,1 km abgerundet), nicht beliebig kurz.
      const shortenedToLr =
        s.notes.indexOf("e-shortened-to-long-run") >= 0 &&
        refLr !== null &&
        s.km <= refLr + EPS &&
        s.km >= Math.floor(refLr * 10 + EPS) / 10 - EPS;
      if (s.notes.indexOf("e-shortened-to-long-run") >= 0 && !shortenedToLr) out.push(`I2:${s.ymd}:shortened-not-to-LR`);
      if (minutes < lim.min - TOL_MIN && !shortenedToLr) out.push(`I2:${s.ymd}:${s.kind}-too-short`);
      if (minutes > lim.max + TOL_MIN) out.push(`I2:${s.ymd}:${s.kind}-too-long`);
      if (refLr !== null) {
        if (s.km > refLr + EPS) out.push(`I11:${s.ymd}:${s.kind}>LR`);
        // MLR ≤ 75 % des Long Runs; E ≤ max(75 % des Long Runs, E-Mindestdauer), nie länger als er (freigegeben 2026-11-05).
        const eMin = Math.ceil(((library.e.minutes.value.min * 60) / paces.E) * 10 - EPS) / 10;
        const allowed =
          s.kind === "MLR"
            ? library.mlr.maxShareOfLongRun.value * refLr
            : s.kind === "E"
              ? Math.max(Math.floor(library.e.maxShareOfLongRun.value * refLr * 10 + EPS) / 10, eMin)
              : refLr;
        if (s.km > allowed + EPS) out.push(`I2:${s.ymd}:${s.kind}>allowed-share-of-LR`);
        const flagged = s.notes.indexOf("e-above-75-percent-long-run") >= 0;
        if (s.kind === "E" && (s.km > library.e.maxShareOfLongRun.value * refLr + EPS) !== flagged) out.push(`I2:${s.ymd}:e-75-note`);
      }
      const before = diffDays(inputs.raceDate, s.ymd);
      if (before >= 1 && before <= raceWeek.lastDaysCount.value && minutes > raceWeek.lastDaysMaxMinutes.value + TOL_MIN) out.push(`I15:${s.ymd}:last-days`);
    });

    // I12 und I8
    const quality = week.sessions.reduce((total, s) => total + qualityOf(s.segments), 0);
    if (weekKm > 0 && quality > intensity.qualityShareHard.value * weekKm + EPS) out.push(`I8:${tag}:${r1(quality)}/${weekKm}`);
    week.sessions.forEach((s) => {
      if (QUALITY_KINDS.indexOf(s.kind) < 0) return;
      const q = qualityOf(s.segments);
      const base = weekKm;
      let limit: number;
      if (s.kind === "T") limit = library.t.maxShareOfWeek.value * base;
      else if (s.kind === "I") limit = Math.min(library.i.maxShareOfWeek.value * base, library.i.maxKm.value);
      else if (s.kind === "R") limit = Math.min(library.r.maxShareOfWeek.value * base, library.r.maxKm.value);
      else {
        const w = workOf(s);
        const minutes = w !== undefined && w.type === "steady" && w.minutes !== undefined ? w.minutes : minutesAt(q, paces.M ?? paces.E);
        if (minutes > library.m.maxMinutes.value + TOL_MIN) out.push(`I12:${s.ymd}:M-minutes`);
        limit = library.m.maxKm.value;
        const near = lrDates.some((d) => diffDays(d, s.ymd) >= 1 && diffDays(d, s.ymd) <= library.m.nearLongRunDays.value);
        if (near) limit = Math.min(limit, library.m.nearLongRunMaxKm.value);
      }
      if (q > limit + EPS) out.push(`I12:${s.ymd}:${s.kind}:${q}>${r1(limit)}`);
      // Entlastungswoche (Review-Punkt 36): feste km-Grenzen mal Faktor der Woche (gelieferte km ÷ gelieferte Vorwoche).
      if (week.isRecoveryWeek && s.slot !== "Q2" && index > 0) {
        const factor = Math.min(1, plan.volume.weeks[index].fullWeekKm / plan.volume.weeks[index - 1].fullWeekKm);
        let fixed = Infinity;
        if (s.kind === "I") fixed = library.i.maxKm.value;
        if (s.kind === "R") fixed = library.r.maxKm.value;
        if (s.kind === "M") {
          const near = lrDates.some((d) => diffDays(d, s.ymd) >= 1 && diffDays(d, s.ymd) <= library.m.nearLongRunDays.value);
          fixed = near ? library.m.nearLongRunMaxKm.value : Math.min(library.m.maxKm.value, (library.m.maxMinutes.value * 60) / (paces.M ?? paces.E));
        }
        if (q > factor * fixed + EPS) out.push(`I12:${s.ymd}:recovery-q1:${q}>${r1(factor * fixed)}`);
      }
      // Mindestgrößen (freigegeben 2026-11-05): M ≥ 3 km, T ≥ 10 min, I ≥ 3 Wdh., R ≥ 4 Wdh.
      const w = workOf(s);
      if (s.kind === "M" && q < library.m.minKm.value - EPS) out.push(`Qmin:${s.ymd}:M`);
      if (s.kind === "T" && w !== undefined) {
        const tMinutes =
          w.type === "steady" && w.minutes !== undefined ? w.minutes : minutesAt(q, s.racePace ? paces.RACE ?? paces.E : paces.T ?? paces.E);
        if (tMinutes < library.t.minMinutes.value - TOL_MIN) out.push(`Qmin:${s.ymd}:T`);
      }
      if ((s.kind === "I" || s.kind === "R") && (w === undefined || w.type !== "reps" || w.reps < (s.kind === "R" ? library.r.minReps.value : library.i.minReps.value))) {
        out.push(`Qmin:${s.ymd}:${s.kind}`);
      }
      // 5k-Renntempo (Art I): Wiederholungen voller Länge
      if (s.kind === "I" && s.racePace && (w === undefined || w.type !== "reps" || w.repKm !== library.racePaceBlocks.reps.value["5k"].repKm)) {
        out.push(`Qmin:${s.ymd}:race-pace-rep-length`);
      }
      if (s.kind === "R" && library.r.distances.value.indexOf(inputs.distance) < 0) out.push(`I12:${s.ymd}:R-distance`);
      // I15: Abstand der letzten Q-Einheit zum Rennen
      if (diffDays(inputs.raceDate, s.ymd) < raceWeek.lastQDaysBefore.value[inputs.distance]) out.push(`I15:${s.ymd}:q-too-close`);
      // Einsteiger: nur T/M nach Minuten, ohne Pace-Ziel
      if (paces.beginner) {
        const w = workOf(s);
        if (s.kind === "I" || s.kind === "R") out.push(`beginner:${s.ymd}:${s.kind}`);
        if (s.paceBand !== null || w === undefined || w.type !== "steady" || w.minutes === undefined) out.push(`beginner:${s.ymd}:not-by-minutes`);
      }
    });

    // I13: genau 1 Q in Taper-Wochen (Ausnahmen mit Hinweis)
    if (week.mode === "taper" || isRace) {
      const qs = week.sessions.filter((s) => QUALITY_KINDS.indexOf(s.kind) >= 0).length;
      const excused =
        layout.qCount === 0 ||
        week.sessions.some((s) => s.notes.some((n) => n === "q-softened-beginner-race-week" || n === "q-softened-budget" || n === "q-softened-room"));
      if (qs > 1 || (qs === 0 && !excused)) out.push(`I13:${tag}:q=${qs}`);
      if (isRace && paces.beginner && qs > 0) out.push(`I13:${tag}:beginner-race-week-q`);
    }

    // I15: kein Long Run in den 7 Tagen vor dem Rennen
    if (lr !== undefined && diffDays(inputs.raceDate, lr.ymd) <= raceWeek.noLongRunDaysBefore.value) out.push(`I15:${lr.ymd}:lr-in-window`);

    if (lr !== undefined) {
      const normal = !week.isRecoveryWeek && week.mode !== "taper";
      lastLr = lr.km;
      if (normal) level = lr.km;
      longest = Math.max(longest, lr.km);
      afterRecovery = week.isRecoveryWeek;
    }
  });

  // I13 (Volumen): Mittel der Taper-Phase. Haben die Limits eine Taper-Woche gekürzt oder die Mindestdauern sie angehoben
  // (Hinweis an der Woche), ist ein Mittel außerhalb des Bereichs nur eine Warnung; sonst muss es halten.
  const taper = taperMeanOf(plan, inputs);
  if (taper !== null && !taper.inRange && !taper.excused) out.push(`I13:taper-mean:${taper.mean.toFixed(3)}`);
  return out;
}

/**
 * Mittel der Taper-Phase (km ohne Rennen ÷ Peak), nur bei voller Rennwoche (Rennen am Sonntag) und Standard-Zahl an
 * Taper-Wochen (wie in Schritt 2). `inRange`: Reduktion in `taper.totalReduction` (−41 bis −60 %).
 */
export function taperMeanOf(plan: SessionPlan, inputs: CoreInputs): { mean: number; inRange: boolean; excused: boolean } | null {
  const { weeks } = plan;
  const taperWeeks = weeks.filter((w) => w.phase === "taper");
  if (weeks[weeks.length - 1].sessions.length !== 7 || taperWeeks.length !== CONFIG.phases.taperWeeks.value[inputs.distance]) return null;
  const shares = taperWeeks.map((w) => {
    const race = w.sessions.filter((s) => s.kind === "RACE")[0];
    return (w.totalKm - (race === undefined ? 0 : race.km)) / plan.volume.peakKm;
  });
  const mean = shares.reduce((a, b) => a + b, 0) / shares.length;
  const { min, max } = CONFIG.taper.totalReduction.value;
  return {
    mean,
    inRange: mean >= 1 - max - 0.005 && mean <= 1 - min + 0.005,
    // Ausnahme: Limits oder Mindestdauern haben eine Taper-Woche gekürzt bzw. angehoben, oder die Tragfähigkeit hat sie
    // schon in planVolume begrenzt (`curveKm` > `fullWeekKm`).
    excused: taperWeeks.some((w) => {
      const volumeWeek = plan.volume.weeks[w.wn - 1];
      return w.notes.indexOf("week-km-reduced") >= 0 || w.notes.indexOf("week-km-raised") >= 0 || volumeWeek.curveKm > volumeWeek.fullWeekKm;
    }),
  };
}

/**
 * Steigerungsregeln auf dem gelieferten Volumen (mit Tragfähigkeit, `planSessions(...).volume`) bis zur Peak-Woche:
 * I3 (≤ 1,3 × w−2), I4 (≤ max(1,1 × w−1, w−1 + 4), nach Entlastung ≤ Niveau davor), I5 (≤ max(Grenze, `minWeekKm`)),
 * nichts über dem geplanten Verlauf (`curveKm`). Monoton (freigegeben 2026-11-05): keine Aufbauwoche kleiner als die
 * Vorwoche, Peak = letzte Woche vor dem Taper, Entlastung −20 bis −30 % zur gelieferten Vorwoche (flacher nur bis
 * `minWeekKm`).
 */
export function checkVolumeGrowth(plan: SessionPlan, inputs: CoreInputs): string[] {
  const out: string[] = [];
  const v = CONFIG.volume;
  const startKm = Math.min(Math.max(inputs.currentWeeklyKm, v.minStartKm.value[inputs.distance]), v.startKmMax.value);
  const cap = Math.floor(Math.min(v.peakKm.value[inputs.distance][inputs.runDaysPerWeek].max, startKm * v.peakStartFactor.value) + EPS);
  const weeks = plan.volume.weeks.filter((w) => w.wn <= plan.volume.peakWeek);
  let level = weeks[0].fullWeekKm;
  weeks.forEach((w, i) => {
    const km = w.fullWeekKm;
    const prev = i === 0 ? km : weeks[i - 1].fullWeekKm;
    // Der Verlauf vor Woche 1 zählt als Woche 1 (§5.3), und zwar als geplanter Wert (Angabe des Nutzers), nicht als
    // gelieferter: eine durch die Tragfähigkeit kleine Woche 1 sagt nichts über die Wochen davor.
    const prev2 = i < 2 ? weeks[0].curveKm : weeks[i - 2].fullWeekKm;
    const tag = `W${w.wn}`;
    if (km > w.curveKm + EPS) out.push(`V:${tag}:above-curve`);
    if (km > Math.max(cap, plan.minWeekKm) + EPS) out.push(`I5:${tag}`);
    if (km > v.growth.twoWeekFactor.value * prev2 + EPS) out.push(`I3:${tag}`);
    if (w.isRecoveryWeek) {
      if (km > prev + EPS) out.push(`V:${tag}:recovery-above-previous`);
      if (km < (1 - v.recovery.maxReduction.value) * prev - EPS) out.push(`V:${tag}:recovery-too-deep`);
      if (km > Math.max((1 - v.recovery.reduction.value) * prev, plan.minWeekKm) + EPS) out.push(`V:${tag}:recovery-too-shallow`);
    } else {
      // Nie kleiner als die letzte Aufbauwoche (über eine Entlastung hinweg: so groß wie die Woche davor).
      if (i > 0 && km < level - EPS) out.push(`V:${tag}:drop`);
      if (i > 0 && weeks[i - 1].isRecoveryWeek) {
        if (km > level + EPS) out.push(`I4:${tag}:after-recovery`);
      } else if (i > 0 && km > Math.max(prev * (1 + v.growth.weeklyShare.value), prev + v.growth.weeklyKm.value) + EPS) {
        out.push(`I4:${tag}`);
      }
    }
    if (!w.isRecoveryWeek) level = km;
  });
  const last = weeks[weeks.length - 1].fullWeekKm;
  if (weeks.some((w) => w.fullWeekKm > last + EPS) || Math.abs(plan.volume.peakKm - last) > EPS) out.push("V:peak-not-last");

  // Dasselbe auf den sichtbaren Wochen (`totalKm`, volle Wochen bis zur Peak-Woche). Einzige Ausnahme (§5.3, zu bestätigen):
  // eine Woche, die die Mindestdauern über den Plan heben (`week-km-raised`), darf über späteren Wochen liegen.
  const shown = plan.weeks.filter((w) => w.wn <= plan.volume.peakWeek && w.sessions.length === 7);
  let shownLevel: { km: number; raised: boolean } | null = null;
  shown.forEach((w) => {
    if (w.isRecoveryWeek) return;
    if (shownLevel !== null && w.totalKm < shownLevel.km - EPS && !shownLevel.raised) out.push(`V:W${w.wn}:shown-drop`);
    shownLevel = { km: w.totalKm, raised: w.notes.indexOf("week-km-raised") >= 0 };
  });
  const peakShown = shown.length > 0 ? shown[shown.length - 1] : undefined;
  if (peakShown !== undefined && peakShown.wn === plan.volume.peakWeek) {
    shown.forEach((w) => {
      if (w.totalKm > peakShown.totalKm + EPS && w.notes.indexOf("week-km-raised") < 0) out.push(`V:W${w.wn}:shown-above-peak-week`);
    });
  }
  return out;
}

/** Pläne, in denen eine angehobene Woche (`week-km-raised`) über einer späteren Aufbauwoche liegt (Ausnahme in §5.3). */
export function raisedAboveLaterWeek(plan: SessionPlan): boolean {
  const shown = plan.weeks.filter((w) => w.wn <= plan.volume.peakWeek && w.sessions.length === 7 && !w.isRecoveryWeek);
  return shown.some((w, i) => w.notes.indexOf("week-km-raised") >= 0 && shown.slice(i + 1).some((later) => later.totalKm < w.totalKm - EPS));
}

/** Kurzform einer Woche für Snapshots: "Mo E 9.2 · Di T 8.7[3x1.6] · …". */
export function compactSessions(plan: SessionPlan, wn: number): string {
  const week = plan.weeks.filter((w) => w.wn === wn)[0];
  return week.sessions
    .map((s) => {
      const weekday = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"][(diffDays(s.ymd, week.startYmd) + 7) % 7];
      if (s.kind === "REST") return `${weekday} –`;
      const w = workOf(s);
      let detail = "";
      if (w !== undefined && w.type === "reps") detail = `[${w.reps}x${w.repKm}]`;
      if (w !== undefined && w.type === "steady") detail = `[${w.km}${w.minutes !== undefined ? `/${w.minutes}min` : ""}]`;
      const strides = s.segments.some((x) => x.type === "strides") ? "+S" : "";
      return `${weekday} ${s.kind}${s.racePace ? "(RP)" : ""} ${s.km}${detail}${strides}`;
    })
    .join(" · ");
}
