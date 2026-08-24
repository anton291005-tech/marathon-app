import { classifyEventCategory } from "./eventClassifier";

describe("classifyEventCategory", () => {
  it("erkennt Studium aus dem Titel (DE + EN)", () => {
    expect(classifyEventCategory("Vorlesung Statistik II", "Privat")).toBe("study");
    expect(classifyEventCategory("Lecture: Databases", "Personal")).toBe("study");
    expect(classifyEventCategory("Klausur BWL", "")).toBe("study");
  });

  it("erkennt Job aus dem Titel", () => {
    expect(classifyEventCategory("Spätschicht Restaurant", "Privat")).toBe("job");
    expect(classifyEventCategory("Weekly Standup", "Privat")).toBe("job");
    expect(classifyEventCategory("Bürotag", "Privat")).toBe("job");
  });

  it("erkennt Ehrenamt und Sport", () => {
    expect(classifyEventCategory("Feuerwehr Übungsabend", "Privat")).toBe("volunteer");
    expect(classifyEventCategory("Yoga Flow", "Privat")).toBe("sport");
  });

  it("prüft den Titel vor dem Kalendernamen", () => {
    expect(classifyEventCategory("Vorlesung Anatomie", "Arbeit")).toBe("study");
  });

  it("fällt auf den Kalendernamen zurück, wenn der Titel nichts hergibt", () => {
    expect(classifyEventCategory("Termin 14 Uhr", "Uni-Kalender")).toBe("study");
    expect(classifyEventCategory("Blockiert", "Arbeit")).toBe("job");
  });

  it("ist case-insensitiv", () => {
    expect(classifyEventCategory("VORLESUNG", "")).toBe("study");
  });

  it("fällt ohne Treffer auf 'other' zurück", () => {
    expect(classifyEventCategory("Zahnarzt", "Privat")).toBe("other");
    expect(classifyEventCategory("", "")).toBe("other");
  });
});
