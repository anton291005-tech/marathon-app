/**
 * Wochenumfang (docs/plan-spec.md §5): Start, Peak, Steigerung, Entlastung, Taper.
 *
 * Alle Wachstumsregeln (I3, I4) gelten für das Vollwochen-Äquivalent `fullWeekKm`: eine angebrochene Woche 1 wird
 * anteilig skaliert (`targetKm`), die Kurve rechnet mit der vollen Woche. Taper- und Rennwochen sind von I3/I4 und
 * vom Peak ausgenommen; das Rennwochen-Volumen steht "ohne Rennen" in `raceWeekExtraKm`, das Rennen zählt separat.
 */

import { CONFIG } from "./config";
import type { Range } from "./config";
import { isDistance, planCoreError, planPhases } from "./phases";
import type { PhaseWeek } from "./phases";
import type { CoreInputs, Distance, Ymd } from "./types";

export type VolumeInputs = Pick<
  CoreInputs,
  "distance" | "raceDate" | "startYmd" | "runDaysPerWeek" | "currentWeeklyKm"
>;

export type VolumeOptions = {
  /** Lage des Peaks im Korridor, 0 = Untergrenze, 1 = Obergrenze. Standard: `CONFIG.volume.peakPosition`. */
  peakPosition?: number;
  /**
   * Mindest-Wochen-km, damit jeder Lauftag seine Mindestdauer bekommt (`minWeekKm` in distribute.ts, Folgepunkt aus
   * Schritt 2). Woche 1, Entlastungswochen und der Peak-Korridor werden mindestens darauf angehoben; Taper- und
   * Rennwochen nicht (dort kürzt oder hebt die Verteilung mit Hinweis). Ohne Angabe wie bisher.
   */
  minWeekKm?: number;
  /**
   * Tragfähigkeit der Wochen (freigegeben 2026-11-05): `planVolume` plant je Woche höchstens, was die Einheiten liefern
   * können (Long-Run-Verlauf und E-Grenzen, siehe `planSessions`). Ohne Angabe unbegrenzt.
   */
  capacity?: VolumeCapacity;
};

/**
 * Tragfähigkeit eines Durchlaufs von Woche 1 bis zur Rennwoche. Zustandsbehaftet (Long-Run-Verlauf): `deliver` wird je
 * Woche genau einmal und in Reihenfolge aufgerufen, mit dem geplanten Wert (Vollwoche; Rennwoche ohne Rennen), und gibt
 * den lieferbaren Wert zurück (auf 0,1 km, höchstens der geplante). Der Zustand rückt mit dem gelieferten Wert weiter.
 */
export type VolumeCapacityRun = { deliver(index: number, km: number): number };
export type VolumeCapacity = { begin(): VolumeCapacityRun };

export type PlanVolumeNote =
  | { code: "peak-not-reached"; reason: "growth" | "run-days"; targetPeakKm: number; reachedPeakKm: number }
  | { code: "below-recommended"; weeks: number; recommendedMinWeeks: number }
  | { code: "plan-trimmed"; freeWeeks: number }
  /** Woche 1 oder der Peak-Korridor lagen unter `minWeekKm` und wurden angehoben. */
  | { code: "min-week-km-raised"; minWeekKm: number };

export type PlanVolumeWeek = PhaseWeek & {
  /** Geplante km der Woche; bei angebrochener Woche anteilig, in der Rennwoche inkl. Renndistanz. */
  targetKm: number;
  /** Wert einer vollen Woche (Grundlage von I3/I4); in der Rennwoche der Anteil ohne Rennen. */
  fullWeekKm: number;
  isRecoveryWeek: boolean;
  /** Nur in der Rennwoche: km ohne das Rennen. */
  raceWeekExtraKm?: number;
  /**
   * Geplanter Wert vor der Tragfähigkeit (Vollwoche; Rennwoche ohne Rennen). Bezug des Long-Run-Anteils (Review-Punkt 29):
   * sonst schrumpfen Woche und Long Run bei 3 Tagen gemeinsam. Ohne `capacity` gleich `fullWeekKm`.
   */
  curveKm: number;
};

export type PlanVolume = {
  weeks: PlanVolumeWeek[];
  /** Höchster Wochenumfang bis zur Peak-Woche (Vollwoche, ohne Taper- und Rennwoche). */
  peakKm: number;
  /** Peak, den die Tabelle und `peakPosition` vorgeben; `peakKm` kann darunter liegen, wenn die Steigerungsregeln nicht reichen. */
  targetPeakKm: number;
  /** Wochennummer der Peak-Woche (letzte Nicht-Taper-Woche). */
  peakWeek: number;
  /** Untere und obere Grenze des Peak-Korridors (ganze km). */
  peakCorridor: Range;
  taperWeeks: number;
  freeWeeks: number;
  effectiveStartYmd: Ymd;
  notes: PlanVolumeNote[];
};

const EPS = 1e-9;

const mid = (range: Range): number => (range.min + range.max) / 2;

const smoothstep = (x: number): number => x * x * (3 - 2 * x);

/** Verlaufsformen von Woche 1 zur Peak-Woche; die erste, die den Peak erreicht, gewinnt. Die letzte steigt so schnell wie erlaubt. */
const SHAPES: Array<(x: number) => number> = [smoothstep, (x) => x, (x) => 1 - (1 - x) * (1 - x), () => 1];

function validate(inputs: VolumeInputs): void {
  if (!isDistance(inputs.distance)) throw planCoreError("invalid-input", "distance");
  const runDays = CONFIG.scope.runDaysPerWeek.value;
  if (!(inputs.runDaysPerWeek >= runDays.min && inputs.runDaysPerWeek <= runDays.max) || inputs.runDaysPerWeek % 1 !== 0) {
    throw planCoreError("invalid-input", "runDaysPerWeek");
  }
  const weeklyKm = CONFIG.inputs.currentWeeklyKm.value;
  if (!(inputs.currentWeeklyKm >= weeklyKm.min && inputs.currentWeeklyKm <= weeklyKm.max)) {
    throw planCoreError("invalid-input", "currentWeeklyKm");
  }
}

/** Peak-Korridor nach §5.1/§5.2 in ganzen km. */
function peakCorridorFor(inputs: VolumeInputs): Range {
  const { volume } = CONFIG;
  const table = volume.peakKm.value[inputs.distance][inputs.runDaysPerWeek];
  const startKm = Math.min(Math.max(inputs.currentWeeklyKm, volume.minStartKm.value[inputs.distance]), volume.startKmMax.value);
  const cap = Math.floor(Math.min(table.max, startKm * volume.peakStartFactor.value) + EPS);
  const floor = Math.min(Math.max(table.min, Math.ceil(startKm - EPS)), cap);
  return { min: floor, max: cap };
}

type Curve = { full: number[]; planned: number[]; recovery: boolean[]; run: VolumeCapacityRun | null; capped: boolean };

/**
 * Wochen 1 … `peakWeek` als Vollwochen-km. Pro Woche gilt das Kleinste aus Verlaufsform, I4-Grenze, I3-Grenze und
 * Peak-Obergrenze. Der Verlauf vor Woche 1 zählt als Woche 1 (die Angaben des Nutzers sind Ø der letzten Wochen).
 */
function simulate(
  shape: (x: number) => number,
  peakWeek: number,
  weekOneKm: number,
  peakTarget: number,
  capKm: number,
  minWeekKm: number,
  capacity: VolumeCapacity | undefined,
): Curve {
  const { growth, recovery } = CONFIG.volume;
  const full: number[] = [];
  const planned: number[] = [];
  const isRecovery: boolean[] = [];
  const run = capacity === undefined ? null : capacity.begin();
  let capped = false;
  const at = (week: number): number => (week < 1 ? weekOneKm : full[week - 1]);
  let level = weekOneKm;

  for (let week = 1; week <= peakWeek; week += 1) {
    const recoveryWeek = week > 1 && week % recovery.everyNWeeks.value === 0 && week <= peakWeek - 2;
    let value = weekOneKm;
    if (week > 1) {
      const previous = at(week - 1);
      if (recoveryWeek) {
        // −20 %; bei winzigen Umfängen nicht tiefer, als I3 für die übernächste Woche zulässt (sonst gäbe es danach einen Rückgang).
        // Nie über der Vorwoche: mit Tragfähigkeit kann die gelieferte Vorwoche unter `minWeekKm` liegen.
        value = Math.min(
          previous,
          Math.max(
            Math.round(previous * (1 - recovery.reduction.value)),
            Math.ceil(previous / growth.twoWeekFactor.value - EPS),
            minWeekKm,
          ),
        );
      } else {
        const x = peakWeek > 1 ? (week - 1) / (peakWeek - 1) : 1;
        const trend = Math.round(weekOneKm + (peakTarget - weekOneKm) * shape(x));
        const stepCap = isRecovery[week - 2]
          ? level
          : Math.floor(Math.max(previous * (1 + growth.weeklyShare.value), previous + growth.weeklyKm.value) + EPS);
        const twoWeekCap = Math.floor(at(week - 2) * growth.twoWeekFactor.value + EPS);
        value = Math.min(trend, stepCap, twoWeekCap, capKm);
      }
    }
    planned.push(value);
    if (run !== null) {
      const delivered = Math.min(value, run.deliver(week - 1, value));
      if (delivered < value) capped = true;
      value = delivered;
    }
    full.push(value);
    isRecovery.push(recoveryWeek);
    if (!recoveryWeek) level = value;
  }
  return { full, planned, recovery: isRecovery, run, capped };
}

/** Anteile am Peak je Taper-Woche (Reihenfolge: erste Taper-Woche … Rennwoche, Rennwoche "ohne Rennen"). */
function taperShares(distance: Distance, taperWeeks: number): number[] {
  const { taper } = CONFIG;
  const marathonLike = distance === "m" || distance === "hm";
  const raceShare = mid(marathonLike ? taper.raceWeekShare.value : taper.raceWeekShareShort.value);
  if (taperWeeks === 1) return [raceShare];
  const first = marathonLike ? mid(taper.firstWeekShare.value) : taper.firstWeekShare.value.min;
  const shares: number[] = [];
  for (let index = 0; index < taperWeeks; index += 1) {
    shares.push(first + ((raceShare - first) * index) / (taperWeeks - 1));
  }
  return shares;
}

export function planVolume(inputs: VolumeInputs, options: VolumeOptions = {}): PlanVolume {
  validate(inputs);
  const phases = planPhases(inputs);
  const position = options.peakPosition === undefined ? CONFIG.volume.peakPosition.value : options.peakPosition;
  if (!(position >= 0 && position <= 1)) throw planCoreError("invalid-input", "peakPosition");

  const minWeekKm = options.minWeekKm === undefined ? 0 : Math.ceil(options.minWeekKm - EPS);
  if (!(minWeekKm >= 0 && minWeekKm <= CONFIG.volume.startKmMax.value)) throw planCoreError("invalid-input", "minWeekKm");

  const { distance } = inputs;
  const plainCorridor = peakCorridorFor(inputs);
  const corridorMax = Math.max(plainCorridor.max, minWeekKm);
  const corridor: Range = { min: Math.min(Math.max(plainCorridor.min, minWeekKm), corridorMax), max: corridorMax };
  const plainWeekOneKm = Math.max(
    CONFIG.volume.weekOneMinKm.value,
    Math.min(Math.round(inputs.currentWeeklyKm), plainCorridor.max),
  );
  const weekOneKm = Math.max(plainWeekOneKm, minWeekKm);
  const peakTarget = Math.min(
    corridor.max,
    Math.max(weekOneKm, Math.round(corridor.min + position * (corridor.max - corridor.min))),
  );

  const peakWeek = phases.weeks.length - phases.taperWeeks;
  let curve = simulate(SHAPES[0], peakWeek, weekOneKm, peakTarget, corridor.max, minWeekKm, options.capacity);
  for (let index = 1; index < SHAPES.length && curve.full[peakWeek - 1] < peakTarget; index += 1) {
    curve = simulate(SHAPES[index], peakWeek, weekOneKm, peakTarget, corridor.max, minWeekKm, options.capacity);
  }
  // Taper- und Rennwochen laufen im selben Durchlauf der Tragfähigkeit weiter.
  const deliver = (index: number, km: number): number => (curve.run === null ? km : Math.min(km, curve.run.deliver(index, km)));

  const peakKm = curve.full.reduce((best, value) => Math.max(best, value), 0);
  const shares = taperShares(distance, phases.taperWeeks);
  const raceKm = CONFIG.scope.raceKm.value[distance];

  const weeks: PlanVolumeWeek[] = phases.weeks.map((week, index) => {
    if (week.wn <= peakWeek) {
      const fullWeekKm = curve.full[index];
      return {
        ...week,
        fullWeekKm,
        curveKm: curve.planned[index],
        targetKm: week.days < 7 ? Math.round((fullWeekKm * week.days) / 7) : fullWeekKm,
        isRecoveryWeek: curve.recovery[index],
      };
    }
    const share = shares[week.wn - peakWeek - 1];
    if (week.wn < phases.weeks.length) {
      const curveKm = Math.round(peakKm * share);
      const fullWeekKm = deliver(index, curveKm);
      // Taper-Wochen vor der Rennwoche sind immer volle Wochen (nur Woche 1 und die Rennwoche können angebrochen sein).
      return { ...week, fullWeekKm, curveKm, targetKm: fullWeekKm, isRecoveryWeek: false };
    }
    // Rennwoche: Tage vor dem Rennen bestimmen den Anteil ohne Rennen (voll bei Rennen am Sonntag).
    const daysBeforeRace = Math.max(0, week.days - 1);
    const curveKm = Math.round(peakKm * share * Math.min(1, daysBeforeRace / CONFIG.taper.fullRaceWeekDaysBefore.value));
    const extra = deliver(index, curveKm);
    return {
      ...week,
      curveKm,
      fullWeekKm: extra,
      targetKm: Math.round((raceKm + extra) * 10) / 10,
      isRecoveryWeek: false,
      raceWeekExtraKm: extra,
    };
  });

  const notes: PlanVolumeNote[] = [];
  // Das Ziel ist weich (Entlastung und I3 kosten ab und zu 1–2 km); gemeldet wird erst bei mehr als 10 % darunter.
  if (peakKm < peakTarget * (1 - CONFIG.volume.peakShortfallNote.value) - EPS) {
    notes.push({ code: "peak-not-reached", reason: curve.capped ? "run-days" : "growth", targetPeakKm: peakTarget, reachedPeakKm: peakKm });
  }
  if (phases.belowRecommended) {
    notes.push({
      code: "below-recommended",
      weeks: phases.weeks.length,
      recommendedMinWeeks: CONFIG.planLength.recommendedWeeks.value[distance].min,
    });
  }
  if (phases.freeWeeks > 0) notes.push({ code: "plan-trimmed", freeWeeks: phases.freeWeeks });
  if (weekOneKm > plainWeekOneKm || corridor.max > plainCorridor.max) notes.push({ code: "min-week-km-raised", minWeekKm });

  return {
    weeks,
    peakKm,
    targetPeakKm: peakTarget,
    peakWeek,
    peakCorridor: corridor,
    taperWeeks: phases.taperWeeks,
    freeWeeks: phases.freeWeeks,
    effectiveStartYmd: phases.effectiveStartYmd,
    notes,
  };
}
