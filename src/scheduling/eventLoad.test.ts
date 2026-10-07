import { classifyEventCategory } from "../calendar/eventClassifier";
import {
  classifyEventLoad,
  isPhysicalLoadTitle,
  NON_PHYSICAL_CONTEST_MARKERS,
  PHYSICAL_LOAD_TITLE_KEYWORDS,
} from "./eventLoad";

/** Kategorie so, wie der Import sie setzt — die Belastung muss mit dem echten Classifier-Ergebnis stimmen. */
function loadOf(title: string, calendarName = ""): string {
  return classifyEventLoad({ title, category: classifyEventCategory(title, calendarName) });
}

describe("classifyEventLoad", () => {
  test.each([
    "Sprint-Prüfung", // Kategorie study, Belastung physical
    "Sprintprüfung",
    "Sprinttraining",
    "100m Sprint",
    "Sportpraxis",
    "Sportpraxis Leichtathletik",
    "Sport-Praxis", // getrennt geschrieben
    "Sportprüfung",
    "Sport-Prüfung",
    "Sporttest",
    "Leichtathletik",
    "Turnier",
    "Fußballturnier",
    "Hallenturnier",
    "Wettkampf",
    "Hallenfußball",
    "Tennis",
  ])("%s → physical", (title) => {
    expect(loadOf(title)).toBe("physical");
  });

  test.each([
    "Klausur BWL",
    "Abgabe Hausarbeit",
    "Prüfung Statistik",
    "Vorlesung",
    "Schicht",
    "Arbeit",
    "Training", // zu generisch
    "Spieleabend",
    "Yoga Flow", // Kategorie sport allein löst nichts aus
    "Matcha Latte",
    "Zahnarzt",
    "",
  ])("%s → time", (title) => {
    expect(loadOf(title)).toBe("time");
  });

  test.each(["Schachturnier", "Skatturnier", "Pokerturnier", "Poker-Turnier", "Quiz Turnier", "E-Sport-Turnier", "eSport Turnier", "Schach-Wettkampf"])(
    "%s → time (Ausschlussliste für Wettbewerbe ohne körperliche Belastung)",
    (title) => {
      expect(loadOf(title)).toBe("time");
    },
  );

  test("Ausschlussliste bremst nur Wettbewerbs-Stichwörter, keine Sportart", () => {
    expect(loadOf("Fußball statt Schach")).toBe("physical");
  });

  test("Sprint mit Job-Bremse: Kategorie job oder agiles Begleitwort → time", () => {
    expect(classifyEventLoad({ title: "Sprint", category: "job" })).toBe("time");
    expect(loadOf("Sprint 14", "Arbeit")).toBe("time"); // Kalendername setzt die Kategorie job
    for (const title of ["Sprint Planning", "Sprint-Review", "Sprint Retro", "Sprintplanung Meeting", "Sprint Demo"]) {
      expect(loadOf(title)).toBe("time");
    }
  });

  test("Job-Bremse gilt nur für Sprint, nicht für Sportarten", () => {
    expect(classifyEventLoad({ title: "Fußballturnier Firmenfeier", category: "job" })).toBe("physical");
  });

  test("Kategorie study blockiert nie allein und bremst Sprint nicht", () => {
    expect(classifyEventLoad({ title: "Klausur", category: "study" })).toBe("time");
    expect(classifyEventLoad({ title: "Sprint-Prüfung", category: "study" })).toBe("physical");
  });

  test("Kategorie sport allein macht keinen Termin körperlich", () => {
    expect(classifyEventLoad({ title: "Vereinsabend", category: "sport" })).toBe("time");
  });

  test("isPhysicalLoadTitle ist die Nur-Titel-Sicht", () => {
    expect(isPhysicalLoadTitle("Sprint-Prüfung")).toBe(true);
    expect(isPhysicalLoadTitle("Klausur")).toBe(false);
  });

  test("Listen sind klein geschrieben und enthalten keine zu generischen Wörter", () => {
    for (const keyword of [...PHYSICAL_LOAD_TITLE_KEYWORDS, ...NON_PHYSICAL_CONTEST_MARKERS]) {
      expect(keyword).toBe(keyword.toLowerCase());
    }
    expect(PHYSICAL_LOAD_TITLE_KEYWORDS).not.toContain("spiel");
    expect(PHYSICAL_LOAD_TITLE_KEYWORDS).not.toContain("training");
    expect(PHYSICAL_LOAD_TITLE_KEYWORDS).not.toContain("sport");
  });
});
