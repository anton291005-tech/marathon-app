import { clampScore100, formatDateRangeDe, formatDayDateDe, formatHrFactDe, formatKmDe } from "./formatDe";

describe("formatDe", () => {
  test("Kilometer mit Dezimalkomma, Sollwert ohne ,0", () => {
    expect(formatKmDe(15.94)).toBe("15,9");
    expect(formatKmDe(55)).toBe("55,0");
    expect(formatKmDe(55, { trimZero: true })).toBe("55");
    expect(formatKmDe(11.6, { trimZero: true })).toBe("11,6");
    expect(formatKmDe(Number.NaN)).toBe("—");
  });

  test("Datum als Wochentag, Tag und Monat", () => {
    expect(formatDayDateDe(new Date(2026, 9, 15))).toBe("Do, 15. Okt");
    expect(formatDayDateDe(new Date(2027, 2, 1))).toBe("Mo, 1. Mär");
  });

  test("Datumsbereich einer Woche, auch über die Monatsgrenze", () => {
    expect(formatDateRangeDe(new Date(2026, 9, 12), new Date(2026, 9, 18, 23, 59))).toBe("12.–18. Okt");
    expect(formatDateRangeDe(new Date(2026, 8, 28), new Date(2026, 9, 4))).toBe("28. Sep – 4. Okt");
    expect(formatDateRangeDe(new Date(2026, 9, 18), new Date(2026, 9, 18))).toBe("18. Okt");
  });

  test("Score wird gerundet und begrenzt, ohne Wert null", () => {
    expect(clampScore100(57.6)).toBe(58);
    expect(clampScore100(140)).toBe(100);
    expect(clampScore100(null)).toBeNull();
    expect(clampScore100(Number.NaN)).toBeNull();
  });

  test("Herzfrequenz-Zielzeile wird zur Fakten-Zeile", () => {
    expect(formatHrFactDe("Herzfrequenzbereich: Zone 2 (120–150 bpm, 60–75% HFmax)")).toBe("Zone 2 · 120–150 bpm");
    expect(formatHrFactDe("Herzfrequenzbereich: Zone 2 (60–75% HFmax)")).toBe("Zone 2 · 60–75% HFmax");
    expect(formatHrFactDe("Herzfrequenzbereich: leicht–moderat (104–137 bpm, 55–72% HFmax)")).toBe("leicht–moderat · 104–137 bpm");
    expect(formatHrFactDe("Herzfrequenzbereich: Zone 1 · sehr niedrige Intensität")).toBe("Zone 1 · sehr niedrige Intensität");
    expect(formatHrFactDe("")).toBe("");
  });
});
