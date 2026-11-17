import { addDays } from "../../planCore/dates";
import { createRng } from "../../planCore/random";
import { CONFIG } from "../config";
import {
  assessShiftDays,
  indexShiftDays,
  isNightShift,
  resolveShiftTimes,
  type ShiftDayAssessment,
  type ShiftEntry,
  type ShiftKind,
} from "../shiftDays";

const N = (dateYmd: string, start = "22:00", end = "06:00"): ShiftEntry => ({ dateYmd, kind: "night", start, end });
const F = (dateYmd: string, start = "06:00", end = "14:00"): ShiftEntry => ({ dateYmd, kind: "early", start, end });
const S = (dateYmd: string, start = "14:00", end = "22:00"): ShiftEntry => ({ dateYmd, kind: "late", start, end });
const OFF = (dateYmd: string): ShiftEntry => ({ dateYmd, kind: "off", start: null, end: null });
const C = (dateYmd: string, start: string, end: string): ShiftEntry => ({ dateYmd, kind: "custom", start, end });

function run(entries: ShiftEntry[], fromYmd = "2026-11-16", toYmd = "2026-11-29"): Record<string, ShiftDayAssessment> {
  return indexShiftDays(assessShiftDays({ entries, fromYmd, toYmd }));
}

describe("readinessCore/shiftDays – Zeiten", () => {
  it("end <= start endet am Folgetag; frei hat keine Zeiten", () => {
    expect(resolveShiftTimes(N("2026-11-16"))).toEqual({ start: 1320, end: 1800 });
    expect(resolveShiftTimes(S("2026-11-16", "17:00", "00:30"))).toEqual({ start: 1020, end: 1470 });
    expect(resolveShiftTimes(OFF("2026-11-16"))).toBeNull();
  });

  it("fehlende Zeiten bei Früh/Spät/Nacht → Standardzeiten; eigene Zeit ohne Zeiten → ungültig", () => {
    expect(resolveShiftTimes({ dateYmd: "2026-11-16", kind: "early", start: null, end: null })).toEqual({ start: 360, end: 840 });
    expect(resolveShiftTimes({ dateYmd: "2026-11-16", kind: "custom", start: null, end: null })).toBeNull();
  });

  it("Nachtdienst: Art night oder mehr als 2 h im neuen Tag; Spätdienst bis 0:30 ist keiner", () => {
    expect(isNightShift(N("2026-11-16"))).toBe(true);
    expect(isNightShift(C("2026-11-16", "20:00", "04:00"))).toBe(true);
    expect(isNightShift(S("2026-11-16", "17:00", "00:30"))).toBe(false);
    expect(isNightShift(F("2026-11-16"))).toBe(false);
  });
});

describe("readinessCore/shiftDays – Regeln", () => {
  it("Regel 1: Tag nach einer Nacht → hart + Long Run ungeeignet, locker eingeschränkt", () => {
    const d = run([N("2026-11-16")])["2026-11-17"];
    expect(d).toMatchObject({ hard: "unsuitable", long: "unsuitable", easy: "limited", reasonCode: "after_night" });
    expect(d.causeShift?.dateYmd).toBe("2026-11-16");
  });

  it("Regel 2: Tag, an dem der erste Nachtdienst beginnt → hart eingeschränkt, Long Run ungeeignet, locker frei", () => {
    const d = run([N("2026-11-16")])["2026-11-16"];
    expect(d).toMatchObject({ hard: "limited", long: "unsuitable", easy: "free" });
    expect(d.reasons.hard).toBe("before_night");
  });

  it("Regel 3: zwischen zwei Nächten → hart + Long Run ungeeignet (Vorrang vor Regel 1)", () => {
    const days = run([N("2026-11-16"), N("2026-11-17"), N("2026-11-18")]);
    expect(days["2026-11-17"]).toMatchObject({ hard: "unsuitable", long: "unsuitable", reasonCode: "between_nights" });
    expect(days["2026-11-18"]).toMatchObject({ hard: "unsuitable", reasonCode: "between_nights" });
    expect(days["2026-11-19"].reasonCode).toBe("after_night");
    // Der zweite Nachtdienst eines Blocks ist kein „erster“ (Regel 2 nur am Blockbeginn).
    expect(days["2026-11-17"].reasons.long).toBe("between_nights");
  });

  it("Regel 4: erster freier Tag nach dem Block eingeschränkt, zweiter frei", () => {
    const days = run([N("2026-11-16"), N("2026-11-17"), OFF("2026-11-18"), OFF("2026-11-19")]);
    expect(days["2026-11-19"]).toMatchObject({ hard: "limited", long: "unsuitable", easy: "free", reasonCode: "recovery_after_nights" });
    expect(days["2026-11-20"]).toMatchObject({ hard: "free", long: "free", easy: "free", reasonCode: "free_after_nights" });
  });

  it("Regel 4 gilt auch ohne Eintrag „Frei“; ein Dienst am Folgetag ist kein freier Tag", () => {
    expect(run([N("2026-11-16")])["2026-11-18"].reasonCode).toBe("recovery_after_nights");
    const withWork = run([N("2026-11-16"), F("2026-11-18")]);
    expect(withWork["2026-11-18"].reasons.hard).not.toBe("recovery_after_nights");
  });

  it("Regel 5: Spät → Früh (8 h Ruhe) → Frühdienst-Tag hart eingeschränkt", () => {
    const days = run([S("2026-11-17"), F("2026-11-18")]);
    expect(days["2026-11-18"]).toMatchObject({ hard: "limited", reasonCode: "quick_return" });
    expect(days["2026-11-18"].causeShift?.kind).toBe("late");
    // 11 h oder mehr Ruhe: kein Quick Return.
    expect(run([F("2026-11-17"), F("2026-11-18")])["2026-11-18"].reasons.hard).not.toBe("quick_return");
  });

  it("Regel 6: Spätdienst bis 0:30 → Folgetag hart eingeschränkt", () => {
    const days = run([S("2026-11-17", "17:00", "00:30")]);
    expect(days["2026-11-18"]).toMatchObject({ hard: "limited", long: "limited", easy: "free", reasonCode: "late_shift" });
  });

  it("Regel 7: kein ausreichendes Fenster → hart ungeeignet, locker „passt zeitlich nicht“", () => {
    // 07:00–20:15: Lücke 06–07 (60 min) und 20:15–22 (105 min) — reicht nicht für 75 + 45 min, aber für locker 50 + 45.
    const day = run([C("2026-11-17", "07:00", "20:15")])["2026-11-17"];
    expect(day).toMatchObject({ hard: "unsuitable", long: "unsuitable", easy: "free", largestGapMin: 105 });
    const full = run([C("2026-11-17", "06:30", "21:30")])["2026-11-17"];
    expect(full).toMatchObject({ hard: "unsuitable", easy: "no_window", reasonCode: "no_window" });
  });

  it("Regel 7 nutzt eine geplante Dauer, wenn bekannt", () => {
    const entries = [C("2026-11-17", "07:00", "20:30")];
    const short = indexShiftDays(assessShiftDays({ entries, fromYmd: "2026-11-17", toYmd: "2026-11-17", plannedMinByDay: { "2026-11-17": 40 } }));
    expect(short["2026-11-17"].reasons.hard).not.toBe("no_window");
    expect(short["2026-11-17"]).toMatchObject({ hard: "limited", reasonCode: "long_shift" });
  });

  it("Regel 7 zählt den Morgen-Teil eines Dienstes über Mitternacht mit", () => {
    // Nacht 23:00–09:00 → am Folgetag belegt bis 9 Uhr; dazu Spätdienst 14–22 → Lücke 9–14 (300 min) reicht.
    const days = run([C("2026-11-16", "23:00", "09:00"), S("2026-11-17")]);
    expect(days["2026-11-17"].largestGapMin).toBe(300);
  });

  it("Regel 8: Dienst > 8 h → hart eingeschränkt; nicht, wenn das Fenster davor liegt", () => {
    expect(run([C("2026-11-17", "07:30", "17:30")])["2026-11-17"]).toMatchObject({ hard: "limited", reasonCode: "long_shift" });
    expect(run([C("2026-11-17", "12:00", "21:30")])["2026-11-17"].hard).toBe("free");
    // Frühdienst 6–14 (genau 8 h) ist nicht lang.
    expect(run([F("2026-11-17")])["2026-11-17"]).toMatchObject({ hard: "free", reasonCode: "shift_fits" });
  });

  it("Regel 9: strengste Eignung gewinnt, mit deren Grund", () => {
    // Nach der Nacht und kurzer Ruhe vor dem Spätdienst: ungeeignet (Nacht) schlägt eingeschränkt (Quick Return).
    const days = run([N("2026-11-16"), S("2026-11-17")]);
    expect(days["2026-11-17"]).toMatchObject({ hard: "unsuitable", reasonCode: "after_night" });
  });

  it("Tage ohne Bezug haben keinen Eintrag; frei-Einträge sind „frei“ mit Grund", () => {
    const days = run([OFF("2026-11-20"), F("2026-11-24")]);
    expect(days["2026-11-20"]).toMatchObject({ hard: "free", long: "free", easy: "free", reasonCode: "day_off" });
    expect(days["2026-11-21"]).toBeUndefined();
    expect(days["2026-11-23"]).toBeUndefined();
  });

  it("Ausgabe nur im Bereich, Einträge davor wirken hinein", () => {
    const list = assessShiftDays({ entries: [N("2026-11-15")], fromYmd: "2026-11-16", toYmd: "2026-11-17" });
    expect(list.map((d) => d.dateYmd)).toEqual(["2026-11-16", "2026-11-17"]);
    expect(list[0].reasonCode).toBe("after_night");
  });

  it("ungültige Eingaben → leeres Ergebnis statt Absturz", () => {
    expect(assessShiftDays({ entries: [], fromYmd: "x", toYmd: "2026-11-17" })).toEqual([]);
    expect(assessShiftDays({ entries: [{ dateYmd: "nope", kind: "night", start: null, end: null }], fromYmd: "2026-11-16", toYmd: "2026-11-17" })).toEqual([]);
  });
});

describe("readinessCore/shiftDays – Szenarien", () => {
  it("S1 Pflege N-N-frei-frei: Tag nach der 2. Nacht und 1. freier Tag sind für Intervall bzw. Long Run ungeeignet", () => {
    const days = run([N("2026-11-16"), N("2026-11-17"), OFF("2026-11-18"), OFF("2026-11-19")]);
    expect(days["2026-11-18"].hard).toBe("unsuitable");
    expect(days["2026-11-19"].long).toBe("unsuitable");
    expect(days["2026-11-20"].hard).toBe("free");
  });

  it("S2 Spät → Früh mit Tempo am Frühdienst-Tag → eingeschränkt", () => {
    expect(run([S("2026-11-17"), F("2026-11-18")])["2026-11-18"].hard).toBe("limited");
  });

  it("S3 Gastro 17:00–00:30 vor dem Intervalltag → eingeschränkt", () => {
    expect(run([S("2026-11-17", "17:00", "00:30")])["2026-11-18"].hard).toBe("limited");
  });

  it("S4 nur Frühdienste mit Nachmittagsfenster → überall frei", () => {
    const days = assessShiftDays({ entries: ["2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20"].map((d) => F(d)), fromYmd: "2026-11-16", toYmd: "2026-11-22" });
    expect(days.every((d) => d.hard === "free" && d.long === "free" && d.easy === "free")).toBe(true);
  });
});

describe("readinessCore/shiftDays – Regression", () => {
  it("eine Nacht 22–6 macht den Folgetag nie „frei“ (über viele zufällige Dienstpläne)", () => {
    const rng = createRng(20261117);
    const kinds: ShiftKind[] = ["early", "late", "night", "off", "custom"];
    for (let round = 0; round < 300; round += 1) {
      const start = addDays("2026-10-01", rng.int(0, 200));
      const entries: ShiftEntry[] = [];
      for (let i = 0; i < 14; i += 1) {
        if (rng.chance(0.3)) continue;
        const kind = rng.pick(kinds);
        const dateYmd = addDays(start, i);
        if (kind === "off") entries.push(OFF(dateYmd));
        else if (kind === "custom") entries.push(C(dateYmd, `${String(rng.int(5, 20)).padStart(2, "0")}:00`, `${String(rng.int(0, 23)).padStart(2, "0")}:30`));
        else entries.push({ dateYmd, kind, start: null, end: null });
      }
      const days = indexShiftDays(assessShiftDays({ entries, fromYmd: start, toYmd: addDays(start, 15) }));
      entries
        .filter((e) => e.kind === "night")
        .forEach((e) => {
          const next = days[addDays(e.dateYmd, 1)];
          expect(next).toBeDefined();
          expect(next.hard).not.toBe("free");
          expect(next.long).not.toBe("free");
        });
    }
  });
});

describe("readinessCore/shiftDays – Zeitzonen und Sommerzeit", () => {
  const original = process.env.TZ;
  afterAll(() => {
    process.env.TZ = original;
  });

  const entriesAround = (sunday: string): ShiftEntry[] => [
    N(addDays(sunday, -2)),
    N(addDays(sunday, -1)),
    OFF(sunday),
    S(addDays(sunday, 1), "17:00", "00:30"),
    F(addDays(sunday, 2)),
  ];

  it.each(["2026-10-25", "2027-03-28"])("Umstellung %s: gleiches Ergebnis in Berlin, UTC und Los Angeles", (sunday) => {
    const results = ["Europe/Berlin", "UTC", "America/Los_Angeles"].map((tz) => {
      process.env.TZ = tz;
      return assessShiftDays({ entries: entriesAround(sunday), fromYmd: addDays(sunday, -3), toYmd: addDays(sunday, 4) });
    });
    expect(results[1]).toEqual(results[0]);
    expect(results[2]).toEqual(results[0]);
    const days = indexShiftDays(results[0]);
    // Die Nacht der Zeitumstellung zählt als normaler Nachtdienst; der Sonntag danach ist „zwischen“ bzw. „danach“.
    expect(days[sunday].reasonCode).toBe("after_night");
    // Spätdienst bis 0:30 und Frühdienst um 6: gleiche Strenge, der Grund der zuerst geprüften Regel (Ruhezeit) gilt.
    expect(days[addDays(sunday, 2)]).toMatchObject({ hard: "limited", reasonCode: "quick_return" });
  });
});

describe("readinessCore/shiftDays – Konfiguration", () => {
  it("Fit-Werte: ungeeignet unter der Konfliktschwelle 0,35, eingeschränkt darüber", () => {
    const fit = CONFIG.shift.fit.value;
    expect(fit.unsuitable).toBeLessThan(0.35);
    expect(fit.no_window).toBeLessThan(0.35);
    expect(fit.limited).toBeGreaterThanOrEqual(0.35);
    expect(fit.free).toBe(1);
  });
});
