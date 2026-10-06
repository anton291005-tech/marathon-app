import { classifyLoad, hasRacePaceMarker, isLongRunType, resolveLoadClass } from "./loadClass";

describe("classifyLoad", () => {
  test.each([
    ["interval", "high"],
    ["race", "high"],
    ["tempo", "high"],
    ["long", "medium"],
    ["long_run", "medium"],
    ["easy", "low"],
    ["rest", "low"],
    ["strength", "low"],
    ["bike", "low"],
    ["swim", "low"],
    ["", "low"],
    ["unbekannt", "low"],
  ])("Typ %s → %s", (sessionType, expected) => {
    expect(classifyLoad({ sessionType })).toBe(expected);
  });

  test("Typ ist case- und whitespace-tolerant", () => {
    expect(classifyLoad({ sessionType: "  Tempo " })).toBe("high");
    expect(classifyLoad({ sessionType: "LONG" })).toBe("medium");
  });

  test("Ruhetag bleibt low, auch mit hartem Typ-Rest im Sport", () => {
    expect(classifyLoad({ sessionType: "interval", sport: "rest" })).toBe("low");
  });

  test("Long Run mit Renntempo-Anteil → high, ohne → medium", () => {
    expect(classifyLoad({ sessionType: "long", title: "Long Run 28 km mit MP" })).toBe("high");
    expect(classifyLoad({ sessionType: "long", title: "Long Run W12", desc: "Coach-Plan (40 Tage bis Rennen)." })).toBe("medium");
    expect(classifyLoad({ sessionType: "long", title: "Progressiver Long Run" })).toBe("medium");
  });

  test("Marker im Beschreibungstext zählt, nur für Long Runs", () => {
    expect(classifyLoad({ sessionType: "long", title: "Langer Lauf", desc: "20 km locker, letzte 8 km @ Marathon Pace" })).toBe("high");
    expect(classifyLoad({ sessionType: "easy", title: "Easy + 3× MP-Strides" })).toBe("low");
  });
});

describe("hasRacePaceMarker", () => {
  test.each([
    "Long Run 28 km mit MP",
    "Long Run 28 km – großer MP-Block 💥",
    "MP-Long-Run",
    "Marathon-Pace-Long-Run",
    "Marathon Pace Long Run",
    "marathon pace",
    "Marathonpace",
    "Marathontempo",
    "Race Pace Finish",
    "race-pace",
    "RACE PACE",
    "Goal Pace Block",
    "goal pace",
    "Zieltempo-Abschnitt",
    "Letzte 8 km @Zieltempo",
    "Renntempo",
    "Wettkampftempo",
    "(MP)",
    "20 km easy, dann 8 km @ MP.",
  ])("Treffer: %s", (text) => {
    expect(hasRacePaceMarker(text)).toBe(true);
  });

  test.each([
    "Tempodauerlauf",
    "Tempo",
    "Camping",
    "Campingplatz-Lauf",
    "Schwelle",
    "Progressiver Long Run",
    "Langer Grundlagenlauf",
    "Ausdauer-Entwicklungslauf",
    "Impuls",
    "Stampfen",
    "Marathon",
    "Marathonvorbereitung",
    "Pacemaker",
    "Racepacer",
    "Zieltempos",
    "Fahrtspiel",
    "",
  ])("kein Treffer: %s", (text) => {
    expect(hasRacePaceMarker(text)).toBe(false);
  });

  test("null/undefined/leer sind kein Treffer", () => {
    expect(hasRacePaceMarker(null, undefined, "")).toBe(false);
    expect(hasRacePaceMarker()).toBe(false);
  });

  test("Titel und Beschreibung werden gemeinsam geprüft, ohne Wörter über die Grenze zu verkleben", () => {
    expect(hasRacePaceMarker("Long Run", "letzte 8 km MP")).toBe(true);
    expect(hasRacePaceMarker("Te", "mpo")).toBe(false);
  });
});

describe("isLongRunType", () => {
  test("erkennt long und long_run", () => {
    expect(isLongRunType("long")).toBe(true);
    expect(isLongRunType(" Long_Run")).toBe(true);
    expect(isLongRunType("easy")).toBe(false);
    expect(isLongRunType(undefined)).toBe(false);
  });
});

describe("resolveLoadClass", () => {
  test("Lauf-Sessions: gespeicherter Wert wird überschrieben", () => {
    expect(resolveLoadClass({ sport: "run", sessionType: "long", intensity: "low" })).toBe("medium");
    expect(resolveLoadClass({ sport: "run", sessionType: "tempo", intensity: "medium" })).toBe("high");
    expect(resolveLoadClass({ sport: "run", sessionType: "easy", intensity: "high" })).toBe("low");
  });

  test("Rad/Kraft/Schwimmen: gültiger gespeicherter Wert bleibt, sonst abgeleitet", () => {
    expect(resolveLoadClass({ sport: "bike", sessionType: "bike", intensity: "medium" })).toBe("medium");
    expect(resolveLoadClass({ sport: "bike", sessionType: "bike" })).toBe("low");
    expect(resolveLoadClass({ sport: "strength", sessionType: "strength", intensity: "high" })).toBe("high");
  });

  test("ohne Sport (Altdaten) wird aus dem Typ abgeleitet", () => {
    expect(resolveLoadClass({ sessionType: "long", intensity: "low" })).toBe("medium");
    expect(resolveLoadClass({ sessionType: "bike", intensity: "medium" })).toBe("medium");
  });
});
