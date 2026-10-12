import { pluralDe } from "./pluralDe";

describe("pluralDe", () => {
  test("genau 1 nimmt die Einzahl", () => {
    expect(pluralDe(1, "Woche", "Wochen")).toBe("1 Woche");
    expect(pluralDe(1, "Tag", "Tage")).toBe("1 Tag");
    expect(pluralDe(1, "Minute", "Minuten")).toBe("1 Minute");
  });

  test("0, mehrere und Kommazahlen nehmen die Mehrzahl", () => {
    expect(pluralDe(0, "Tag", "Tage")).toBe("0 Tage");
    expect(pluralDe(2, "Woche", "Wochen")).toBe("2 Wochen");
    expect(pluralDe(12, "Minute", "Minuten")).toBe("12 Minuten");
    expect(pluralDe(1.5, "Tag", "Tage")).toBe("1.5 Tage");
  });
});
