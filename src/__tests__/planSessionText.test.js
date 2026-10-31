// Bausteine und Text: die km einer Einheit sind die Summe der Bausteine, der Text wird daraus erzeugt
// und vom Client-Parser exakt zurückgelesen.

const {
  buildStructure,
  shapeHardSession,
  renderSession,
  structureKm,
  kmFromDesc,
  zoneForSession,
  cleanPace,
  BANNED_TEXT,
} = require("../../api/_lib/planSessionText");
const {
  parseStructuredWorkoutSpecFromDesc,
  computeStructuredWorkoutDistance,
  getSessionPlannedDistanceKm,
} = require("../sessionDistance");

const RACES = [5, 10, 21.1, 42.2];
const KMS = [6, 7.5, 9, 10.4, 12, 14, 18, 24];

describe("shapeHardSession + renderSession", () => {
  const cases = [];
  // Obergrenzen wie in planInvariants.hardBounds: Intervall 14 km (Marathon 16), Tempo 20 km (Marathon 24)
  const maxKm = (sessionType, raceKm) => (sessionType === "interval" ? (raceKm > 30 ? 16 : 14) : raceKm > 30 ? 24 : 20);
  for (const raceKm of RACES)
    for (const km of KMS)
      for (const sessionType of ["interval", "tempo"])
        if (km <= maxKm(sessionType, raceKm)) cases.push([`${sessionType} ${km} km (Rennen ${raceKm})`, sessionType, km, raceKm]);

  it.each(cases)("%s: km = Bausteine, Text vom Client-Parser identisch gelesen", (_n, sessionType, km, raceKm) => {
    const shaped = shapeHardSession({ sessionType, km: 0, sport: "run" }, km, { raceKm });
    expect(shaped.km).toBe(structureKm(shaped.structured));
    expect(Math.abs(shaped.km - km)).toBeLessThanOrEqual(Math.max(1.5, 0.15 * km)); // Bausteine runden, weichen aber nicht stark ab

    const text = renderSession(shaped, { isRecoveryWeek: false });
    const parsed = parseStructuredWorkoutSpecFromDesc(text.desc);
    expect(parsed).not.toBeNull();
    expect(computeStructuredWorkoutDistance(parsed.workout)).toBeCloseTo(shaped.km, 1);
    expect(kmFromDesc(text.desc)).toBeCloseTo(shaped.km, 1);

    const resolved = getSessionPlannedDistanceKm({ km: shaped.km, type: sessionType, desc: text.desc, structured: text.structured });
    expect(resolved).toBeCloseTo(shaped.km, 1);
    expect(`${text.title} ${text.desc}`).not.toMatch(BANNED_TEXT);
  });

  it("Tempo gibt kein structured aus (der Client würde den Tempoblock sonst doppelt zählen)", () => {
    const shaped = shapeHardSession({ sessionType: "tempo", km: 0 }, 11, { raceKm: 10 });
    expect(shaped.structured.steadyBlocksKm[0]).toBeGreaterThan(0);
    expect(renderSession(shaped, {}).structured).toBeNull();
  });

  it("Intervall: Titel nennt Wiederholungen und Strecke", () => {
    const shaped = shapeHardSession({ sessionType: "interval", km: 0 }, 10, { raceKm: 10 });
    const { title, desc } = renderSession(shaped, {});
    expect(title).toMatch(/^\d+ × [\d,]+ km Intervalle$/);
    // Dezimalpunkt im parsebaren Text: der Client-Parser trennt an Kommas
    expect(desc).toMatch(/^[\d.]+ km WU · \d+ × [\d.]+ km \(90 s Pause\) · [\d.]+ km CD\. Zone 4–5\.$/);
  });
});

describe("lockere Läufe und Long Run", () => {
  it("Text nennt genau die km der Einheit und die Zone", () => {
    const easy = renderSession({ sessionType: "easy", km: 8.3, title: "Ruhiger Grundlagenlauf" }, {});
    expect(easy.desc).toContain("8,3 km");
    expect(easy.desc).toContain("Zone 2");
    expect(easy.title).toBe("Ruhiger Grundlagenlauf");
    const long = renderSession({ sessionType: "long", km: 16, title: "Long Run W3" }, {});
    expect(long.desc).toContain("16 km");
    expect(long.title).toBe("Langer Lauf");
  });

  it("Entlastungswoche: lockerer Lauf in Zone 1", () => {
    expect(zoneForSession("easy", true)).toBe("Zone 1");
    expect(renderSession({ sessionType: "easy", km: 6 }, { isRecoveryWeek: true }).desc).toContain("Zone 1");
  });

  it("verwirft Claude-Titel mit GA-Begriffen, Zahlen oder englischem Typ", () => {
    for (const bad of ["GA1-Dauerlauf", "Long Run W3", "easy (Taper) W2", "Lauf bei 70 % HFmax", "Easy Run"]) {
      const out = renderSession({ sessionType: "easy", km: 8, title: bad }, {});
      expect(out.title).toBe("Lockerer Dauerlauf");
    }
  });
});

describe("cleanPace", () => {
  it("behält messbare Pace, verwirft Freitext", () => {
    expect(cleanPace("5:30–5:50")).toBe("5:30–5:50");
    expect(cleanPace("locker bis moderat")).toBeNull();
    expect(cleanPace("60–70 % HFmax")).toBeNull();
  });
});

describe("buildStructure", () => {
  it("Intervall-Wiederholungen bleiben zwischen 2 und 12", () => {
    for (const raceKm of RACES) {
      for (const km of KMS.filter((k) => k <= 14)) {
        const reps = buildStructure("interval", km, raceKm).intervals[0].reps;
        expect(reps).toBeGreaterThanOrEqual(2);
        expect(reps).toBeLessThanOrEqual(12);
      }
    }
  });
});
