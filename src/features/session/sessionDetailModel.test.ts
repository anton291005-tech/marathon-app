import {
  buildHealthRunSuggestion,
  buildSessionFlow,
  estimateDurationMin,
  feelingLabel,
  formatClock,
  kmInputToLogValue,
  normalizeFeeling,
  parseKmInput,
  stepKmInput,
} from "./sessionDetailModel";

describe("buildSessionFlow", () => {
  test("Rezept mit WU/CD: drei Abschnitte mit km, Wiederholungen als Unterzeile", () => {
    const flow = buildSessionFlow({ type: "interval", km: 10, desc: "2 km WU · 6×1000m · 2 km CD" });
    expect(flow?.rows.map((row) => [row.key, row.km, row.sub])).toEqual([
      ["warmup", 2, null],
      ["main", 6, "6 × 1 km"],
      ["cooldown", 2, null],
    ]);
    expect(flow?.summary).toBe("2 + 6 + 2 km");
  });

  test("Freitext ohne Aufteilung: kein Ablauf (nichts erfinden)", () => {
    expect(buildSessionFlow({ type: "easy", km: 10, desc: "GA1-Bereich, Herzfrequenz niedrig halten." })).toBeNull();
    expect(buildSessionFlow({ type: "long", km: 24, desc: null })).toBeNull();
    expect(buildSessionFlow({ type: "tempo", km: 12, desc: "Zügiger Dauerlauf im Schwellenbereich." })).toBeNull();
  });

  test("Nur ein belegter Abschnitt reicht nicht für einen Ablauf", () => {
    expect(buildSessionFlow({ type: "interval", km: 6, desc: "6×1000m" })).toBeNull();
  });
});

describe("Gefühl 1–5", () => {
  test("Zahlenwerte der früheren Sterne bleiben 1:1 erhalten", () => {
    expect([1, 2, 3, 4, 5].map(normalizeFeeling)).toEqual([1, 2, 3, 4, 5]);
    expect(feelingLabel(1)).toBe("sehr schwer");
    expect(feelingLabel(4)).toBe("leicht");
    expect(feelingLabel(5)).toBe("sehr leicht");
  });

  test("0 / leer / außerhalb der Skala = nicht angegeben", () => {
    expect(normalizeFeeling(0)).toBeNull();
    expect(normalizeFeeling(undefined)).toBeNull();
    expect(normalizeFeeling(6)).toBeNull();
    expect(feelingLabel(0)).toBeNull();
  });
});

describe("Distanzfeld", () => {
  test("Komma und Punkt werden gelesen, das Log bekommt den Punkt", () => {
    expect(parseKmInput("10,4")).toBe(10.4);
    expect(parseKmInput("10.4")).toBe(10.4);
    expect(parseKmInput("")).toBeNull();
    expect(kmInputToLogValue("10,4")).toBe("10.4");
    expect(kmInputToLogValue("")).toBe("");
  });

  test("−/+ in halben Kilometern, nie unter 0", () => {
    expect(stepKmInput("10,0", 1)).toBe("10,5");
    expect(stepKmInput("10,0", -1)).toBe("9,5");
    expect(stepKmInput("0,2", -1)).toBe("0,0");
    expect(stepKmInput("", 1)).toBe("0,5");
  });
});

describe("estimateDurationMin", () => {
  test("gleichmäßiger Lauf: Distanz × mittleres Plan-Tempo", () => {
    expect(estimateDurationMin("easy", 10, { min: 5.25, max: 5.75 })).toBe(55);
  });

  test("ohne Tempo, ohne Distanz oder bei Intervall/Tempo keine Schätzung", () => {
    expect(estimateDurationMin("easy", 10, null)).toBeNull();
    expect(estimateDurationMin("easy", null, { min: 5, max: 5 })).toBeNull();
    expect(estimateDurationMin("interval", 10, { min: 4, max: 4 })).toBeNull();
  });
});

describe("Health-Lauf", () => {
  test("formatClock", () => {
    expect(formatClock(3130)).toBe("52:10");
    expect(formatClock(4500)).toBe("1:15:00");
  });

  test("Vorschlagszeile: Heute + Uhrzeit, Distanz, Dauer", () => {
    const today = new Date(2026, 9, 14, 12, 0, 0);
    const start = new Date(2026, 9, 14, 7, 12, 0).toISOString();
    expect(buildHealthRunSuggestion({ startDate: start, duration: 3130, distanceMeters: 10400 }, today)).toEqual({
      line: "Heute 07:12 · 10,4 km · 52:10",
      km: 10.4,
    });
  });

  test("anderer Tag und fehlende Distanz: Datum statt Heute, keine erfundenen km", () => {
    const today = new Date(2026, 9, 15, 12, 0, 0);
    const start = new Date(2026, 9, 14, 7, 12, 0).toISOString();
    expect(buildHealthRunSuggestion({ startDate: start, duration: 3130, distanceMeters: null }, today)).toEqual({
      line: "Mi, 14. Okt 07:12 · 52:10",
      km: null,
    });
  });
});
