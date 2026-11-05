/**
 * Q-Typ-Wahl (docs/plan-spec.md §7.2): Welche Art bekommt ein Q-Slot des Layouts?
 *
 * Nur die Art, keine Größe (`sessions.ts`). Regeln:
 * - Basis: bis Woche `baseQualityFromWeek` − 1 Strides (E + Strides), danach die zweite Art der Tabelle (R bei 5k, sonst T).
 * - Aufbau/Spezifisch: Q1 = erste Art, Q2 = zweite Art. Mit nur einem Q wechseln die Arten nach `phaseIndex`.
 *   HM Spezifisch: Q2 wechselt wochenweise I / T (`hmSpecificQ2`). Marathon Spezifisch: in jeder n-ten
 *   Nicht-Entlastungswoche wird der Long Run zu LR+M, dann tauschen Q1 und Q2 (Q1 = T statt M-Lauf).
 * - Taper-Woche und Rennwoche: das Taper-Token (kurzes Renntempo bzw. M-Pace).
 * - Weicher machen (nie härter): Q2 in der Entlastungswoche und Q2 im Einsteiger-Modus werden zu E + Strides, das Q der
 *   Einsteiger-Rennwoche auch (Folgepunkt a). Einsteiger bekommen nie I/R: daraus wird T (nach Minuten, `sessions.ts`).
 */

import { CONFIG } from "./config";
import type { QualityToken, SpecPhase } from "./config";
import type { WeekMode } from "./templates";
import type { CorePhase, Distance, RunDays } from "./types";

export type QualityChoice =
  | { type: "STRIDES" }
  | { type: "T" }
  | { type: "I" }
  | { type: "R" }
  | { type: "M" }
  /** Renntempo-Blöcke: HM und 10k als T, 5k als I (Limits und Zone der Art). */
  | { type: "RACE_PACE"; kind: "T" | "I" };

export type QualityNoteCode =
  | "q-softened-recovery-week"
  | "q-softened-beginner"
  | "q-softened-beginner-race-week";

export type QualitySlot = "Q1" | "Q1L" | "Q2";

export type QualityContext = {
  distance: Distance;
  mode: WeekMode;
  phase: CorePhase;
  wn: number;
  slot: QualitySlot;
  /** Zahl der Nicht-Entlastungswochen derselben Phase vor dieser Woche (0 = erste). */
  phaseIndex: number;
  isRecoveryWeek: boolean;
  beginner: boolean;
  runDays: RunDays;
  /** Q-Slots dieser Woche im Layout (1 oder 2). */
  qSlots: number;
  /** Der Long Run dieser Woche ist LR+M (`isLongRunPlusMWeek`). */
  longRunPlusM: boolean;
};

export type QualityPick = { choice: QualityChoice; note?: QualityNoteCode };

const specPhaseOf = (phase: CorePhase): SpecPhase => (phase === "peak" ? "specific" : phase);

/** LR+M: nur Marathon, Spezifisch, keine Entlastung, Woche mit Long Run, jede n-te Nicht-Entlastungswoche der Phase. */
export function isLongRunPlusMWeek(args: {
  distance: Distance;
  mode: WeekMode;
  phase: CorePhase;
  isRecoveryWeek: boolean;
  phaseIndex: number;
  hasLongRun: boolean;
}): boolean {
  const { longRunPlusM } = CONFIG.library;
  const every = CONFIG.qualityTypes.longRunPlusMEveryNthWeek.value;
  return (
    args.hasLongRun &&
    args.mode === "main" &&
    !args.isRecoveryWeek &&
    longRunPlusM.distances.value.indexOf(args.distance) >= 0 &&
    specPhaseOf(args.phase) === longRunPlusM.phase.value &&
    args.phaseIndex % every === every - 1
  );
}

function choiceOf(token: QualityToken, beginner: boolean): QualityChoice {
  switch (token) {
    case "STRIDES":
      return { type: "STRIDES" };
    case "R":
    case "I":
      return beginner ? { type: "T" } : { type: token };
    case "T":
      return { type: "T" };
    case "M":
    case "SHORT_M_PACE":
      return { type: "M" };
    case "SHORT_I_OR_RACE_PACE":
      return beginner ? { type: "T" } : { type: "RACE_PACE", kind: "I" };
    case "HM_PACE_BLOCKS":
    case "SHORT_HM_PACE":
    case "SHORT_T_OR_RACE_PACE":
      return beginner ? { type: "T" } : { type: "RACE_PACE", kind: "T" };
    default:
      // LR+M ist keine Art eines Q-Slots (der Long Run trägt sie).
      return { type: "T" };
  }
}

/** Art eines Q-Slots. */
export function chooseQuality(ctx: QualityContext): QualityPick {
  const { byDistance, baseQualityFromWeek, beginnerBaseOnly, hmSpecificQ2 } = CONFIG.qualityTypes;
  const { q2AsEInRecoveryWeek, beginnerQ2AsE } = CONFIG.intensity;
  const table = byDistance.value[ctx.distance];

  if (ctx.mode === "race") {
    if (ctx.beginner) return { choice: { type: "STRIDES" }, note: "q-softened-beginner-race-week" };
    return { choice: choiceOf(table.taper[0], false) };
  }
  if (ctx.slot === "Q2" && ctx.isRecoveryWeek && q2AsEInRecoveryWeek.value) {
    return { choice: { type: "STRIDES" }, note: "q-softened-recovery-week" };
  }
  if (ctx.slot === "Q2" && ctx.beginner && beginnerQ2AsE.value) {
    return { choice: { type: "STRIDES" }, note: "q-softened-beginner" };
  }
  if (ctx.mode === "taper") return { choice: choiceOf(table.taper[0], ctx.beginner) };

  if (ctx.mode === "base") {
    if (ctx.beginner) return { choice: choiceOf(beginnerBaseOnly.value[0], true) };
    if (ctx.wn < baseQualityFromWeek.value) return { choice: { type: "STRIDES" } };
    const token = table.base.filter((t) => t !== "STRIDES")[0];
    return { choice: choiceOf(token === undefined ? "STRIDES" : token, false) };
  }

  const tokens = table[specPhaseOf(ctx.phase)].filter((t) => t !== "STRIDES" && t !== "LR+M");
  const notM = tokens.filter((t) => t !== "M")[0];
  const hmSpecific = ctx.distance === "hm" && specPhaseOf(ctx.phase) === "specific";
  let token: QualityToken;
  if (ctx.slot === "Q2") {
    if (hmSpecific) {
      token = hmSpecificQ2.value[ctx.phaseIndex % hmSpecificQ2.value.length];
    } else {
      token = ctx.longRunPlusM ? tokens[0] : tokens[1 % tokens.length];
    }
  } else if (ctx.qSlots >= 2) {
    // HM Spezifisch: Q1 sind die HM-Pace-Blöcke, der Schwellenreiz kommt über Q2 (I / T im Wechsel).
    if (hmSpecific) token = "HM_PACE_BLOCKS";
    else token = ctx.longRunPlusM && notM !== undefined ? notM : tokens[0];
  } else {
    token = tokens[ctx.phaseIndex % tokens.length];
    if (ctx.longRunPlusM && token === "M" && notM !== undefined) token = notM;
  }
  return { choice: choiceOf(token, ctx.beginner) };
}
