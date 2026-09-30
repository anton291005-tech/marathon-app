import { buildRecapSlides, formatRecapHero, type RecapSlide } from "./buildRecapSlides";
import { emptyRecapStats, fullRecapStats } from "./recapTestFixtures";

function slideTexts(slides: RecapSlide[]): string {
  return slides
    .map((s) =>
      [
        s.eyebrow,
        s.hero ? formatRecapHero(s.hero) : "",
        s.headline,
        s.subline ?? "",
        s.detail ?? "",
        ...(s.summary ?? []),
        ...(s.body ?? []).flatMap((r) => [r.first, r.last]),
      ].join(" | "),
    )
    .join("\n");
}

const byId = (slides: RecapSlide[], id: RecapSlide["id"]) => slides.find((s) => s.id === id);

describe("buildRecapSlides", () => {
  it("baut aus einem vollen Snapshot alle Slides in fester Reihenfolge", () => {
    const slides = buildRecapSlides({
      stats: fullRecapStats(),
      raceName: "Warschau Marathon",
      finishSeconds: 11637,
      finishConfirmed: true,
    });
    expect(slides.map((s) => s.id)).toEqual([
      "intro",
      "volume",
      "sessions",
      "streak",
      "longRuns",
      "quality",
      "strongestWeek",
      "phases",
      "body",
      "race",
      "outro",
    ]);
    expect(formatRecapHero(byId(slides, "intro")!.hero!)).toBe("18");
    expect(byId(slides, "intro")!.subline).toBe("25. Mai bis 27. September 2026.");
    expect(formatRecapHero(byId(slides, "volume")!.hero!)).toBe("1.284");
    expect(byId(slides, "volume")!.subline).toBe("So weit wie 30,4 Marathons.");
    expect(byId(slides, "sessions")!.subline).toBe("91 % deines Plans umgesetzt.");
    expect(byId(slides, "longRuns")!.subline).toBe("Dein längster Trainingslauf: 32,4 km.");
    expect(byId(slides, "strongestWeek")!.headline).toBe("Kilometer in Woche 13");
    expect(byId(slides, "phases")!.phases!.map((p) => p.label)).toEqual(["Base", "Build", "Peak", "Taper"]);
    expect(byId(slides, "body")!.body).toEqual([
      { label: "Schlaf", first: "7,1 h", last: "7,4 h" },
      { label: "HRV", first: "52 ms", last: "58 ms" },
    ]);
    expect(byId(slides, "outro")!.summary).toEqual(["18 Wochen", "1.284 km", "3:13:57"]);
  });

  it("lässt Slides ohne Daten weg und zeigt nie 0", () => {
    const slides = buildRecapSlides({
      stats: emptyRecapStats(),
      raceName: "Warschau Marathon",
      finishSeconds: null,
      finishConfirmed: false,
    });
    expect(slides.map((s) => s.id)).toEqual(["intro", "race", "outro"]);
    expect(byId(slides, "intro")!.hero).toBeNull();
    const text = slideTexts(slides);
    expect(text).not.toMatch(/(^|[\s|])0([\s|,.]|$)|N\/A|0 von/);
  });

  it("zeigt eine kurze Serie nicht als eigene Slide", () => {
    const slides = buildRecapSlides({
      stats: fullRecapStats({ streak: { longestDays: 2 } }),
      raceName: null,
      finishSeconds: null,
      finishConfirmed: false,
    });
    expect(byId(slides, "streak")).toBeUndefined();
  });

  it("nennt ohne Marathon-Äquivalent und bei niedriger Quote keine Prozentzahl", () => {
    const slides = buildRecapSlides({
      stats: fullRecapStats({
        volume: { actualKm: 30, plannedKm: 400, ratio: 0.075, marathonEquivalents: null },
        sessions: { done: 10, planned: 40, skipped: 30 },
      }),
      raceName: null,
      finishSeconds: null,
      finishConfirmed: false,
    });
    expect(byId(slides, "volume")!.subline).toBe("Kilometer für Kilometer bis an die Startlinie.");
    expect(byId(slides, "sessions")!.subline).toBe("Jede davon hat dich weitergebracht.");
  });

  it("feiert alle Einheiten ohne Auslassung", () => {
    const slides = buildRecapSlides({
      stats: fullRecapStats({ sessions: { done: 94, planned: 94, skipped: 0 } }),
      raceName: null,
      finishSeconds: null,
      finishConfirmed: false,
    });
    expect(byId(slides, "sessions")!.subline).toBe("Alle geplanten Einheiten. Keine ausgelassen.");
  });

  describe("Renn-Slide (K6)", () => {
    it("Ziel erreicht: Extra-Burst und Abstand unter dem Ziel", () => {
      const race = byId(
        buildRecapSlides({ stats: fullRecapStats(), raceName: "Warschau Marathon", finishSeconds: 10000, finishConfirmed: true }),
        "race",
      )!;
      expect(race.celebration).toBe("goal");
      expect(race.headline).toBe("Marathon-Finisher");
      expect(race.subline).toBe("3:10 unter deinem Ziel");
      expect(race.detail).toBe("3:57/km");
      expect(formatRecapHero(race.hero!)).toBe("2:46:40");
    });

    it("Ziel verpasst: gefeiert, kein Abstand, Zielvorgabe nur als Kontext", () => {
      const race = byId(
        buildRecapSlides({ stats: fullRecapStats(), raceName: "Warschau Marathon", finishSeconds: 11637, finishConfirmed: true }),
        "race",
      )!;
      expect(race.celebration).toBe("base");
      expect(race.headline).toBe("Marathon-Finisher");
      expect(race.subline).toBe("Die ganze Distanz. Bis ins Ziel.");
      expect(race.detail).toBe("4:36/km · Ziel: Sub 2:50");
      const text = [race.headline, race.subline, race.detail].join(" ");
      expect(text).not.toMatch(/\+|über deinem Ziel|verpasst|verfehlt|leider|knapp/i);
    });

    it("unbestätigte Health-Zeit trägt den Hinweis (Renn-Slide und Outro)", () => {
      const slides = buildRecapSlides({ stats: fullRecapStats(), raceName: null, finishSeconds: 11637, finishConfirmed: false });
      const race = byId(slides, "race")!;
      expect(race.eyebrow).toBe("Renntag");
      expect(race.detail).toBe("4:36/km · Ziel: Sub 2:50 · laut Apple Health");
      expect(byId(slides, "outro")!.summary).toContain("3:13:57 · laut Apple Health");
    });

    it("keine Zeit, Rennen abgehakt: trotzdem gefeiert, Distanz als Kernzahl", () => {
      const race = byId(
        buildRecapSlides({ stats: fullRecapStats(), raceName: "Warschau Marathon", finishSeconds: null, finishConfirmed: false }),
        "race",
      )!;
      expect(race.celebration).toBe("base");
      expect(formatRecapHero(race.hero!)).toBe("42,195");
      expect(race.heroUnit).toBe("km");
      expect(race.headline).toBe("Marathon-Finisher");
      expect(race.detail).toBe("Ziel: Sub 2:50");
    });

    it("ohne Zielvorgabe kein Zielbezug", () => {
      const stats = fullRecapStats();
      const race = byId(
        buildRecapSlides({
          stats: { ...stats, race: { ...stats.race, goalSeconds: null } },
          raceName: null,
          finishSeconds: 11637,
          finishConfirmed: true,
        }),
        "race",
      )!;
      expect(race.celebration).toBe("base");
      expect(race.detail).toBe("4:36/km");
    });

    it("Halbmarathon heißt Halbmarathon-Finisher", () => {
      const stats = fullRecapStats();
      const race = byId(
        buildRecapSlides({
          stats: { ...stats, race: { ...stats.race, distanceKm: 21.0975, goalSeconds: null } },
          raceName: null,
          finishSeconds: 5400,
          finishConfirmed: true,
        }),
        "race",
      )!;
      expect(race.headline).toBe("Halbmarathon-Finisher");
    });

    it("nur Datum vorbei, keine Zeit: kein behaupteter Lauf, kein Konfetti", () => {
      const stats = fullRecapStats();
      const slides = buildRecapSlides({
        stats: { ...stats, race: { ...stats.race, completedBy: "date_passed" } },
        raceName: "Warschau Marathon",
        finishSeconds: null,
        finishConfirmed: false,
      });
      expect(byId(slides, "race")).toBeUndefined();
      expect(slides.some((s) => s.celebration)).toBe(false);
      expect(byId(slides, "outro")!.headline).toBe("Das war deine Vorbereitung.");
    });

    it("nur Datum vorbei, aber Zeit eingetragen: wird gefeiert", () => {
      const stats = fullRecapStats();
      const slides = buildRecapSlides({
        stats: { ...stats, race: { ...stats.race, completedBy: "date_passed" } },
        raceName: null,
        finishSeconds: 11637,
        finishConfirmed: true,
      });
      expect(byId(slides, "race")!.celebration).toBe("base");
      expect(byId(slides, "outro")!.headline).toBe("Jetzt ist Erholung dran.");
    });

    it("Plan ohne Rennen: keine Renn-Slide, eigenes Outro", () => {
      const stats = fullRecapStats();
      const slides = buildRecapSlides({
        stats: { ...stats, race: { ...stats.race, completedBy: "plan_ended", name: null, goalSeconds: null } },
        raceName: null,
        finishSeconds: null,
        finishConfirmed: false,
      });
      expect(byId(slides, "race")).toBeUndefined();
      expect(byId(slides, "intro")!.eyebrow).toBe("Dein Trainingsplan");
      expect(byId(slides, "outro")!.headline).toBe("Plan durchgezogen.");
    });
  });
});
