/**
 * Einheiten-Bibliothek (docs/plan-spec.md §7): Bausteine, Größen und Limits je Art.
 *
 * Eine Einheit besteht aus Bausteinen (`Segment`); ihre km sind immer die Summe der Bausteine (I1), Strides zählen nicht.
 * Qualitätseinheiten werden aus einem Ziel für die Qualitäts-km gebaut (Belastungsanteil ohne Ein-/Auslaufen und
 * Trabpausen) und liegen nie darüber; zu kleine Blöcke ergeben `null` (der Aufrufer macht daraus E + Strides).
 * Alle km liegen auf 0,1 km. Trabpausen rechnen wie der App-Parser mit `restJogSecPerKm` (Pausen in 30-s-Schritten,
 * damit die km auf 0,1 aufgehen).
 *
 * Einsteiger-Modus (keine Rennangabe): T und M nach Minuten; die km folgen über die E-Pace, ein Pace-Ziel gibt es nicht.
 */

import { CONFIG } from "./config";
import { floorTenth, roundTenth } from "./longRun";
import type { PaceBand, PaceBands, PaceCode, PaceProfile } from "./pace";
import { paceBands } from "./pace";
import type { QualityChoice, QualityNoteCode } from "./qTypes";
import type { PlacedSlot } from "./templates";
import type { CoreKind, Distance, RunDays, Ymd } from "./types";

const EPS = 1e-9;

export type SegmentPace = PaceCode | "RACE";

export type Segment =
  | { type: "warmup"; km: number }
  | { type: "cooldown"; km: number }
  /** Lockerer Anteil eines LR+M. */
  | { type: "easy"; km: number }
  /** Dauerlauf-Block (T-Dauerlauf, M-Lauf, M-Block); `minutes` nur im Einsteiger-Modus (Block nach Zeit). */
  | { type: "steady"; km: number; pace: SegmentPace; minutes?: number }
  | { type: "reps"; reps: number; repKm: number; pace: SegmentPace; restSec: number; restKm: number }
  /** Zählen nicht zu den km. */
  | { type: "strides"; reps: number; meters: number; seconds: number };

export type SessionNoteCode =
  | QualityNoteCode
  /** Q-Budget aufgebraucht oder Block zu kurz: E + Strides. */
  | "q-softened-budget"
  /** Woche zu klein für das Q: E + Strides. */
  | "q-softened-room"
  /** MLR passt nicht (Platz, Mindestdauer, 75 % des Long Runs): E. */
  | "mlr-as-e"
  /** Taper-Long-Run auf 60 % des längsten Long Runs gekürzt (Folgepunkt b). */
  | "taper-long-run-cut"
  /** M-Block höchstens `nearLongRunMaxKm`, weil der Long Run höchstens `nearLongRunDays` Tage später kommt. */
  | "m-block-near-long-run"
  /** E länger als 75 % des Long Runs (höchstens so lang wie er), weil sonst die Mindestdauer nicht passt (Review-Punkt 31a). */
  | "e-above-75-percent-long-run"
  /** E/REC unter der Mindestdauer, weil der Long Run (in seinen Grenzen) kürzer ist: nie länger als er (I11 vor I2). */
  | "e-shortened-to-long-run";

export type CoreSession = {
  ymd: Ymd;
  /** Rolle aus dem Layout (`REST` für Ruhetage). */
  slot: PlacedSlot;
  kind: CoreKind;
  km: number;
  /** Geschätzte Dauer (Bausteine bei ihrer Pace, Jog-Anteile bei E-Pace). */
  minutes: number;
  segments: Segment[];
  /** Pace-Ziel für das `pace`-Feld; `null` bei Ruhetag und Einsteiger-T/M (nur Gefühl). */
  paceBand: (PaceBand & { code: SegmentPace }) | null;
  /** M/T/I/R-Anteil ohne Ein-/Auslaufen und Trabpausen (I8). */
  qualityKm: number;
  /** Renntempo-Block (§7.2: HM-Pace-Blöcke, kurzes 10k-/5k-Renntempo). */
  racePace: boolean;
  notes: SessionNoteCode[];
};

/** Paces einer Plan-Erzeugung (Sekunden je km) und ihre Bänder. */
export type SessionPaces = {
  beginner: boolean;
  distance: Distance;
  E: number;
  REC: number;
  /** Fehlen im Einsteiger-Modus. */
  M?: number;
  T?: number;
  I?: number;
  R?: number;
  RACE?: number;
  bands: PaceBands;
};

export function sessionPacesOf(profile: PaceProfile, distance: Distance): SessionPaces {
  const bands = paceBands(profile);
  if (profile.mode === "beginner") {
    return { beginner: true, distance, E: profile.paces.E, REC: profile.paces.REC, bands };
  }
  const { paces } = profile;
  return {
    beginner: false,
    distance,
    E: paces.E,
    REC: paces.REC,
    M: paces.M,
    T: paces.T,
    I: paces.I,
    R: paces.R,
    RACE: profile.racePace.secPerKm,
    bands,
  };
}

const kmAt = (minutes: number, secPerKm: number): number => (minutes * 60) / secPerKm;
const minutesAt = (km: number, secPerKm: number): number => (km * secPerKm) / 60;
const ceilTenth = (km: number): number => Math.ceil(km * 10 - EPS) / 10;
const round30 = (seconds: number): number => Math.max(30, Math.round(seconds / 30) * 30);

function paceOf(code: SegmentPace, paces: SessionPaces): number {
  const value = paces[code];
  // Einsteiger: T/M nach Gefühl, gerechnet mit der E-Pace (km folgen aus den Minuten).
  return typeof value === "number" ? value : paces.E;
}

// ───────────────────────────── Summen ─────────────────────────────

/** km der Einheit: Summe der Bausteine ohne Strides. */
export function segmentsKm(segments: Segment[]): number {
  let sum = 0;
  segments.forEach((segment) => {
    if (segment.type === "reps") sum += segment.reps * segment.repKm + segment.restKm;
    else if (segment.type !== "strides") sum += segment.km;
  });
  return roundTenth(sum);
}

/** Belastungsanteil (I8): Dauerlauf- und Wiederholungs-Blöcke, ohne Trabpausen. */
export function segmentsQualityKm(segments: Segment[]): number {
  let sum = 0;
  segments.forEach((segment) => {
    if (segment.type === "reps") sum += segment.reps * segment.repKm;
    else if (segment.type === "steady") sum += segment.km;
  });
  return roundTenth(sum);
}

/** Geschätzte Dauer in Minuten; locker = E-Pace (REC-Einheiten rechnen mit `REC`). */
export function segmentsMinutes(segments: Segment[], paces: SessionPaces, easyCode: "E" | "REC" = "E"): number {
  let sum = 0;
  segments.forEach((segment) => {
    if (segment.type === "reps") {
      sum += minutesAt(segment.reps * segment.repKm, paceOf(segment.pace, paces)) + (segment.reps - 1) * (segment.restSec / 60);
    } else if (segment.type === "steady") {
      sum += segment.minutes !== undefined ? segment.minutes : minutesAt(segment.km, paceOf(segment.pace, paces));
    } else if (segment.type !== "strides") {
      sum += minutesAt(segment.km, paces[easyCode]);
    }
  });
  return Math.round(sum * 10) / 10;
}

// ───────────────────────────── Locker ─────────────────────────────

export type EasyKind = "E" | "REC" | "MLR";

/** Mindest-km einer lockeren Einheit (§7: E 25 min, REC 20 min, MLR 75 min). */
export function easyMinKm(kind: EasyKind, paces: SessionPaces): number {
  const { library } = CONFIG;
  if (kind === "REC") return ceilTenth(kmAt(library.rec.minutes.value.min, paces.REC));
  if (kind === "MLR") return ceilTenth(kmAt(library.mlr.minutes.value.min, paces.E));
  return ceilTenth(kmAt(library.e.minutes.value.min, paces.E));
}

/** Höchst-km nach Dauer (§7: E 75 min, bei 6 Tagen 90; REC 45; MLR 110). Der Bezug auf den Long Run kommt dazu. */
export function easyMaxKmByMinutes(kind: EasyKind, paces: SessionPaces, runDays: RunDays): number {
  const { library } = CONFIG;
  if (kind === "REC") return floorTenth(kmAt(library.rec.minutes.value.max, paces.REC));
  if (kind === "MLR") return floorTenth(kmAt(library.mlr.minutes.value.max, paces.E));
  const minutes = runDays >= 6 ? library.e.minutesMaxSixDays.value : library.e.minutes.value.max;
  return floorTenth(kmAt(minutes, paces.E));
}

/** Höchstanteil am Long Run (E und MLR 75 %; REC hat keinen eigenen, I11 gilt trotzdem). */
export function easyMaxShareOfLongRun(kind: EasyKind): number {
  const { library } = CONFIG;
  return kind === "MLR" ? library.mlr.maxShareOfLongRun.value : library.e.maxShareOfLongRun.value;
}

export function stridesSegment(raceWeek: boolean): Segment {
  const { strides } = CONFIG.library;
  return {
    type: "strides",
    reps: raceWeek ? strides.repsRaceWeek.value : strides.repsStandard.value,
    meters: strides.meters.value,
    seconds: strides.seconds.value,
  };
}

function bandFor(code: SegmentPace, paces: SessionPaces): (PaceBand & { code: SegmentPace }) | null {
  const band = paces.bands[code];
  return band === undefined ? null : { code, fast: band.fast, slow: band.slow };
}

/** Lockere Einheit (E, REC, MLR) oder Long Run ohne M-Block. */
export function buildEasySession(args: {
  ymd: Ymd;
  slot: PlacedSlot;
  kind: EasyKind | "LR";
  km: number;
  paces: SessionPaces;
  strides?: Segment | null;
  notes?: SessionNoteCode[];
}): CoreSession {
  const km = roundTenth(args.km);
  const code = args.kind === "REC" ? "REC" : "E";
  const segments: Segment[] = [{ type: "easy", km }];
  if (args.strides) segments.push(args.strides);
  return {
    ymd: args.ymd,
    slot: args.slot,
    kind: args.kind,
    km,
    minutes: segmentsMinutes(segments, args.paces, code),
    segments,
    paceBand: bandFor(code, args.paces),
    qualityKm: 0,
    racePace: false,
    notes: args.notes ? args.notes.slice() : [],
  };
}

export function buildRestSession(ymd: Ymd): CoreSession {
  return { ymd, slot: "REST", kind: "REST", km: 0, minutes: 0, segments: [], paceBand: null, qualityKm: 0, racePace: false, notes: [] };
}

// ───────────────────────────── Qualität ─────────────────────────────

export type QualityType = Exclude<QualityChoice, { type: "STRIDES" }>;

/** Ein-/Auslaufen nach Wochen-km (ohne Rennen). */
export function warmupCooldownFor(weekKm: number): { warmupKm: number; cooldownKm: number } {
  const rows = CONFIG.library.warmupCooldownByWeekKm.value;
  for (let index = 0; index < rows.length; index += 1) {
    if (weekKm <= rows[index].upToWeekKm) return { warmupKm: rows[index].warmupKm, cooldownKm: rows[index].cooldownKm };
  }
  const last = rows[rows.length - 1];
  return { warmupKm: last.warmupKm, cooldownKm: last.cooldownKm };
}

const kindOfChoice = (choice: QualityType): CoreKind => (choice.type === "RACE_PACE" ? choice.kind : choice.type);

/**
 * Obergrenze der Qualitäts-km je Art (I12): T ≤ 10 %, I ≤ min(8 %, 10 km), R ≤ min(5 %, 8 km),
 * M ≤ min(29 km, 110 min) und ≤ 10 km, wenn der Long Run höchstens 2 Tage später kommt. Q1L: halbes Limit.
 */
export function qualityLimitKm(
  choice: QualityType,
  weekKm: number,
  paces: SessionPaces,
  options: { light?: boolean; nearLongRun?: boolean } = {},
): number {
  const { library, intensity } = CONFIG;
  const kind = kindOfChoice(choice);
  let limit: number;
  if (kind === "T") limit = library.t.maxShareOfWeek.value * weekKm;
  else if (kind === "I") limit = Math.min(library.i.maxShareOfWeek.value * weekKm, library.i.maxKm.value);
  else if (kind === "R") limit = Math.min(library.r.maxShareOfWeek.value * weekKm, library.r.maxKm.value);
  else {
    limit = Math.min(library.m.maxKm.value, kmAt(library.m.maxMinutes.value, paceOf("M", paces)));
    if (options.nearLongRun) limit = Math.min(limit, library.m.nearLongRunMaxKm.value);
  }
  if (options.light) limit *= intensity.lightQualityFactor.value;
  return floorTenth(limit);
}

/**
 * Kleinste Qualitäts-km, die einen Block ergeben (freigegeben 2026-11-05): M ≥ 3 km, T ≥ 10 min (auch Renntempo HM/10k;
 * Einsteiger über die E-Pace), I ≥ 3 Wiederholungen à 3 min, R ≥ 4 × 200 m, 5k-Renntempo ≥ 3 Wiederholungen voller Länge.
 */
export function minQualityKm(choice: QualityType, paces: SessionPaces): number {
  const { library } = CONFIG;
  if (choice.type === "I") return roundTenth(library.i.minReps.value * ceilTenth(kmAt(library.i.repMinutes.value.min, paceOf("I", paces))));
  if (choice.type === "R") return roundTenth((library.r.minReps.value * library.r.repMeters.value.min) / 1000);
  if (choice.type === "M") return paces.beginner ? ceilTenth(kmAt(Math.ceil(minutesAt(library.m.minKm.value, paces.E) - EPS), paces.E)) : library.m.minKm.value;
  if (choice.type === "RACE_PACE" && choice.kind === "I") return roundTenth(library.i.minReps.value * library.racePaceBlocks.reps.value["5k"].repKm);
  const pace = paces.beginner ? paces.E : paceOf(choice.type === "RACE_PACE" ? "RACE" : "T", paces);
  return ceilTenth(kmAt(library.t.minMinutes.value, pace));
}

export type QualityBuild = {
  kind: CoreKind;
  segments: Segment[];
  qualityKm: number;
  racePace: boolean;
};

function repsSegment(reps: number, repKm: number, pace: SegmentPace, restSec: number): Segment {
  const restKm = roundTenth(((reps - 1) * restSec) / CONFIG.library.restJogSecPerKm.value);
  return { type: "reps", reps, repKm: roundTenth(repKm), pace, restSec, restKm };
}

/** Arbeitsteil einer Qualitätseinheit mit höchstens `targetKm` Qualitäts-km; `null` = zu klein. */
function workSegment(choice: QualityType, targetKm: number, paces: SessionPaces): Segment | null {
  const { library } = CONFIG;
  const tMinMinutes = library.t.minMinutes.value;
  const mMinKm = library.m.minKm.value;
  const target = floorTenth(targetKm);
  if (!(target > 0)) return null;

  if (choice.type === "T" || choice.type === "M") {
    const code: SegmentPace = choice.type;
    if (paces.beginner) {
      // Nach Minuten: T höchstens 20 min, M höchstens 110 min; km über die E-Pace.
      const cap = choice.type === "T" ? library.t.continuousMaxMinutes.value : library.m.maxMinutes.value;
      const minutes = Math.floor(Math.min(cap, minutesAt(target, paces.E)) + EPS);
      const km = floorTenth(kmAt(minutes, paces.E));
      if (choice.type === "T" ? minutes < tMinMinutes : km < mMinKm - EPS) return null;
      return { type: "steady", km, pace: code, minutes };
    }
    const pace = paceOf(code, paces);
    const minutes = minutesAt(target, pace);
    if (choice.type === "T" ? minutes < tMinMinutes - EPS : target < mMinKm - EPS) return null;
    if (choice.type === "M" || minutes <= library.t.continuousMaxMinutes.value + EPS) {
      return { type: "steady", km: target, pace: code };
    }
    // Cruise-Intervalle: 3–5 Wiederholungen, höchstens 1,6 km; die Zahl ist gerundet, die Länge passt sich nach unten an.
    const repKm = library.t.cruiseRepKm.value;
    const { min, max } = library.t.cruiseReps.value;
    const reps = Math.min(max, Math.max(min, Math.round(target / repKm)));
    return repsSegment(reps, Math.min(repKm, floorTenth(target / reps)), "T", library.t.cruiseRestSeconds.value);
  }

  if (choice.type === "I") {
    const pace = paceOf("I", paces);
    const { repMinutes, repTargetMinutes, minReps, restToRepRatio } = library.i;
    let rep = roundTenth(kmAt(repTargetMinutes.value, pace));
    rep = Math.min(rep, floorTenth(kmAt(repMinutes.value.max, pace)));
    rep = Math.max(rep, ceilTenth(kmAt(repMinutes.value.min, pace)));
    let reps = Math.floor(target / rep + EPS);
    if (reps < minReps.value) {
      rep = ceilTenth(kmAt(repMinutes.value.min, pace));
      reps = Math.floor(target / rep + EPS);
    }
    if (reps < minReps.value) return null;
    return repsSegment(reps, rep, "I", round30(rep * pace * restToRepRatio.value));
  }

  if (choice.type === "R") {
    const pace = paceOf("R", paces);
    const { repMeters, longRepMinReps, minReps, restToRepRatio } = library.r;
    const longRep = repMeters.value.max / 1000;
    const shortRep = repMeters.value.min / 1000;
    let rep = longRep;
    let reps = Math.floor(target / longRep + EPS);
    if (reps < longRepMinReps.value) {
      rep = shortRep;
      reps = Math.floor(target / shortRep + EPS);
    }
    if (reps < minReps.value) return null;
    return repsSegment(reps, rep, "R", round30(rep * pace * restToRepRatio.value));
  }

  // Renntempo-Blöcke
  const pace = paceOf("RACE", paces);
  if (choice.kind === "I") {
    // 5k-Renntempo zählt als I: mindestens `i.minReps` Wiederholungen voller Länge.
    const config5k = library.racePaceBlocks.reps.value["5k"];
    const reps5k = Math.floor(target / config5k.repKm + EPS);
    if (reps5k < library.i.minReps.value) return null;
    return repsSegment(reps5k, config5k.repKm, "RACE", config5k.restSec);
  }
  const config = library.racePaceBlocks.reps.value[paces.distance === "10k" ? "10k" : "hm"];
  const minReps = library.racePaceBlocks.minReps.value;
  // Zahl der Wiederholungen gerundet (mindestens `minReps`), Länge höchstens die konfigurierte, nach unten angepasst.
  const reps = Math.max(minReps, Math.round(target / config.repKm));
  const rep = Math.min(config.repKm, floorTenth(target / reps));
  if (!(rep > 0) || minutesAt(rep * reps, pace) < tMinMinutes - EPS) return null;
  return repsSegment(reps, rep, "RACE", config.restSec);
}

/**
 * Qualitätseinheit (T, I, R, M, Renntempo) mit höchstens `targetKm` Qualitäts-km und Ein-/Auslaufen nach Wochen-km.
 * `null`, wenn der Block die Mindestgröße nicht erreicht (dann E + Strides).
 */
export function buildQualityParts(choice: QualityType, targetKm: number, weekKm: number, paces: SessionPaces): QualityBuild | null {
  const work = workSegment(choice, targetKm, paces);
  if (work === null) return null;
  const { warmupKm, cooldownKm } = warmupCooldownFor(weekKm);
  const segments: Segment[] = [{ type: "warmup", km: warmupKm }, work, { type: "cooldown", km: cooldownKm }];
  return {
    kind: kindOfChoice(choice),
    segments,
    qualityKm: segmentsQualityKm(segments),
    racePace: choice.type === "RACE_PACE",
  };
}

export function buildQualitySession(args: {
  ymd: Ymd;
  slot: PlacedSlot;
  parts: QualityBuild;
  paces: SessionPaces;
  notes?: SessionNoteCode[];
}): CoreSession {
  const { parts, paces } = args;
  const work = parts.segments.filter((segment) => segment.type === "steady" || segment.type === "reps")[0];
  const code = work !== undefined && (work.type === "steady" || work.type === "reps") ? work.pace : "E";
  return {
    ymd: args.ymd,
    slot: args.slot,
    kind: parts.kind,
    km: segmentsKm(parts.segments),
    minutes: segmentsMinutes(parts.segments, paces),
    segments: parts.segments,
    paceBand: bandFor(code, paces),
    qualityKm: parts.qualityKm,
    racePace: parts.racePace,
    notes: args.notes ? args.notes.slice() : [],
  };
}

/** Höchster M-Block eines LR+M (§7: ≤ 50 % des Long Runs, ≤ min(29 km, 110 min)). */
export function longRunPlusMBlockLimitKm(longRunKm: number, paces: SessionPaces): number {
  const { longRunPlusM } = CONFIG.library;
  return floorTenth(
    Math.min(
      longRunPlusM.maxShareOfLongRun.value * longRunKm,
      longRunPlusM.maxKm.value,
      kmAt(longRunPlusM.maxMinutes.value, paceOf("M", paces)),
    ),
  );
}

/** Long Run mit M-Block am Ende; `null`, wenn der Block kürzer als `m.minKm` wäre. */
export function buildLongRunPlusM(args: {
  ymd: Ymd;
  slot: PlacedSlot;
  longRunKm: number;
  blockKm: number;
  paces: SessionPaces;
  notes?: SessionNoteCode[];
}): CoreSession | null {
  const { paces } = args;
  const lr = roundTenth(args.longRunKm);
  let block = floorTenth(Math.min(args.blockKm, longRunPlusMBlockLimitKm(lr, paces)));
  let minutes: number | undefined;
  if (paces.beginner) {
    minutes = Math.floor(minutesAt(block, paces.E) + EPS);
    block = floorTenth(kmAt(minutes, paces.E));
  }
  if (block < CONFIG.library.m.minKm.value - EPS) return null;
  const steady: Segment = minutes === undefined ? { type: "steady", km: block, pace: "M" } : { type: "steady", km: block, pace: "M", minutes };
  const segments: Segment[] = [{ type: "easy", km: roundTenth(lr - block) }, steady];
  return {
    ymd: args.ymd,
    slot: args.slot,
    kind: "LR+M",
    km: segmentsKm(segments),
    minutes: segmentsMinutes(segments, paces),
    segments,
    paceBand: bandFor("E", paces),
    qualityKm: segmentsQualityKm(segments),
    racePace: false,
    notes: args.notes ? args.notes.slice() : [],
  };
}
