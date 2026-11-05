import { chooseQuality, isLongRunPlusMWeek } from "../qTypes";
import type { QualityContext } from "../qTypes";
import type { WeekMode } from "../templates";
import type { CorePhase, Distance, RunDays } from "../types";

const ctx = (over: Partial<QualityContext>): QualityContext => ({
  distance: "hm",
  mode: "main",
  phase: "build",
  wn: 5,
  slot: "Q1",
  phaseIndex: 0,
  isRecoveryWeek: false,
  beginner: false,
  runDays: 5,
  qSlots: 2,
  longRunPlusM: false,
  ...over,
});

const typeOf = (over: Partial<QualityContext>): string => {
  const { choice } = chooseQuality(ctx(over));
  return choice.type === "RACE_PACE" ? `RACE_PACE:${choice.kind}` : choice.type;
};

describe("planCore qTypes (§7.2)", () => {
  it("Basis: Woche 1–2 Strides, ab Woche 3 T bzw. R (5k); Einsteiger nur Strides", () => {
    expect(typeOf({ mode: "base", phase: "base", wn: 1 })).toBe("STRIDES");
    expect(typeOf({ mode: "base", phase: "base", wn: 2 })).toBe("STRIDES");
    expect(typeOf({ mode: "base", phase: "base", wn: 3 })).toBe("T");
    expect(typeOf({ mode: "base", phase: "base", wn: 3, distance: "5k" })).toBe("R");
    expect(typeOf({ mode: "base", phase: "base", wn: 6, beginner: true })).toBe("STRIDES");
    expect(typeOf({ mode: "base", phase: "base", wn: 6, slot: "Q1L", runDays: 4 })).toBe("T");
  });

  it("Aufbau: Q1 erste, Q2 zweite Art der Tabelle", () => {
    expect([typeOf({}), typeOf({ slot: "Q2" })]).toEqual(["T", "I"]);
    expect([typeOf({ distance: "10k" }), typeOf({ distance: "10k", slot: "Q2" })]).toEqual(["I", "T"]);
    expect([typeOf({ distance: "5k" }), typeOf({ distance: "5k", slot: "Q2" })]).toEqual(["I", "T"]);
    expect([typeOf({ distance: "m" }), typeOf({ distance: "m", slot: "Q2" })]).toEqual(["T", "M"]);
  });

  it("HM Spezifisch: Q1 HM-Pace-Blöcke (T), Q2 wechselt wochenweise I / T", () => {
    const peak = { phase: "peak" as CorePhase };
    expect(typeOf({ ...peak })).toBe("RACE_PACE:T");
    expect([0, 1, 2, 3].map((phaseIndex) => typeOf({ ...peak, slot: "Q2", phaseIndex }))).toEqual(["I", "T", "I", "T"]);
  });

  it("Marathon Spezifisch: Q1 M-Lauf, Q2 T; in LR+M-Wochen tauschen sie (Q1 = T)", () => {
    const m = { distance: "m" as Distance, phase: "peak" as CorePhase };
    expect([typeOf(m), typeOf({ ...m, slot: "Q2" })]).toEqual(["M", "T"]);
    expect([typeOf({ ...m, longRunPlusM: true }), typeOf({ ...m, slot: "Q2", longRunPlusM: true })]).toEqual(["T", "M"]);
    // Nur ein Q (3 Tage): M und T wechseln, in LR+M-Wochen nie M.
    expect([0, 1, 2].map((phaseIndex) => typeOf({ ...m, qSlots: 1, runDays: 3, phaseIndex }))).toEqual(["M", "T", "M"]);
    expect(typeOf({ ...m, qSlots: 1, runDays: 3, phaseIndex: 0, longRunPlusM: true })).toBe("T");
  });

  it("LR+M nur Marathon, Spezifisch, mit Long Run, ohne Entlastung, in jeder 2. Nicht-Entlastungswoche", () => {
    const base = { distance: "m" as Distance, mode: "main" as WeekMode, phase: "peak" as CorePhase, isRecoveryWeek: false, hasLongRun: true };
    expect([0, 1, 2, 3].map((phaseIndex) => isLongRunPlusMWeek({ ...base, phaseIndex }))).toEqual([false, true, false, true]);
    expect(isLongRunPlusMWeek({ ...base, phaseIndex: 1, distance: "hm" })).toBe(false);
    expect(isLongRunPlusMWeek({ ...base, phaseIndex: 1, phase: "build" })).toBe(false);
    expect(isLongRunPlusMWeek({ ...base, phaseIndex: 1, isRecoveryWeek: true })).toBe(false);
    expect(isLongRunPlusMWeek({ ...base, phaseIndex: 1, hasLongRun: false })).toBe(false);
  });

  it("Taper und Rennwoche: kurzes Renntempo bzw. M-Pace; Einsteiger-Rennwoche E + Strides (Folgepunkt a)", () => {
    const taper = { mode: "taper" as WeekMode, phase: "taper" as CorePhase };
    expect(typeOf({ ...taper, distance: "m" })).toBe("M");
    expect(typeOf({ ...taper, distance: "hm" })).toBe("RACE_PACE:T");
    const race = { mode: "race" as WeekMode, phase: "taper" as CorePhase };
    expect(typeOf({ ...race, distance: "5k" })).toBe("RACE_PACE:I");
    expect(typeOf({ ...race, distance: "10k" })).toBe("RACE_PACE:T");
    expect(chooseQuality(ctx({ ...race, beginner: true }))).toEqual({
      choice: { type: "STRIDES" },
      note: "q-softened-beginner-race-week",
    });
  });

  it("Q2 wird weicher: Entlastungswoche und Einsteiger mit 5–6 Tagen", () => {
    expect(chooseQuality(ctx({ slot: "Q2", isRecoveryWeek: true }))).toEqual({
      choice: { type: "STRIDES" },
      note: "q-softened-recovery-week",
    });
    expect(chooseQuality(ctx({ slot: "Q2", beginner: true }))).toEqual({ choice: { type: "STRIDES" }, note: "q-softened-beginner" });
    // Q1 der Entlastungswoche bleibt.
    expect(typeOf({ isRecoveryWeek: true })).toBe("T");
  });

  it("Einsteiger bekommen nie I, R oder Renntempo (alle Kombinationen)", () => {
    const seen: string[] = [];
    (["5k", "10k", "hm", "m"] as Distance[]).forEach((distance) =>
      (["base", "main", "taper", "race"] as WeekMode[]).forEach((mode) =>
        (["base", "build", "peak", "taper"] as CorePhase[]).forEach((phase) =>
          (["Q1", "Q1L", "Q2"] as const).forEach((slot) =>
            [0, 1, 2, 3].forEach((phaseIndex) =>
              ([3, 4, 5, 6] as RunDays[]).forEach((runDays) =>
                [false, true].forEach((longRunPlusM) => {
                  const type = typeOf({ distance, mode, phase, slot, phaseIndex, runDays, longRunPlusM, beginner: true, wn: 1 + phaseIndex * 3 });
                  if (seen.indexOf(type) < 0) seen.push(type);
                }),
              ),
            ),
          ),
        ),
      ),
    );
    expect(seen.sort()).toEqual(["M", "STRIDES", "T"]);
  });
});
