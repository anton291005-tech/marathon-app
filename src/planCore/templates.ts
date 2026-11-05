/**
 * Wochenschablonen (docs/plan-spec.md §6): Welche Rollen (Slots) hat eine Woche?
 *
 * Nur Tabellenlogik über `CONFIG.weekTemplates`, keine Tage, keine km. Wo die Rollen auf Wochentage fallen, entscheidet
 * `placement.ts`; welche Art (I/T/M/R …) ein Q-Slot bekommt und wie groß er ist, entscheidet Schritt 6.
 */

import { CONFIG } from "./config";
import type { SpecPhase, WeekSlot } from "./config";
import type { CorePhase, Distance, RunDays } from "./types";

/** Art der Woche: Basis, Aufbau/Spezifisch ("main"), Taper-Woche vor der Rennwoche, Rennwoche. */
export type WeekMode = "base" | "main" | "taper" | "race";

/** Slot eines Tages in der Wochenform. `RACE` und `REST` kommen nur aus der Platzierung. */
export type PlacedSlot = WeekSlot | "RACE" | "REST";

export type LayoutNoteCode =
  /** Q2 (bzw. Q1) ließ sich ohne Verstoß gegen §6 nicht platzieren und wurde zu E. */
  | "q2-dropped"
  | "q1-dropped"
  /** Wie oben, aber wegen des Mindestabstands zum Rennen (§8). */
  | "q-dropped-race-gap"
  /** MLR ließ sich nicht platzieren (Abstand zum Long Run, Sandwich-Regel) und wurde zu E. */
  | "mlr-as-e"
  /** Die Woche hat keinen Long Run: Long-Run-Tag vor dem Planstart oder im Sperrfenster vor dem Rennen (§8). */
  | "no-long-run-in-window";

export type LayoutNote = { code: LayoutNoteCode; slot?: WeekSlot };

const PHASE_ORDER: SpecPhase[] = ["base", "build", "specific", "taper"];

const specPhaseOf = (phase: CorePhase): SpecPhase => (phase === "peak" ? "specific" : phase);

/** Rennwoche schlägt Phase; Taper-Wochen vor der Rennwoche bilden ihre eigene Art. */
export function weekModeOf(phase: CorePhase, isRaceWeek: boolean): WeekMode {
  if (isRaceWeek) return "race";
  if (phase === "taper") return "taper";
  if (phase === "base") return "base";
  return "main";
}

export type SlotsArgs = {
  distance: Distance;
  runDays: RunDays;
  mode: WeekMode;
  phase: CorePhase;
  /** Einsteiger-Modus (`buildPaceProfile(...).mode === "beginner"`). */
  beginner: boolean;
};

/**
 * Slots einer Woche. Basis und Aufbau/Spezifisch stehen in `CONFIG.weekTemplates.slots`, dazu:
 * - Q2 bei 4 Lauftagen nur ab Aufbau und nie im Einsteiger-Modus, sonst E (§6, Fußnote);
 * - MLR nur bei HM/M, sonst E (§6);
 * - Taper-Woche: wie Aufbau, aber Q2 und MLR werden zu E (genau 1 Q, §5.4);
 * - Rennwoche: ohne Long Run; Q1 plus E, so dass mit dem Rennen mindestens `runDays − 1` Lauftage entstehen (§5.4).
 *   Das Rennen selbst gehört nicht zur Liste.
 */
export function slotsFor(args: SlotsArgs): WeekSlot[] {
  const { distance, runDays, mode, phase, beginner } = args;
  const { slots, q2At4DaysFromPhase, mlrDistances } = CONFIG.weekTemplates;

  if (mode === "race") {
    // Läufe außer dem Rennen: (runDays − minRunDaysBelowRunDays) − 1; mindestens das Q1.
    const others = Math.max(1, runDays - CONFIG.taper.minRunDaysBelowRunDays.value - 1);
    const out: WeekSlot[] = ["Q1"];
    for (let index = 1; index < others; index += 1) out.push("E");
    return out;
  }

  const row = slots.value[runDays];
  const template = (mode === "base" ? row.base : row.main).slice();
  return template.map((slot): WeekSlot => {
    if (slot === "Q2") {
      if (mode === "taper") return "E";
      if (runDays === 4) {
        const tooEarly = PHASE_ORDER.indexOf(specPhaseOf(phase)) < PHASE_ORDER.indexOf(q2At4DaysFromPhase.value);
        if (beginner || tooEarly) return "E";
      }
    }
    if (slot === "MLR" && (mode === "taper" || mlrDistances.value.indexOf(distance) < 0)) return "E";
    return slot;
  });
}
