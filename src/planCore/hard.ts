/**
 * Harte Einheiten (docs/plan-spec.md §1). Eine gemeinsame Definition für den Kern, `validateMicroStructure` und
 * `validateSwap` (die beiden letzten ziehen mit Schritt 14 nach).
 */

import { CONFIG } from "./config";
import { diffDays } from "./dates";
import type { PlacedSlot } from "./templates";
import type { CoreKind, Ymd } from "./types";

export type HardSessionInput = {
  kind: CoreKind;
  /** Dauer der ganzen Einheit in Minuten; nur für den Long Run nötig. */
  durationMinutes?: number;
  /** km bei M-Pace oder schneller (bei `M` der Dauerlauf-Block, bei `LR+M` der M-Block, ohne Ein-/Auslaufen). */
  kmAtMPaceOrFaster?: number;
};

/**
 * Hart sind I, T, R und das Rennen immer, ein Long Run ab `hardSession.longRunMinutes`, M (und der M-Block eines LR+M)
 * ab `hardSession.kmAtMPaceOrFaster`. E, REC, MLR und Ruhetage nie. Fehlt die nötige Angabe (Dauer, km), gilt die
 * Einheit als nicht hart: ohne Zahl lässt sich die Schwelle nicht belegen.
 */
export function isHardSession(session: HardSessionInput): boolean {
  const { longRunMinutes, kmAtMPaceOrFaster } = CONFIG.hardSession;
  const longEnough = (session.durationMinutes ?? 0) >= longRunMinutes.value;
  const mBlockEnough = (session.kmAtMPaceOrFaster ?? 0) >= kmAtMPaceOrFaster.value;
  switch (session.kind) {
    case "I":
    case "T":
    case "R":
    case "RACE":
      return true;
    case "M":
      return mBlockEnough;
    case "LR":
      return longEnough;
    case "LR+M":
      return longEnough || mBlockEnough;
    default:
      return false;
  }
}

/**
 * Hart-Annahme der Platzierung (Schritt 5), bevor Dauer und km bekannt sind: Long Run, jedes Q und das Rennen gelten
 * als hart. Schritt 6 kann eine Einheit nur weicher machen (Strides statt Q, kurzer Long Run), nie härter; deshalb
 * bleibt I6 für die fertigen Einheiten erhalten. `hard.test.ts` prüft: `isHardSession` ⊆ Annahme.
 */
export function isHardSlot(slot: PlacedSlot): boolean {
  return slot === "LR" || slot === "Q1" || slot === "Q1L" || slot === "Q2" || slot === "RACE";
}

export type DayHardness = { ymd: Ymd; hard: boolean };

/**
 * I6 über beliebig viele Tage, auch über Wochengrenzen: zwischen zwei harten Tagen liegt mindestens
 * `placement.minEasyDaysBetweenHard` Tag ohne harte Einheit. Die Eingabe muss nicht sortiert sein; fehlende Tage
 * (Lücken) zählen als locker. Ergebnis: ein Code je Verstoß, leer = in Ordnung.
 */
export function findHardSpacingViolations(days: DayHardness[]): string[] {
  const minGap = CONFIG.placement.minEasyDaysBetweenHard.value + 1;
  const hardDays = days
    .filter((day) => day.hard)
    .map((day) => day.ymd)
    .sort();
  const out: string[] = [];
  for (let index = 1; index < hardDays.length; index += 1) {
    if (diffDays(hardDays[index], hardDays[index - 1]) < minGap) {
      out.push(`hard-too-close:${hardDays[index - 1]}>${hardDays[index]}`);
    }
  }
  return out;
}
