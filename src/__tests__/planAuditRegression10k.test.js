// Regression: der aktive 10-km-Plan aus dem Audit (8 Wochen, Start Mo 12.10.2026, Rennen Di 01.12.2026).
// Der Mock-Claude liefert genau die gemeldeten Defekte; jeder der 7 Punkte wird einzeln am Ergebnis geprüft.

const mockCreate = jest.fn();
jest.mock("@anthropic-ai/sdk", () => jest.fn());
process.env.ANTHROPIC_API_KEY = "test-key-audit";

const Anthropic = require("@anthropic-ai/sdk");
const { generateFullPlanByPhases } = require("../../api/_lib/phasedFullPlanGenerator");
const { normalizeTrainingPlan } = require("../planV2/normalizeTrainingPlan");
const { validateTrainingPlanV2Integrity } = require("../ai/validation/validateTrainingPlanV2Integrity");
const { getSessionPlannedDistanceKm, parseStructuredWorkoutSpecFromDesc, computeStructuredWorkoutDistance } = require("../sessionDistance");

const DAY_MS = 86400000;
const START = "2026-10-12";
const RACE = "2026-12-01";
const DAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

const PROFILE = {
  raceDistanceKm: 10,
  raceDistanceLabel: "10 km",
  raceGoal: "finish",
  raceTargetTime: null,
  weeklyKmRange: "40–60 km",
  raceDate: "01.12.2026",
  planStartDate: "12.10.2026",
  planDurationDays: 50,
  userPreferences: [],
};

// Wochenumfänge des Audits (fallend) und Long Runs (W1 am längsten, "Long Run Peak" in W5 nur 14,4 km)
const AUDIT_WEEK_KM = [55, 53, 47.2, 34, 43.8, 34.9, 31, 28];
const AUDIT_LONG_KM = [16.5, 15, 15.6, 12, 14.4, 12, 0, 0];

function auditWorkoutsForWeek(wn, mondayMs) {
  const out = [];
  for (let d = 0; d < 7; d += 1) {
    const ymd = new Date(mondayMs + d * DAY_MS).toISOString().slice(0, 10);
    const base = { id: `w${wn}-${DAYS[d].toLowerCase()}`, weekId: `w${wn}`, day: DAYS[d], dateIso: `${ymd}T12:00:00.000Z`, phase: "BUILD" };
    const easyKm = Math.max(4, (AUDIT_WEEK_KM[wn - 1] - AUDIT_LONG_KM[wn - 1]) / 4);
    let w;
    if (ymd === RACE) w = { ...base, type: "race", title: "Rennen", km: 10, description: "Rennen." };
    else if (ymd > RACE) w = { ...base, type: "easy", title: "Easy Run (Taper)", km: 6, description: "Locker." };
    else if (ymd === "2026-11-28") w = { ...base, type: "rest", title: "Ruhetag vor Renntag", km: 0, description: "Frei." };
    else if (ymd === "2026-11-29") w = { ...base, type: "tempo", title: "Tempo", km: 12, description: "Tempo 12 km, GA2." };
    else if (ymd === "2026-11-30") w = { ...base, type: "easy", title: "Lauf", km: 8, description: "Locker." };
    else if (ymd === "2026-10-29") w = { ...base, type: "interval", title: "Intervalle", km: 15, description: "2 km + 6×(3 min/90 s) + 2 km, Zone 4–5, GA2." };
    else if (ymd === "2026-11-01") w = { ...base, type: "long", title: "Long Run", km: 15.6, description: "Langer Lauf über 18 km." };
    else if (d === 0) w = { ...base, type: "rest", title: "Ruhetag", km: 0, description: "Frei." };
    else if (d === 1) w = { ...base, type: "interval", title: "Intervalle", km: 9, description: "Intervalle, Zone 4–5, GA2." };
    else if (d === 2) w = { ...base, type: "easy", title: "Lockerer Lauf", km: easyKm, description: "Locker bei 60–70 % HFmax." };
    else if (d === 3) w = { ...base, type: "easy", title: "Lockerer Lauf", km: easyKm, description: "Locker bei 60–70 % HFmax." };
    else if (d === 4) w = { ...base, type: "easy", title: "Lockerer Lauf", km: easyKm, description: "Locker." };
    else if (d === 5) w = { ...base, type: wn >= 3 && wn <= 6 ? "tempo" : "easy", title: "Samstags-Tempo", km: 10, description: "Tempo in Zone 3–4 direkt vor dem Long Run." };
    else w = { ...base, type: AUDIT_LONG_KM[wn - 1] > 0 ? "long" : "easy", title: "Long Run", km: AUDIT_LONG_KM[wn - 1] || 8, description: "Langer Lauf." };
    out.push(w);
  }
  return out;
}

function auditReply(params) {
  if (String(params.system ?? "").includes("phases (Phasenstruktur)")) {
    const structure = {
      analysis: "Audit",
      phases: [
        { name: "base", weeks: 2, label: "Aerober Grundlagenblock", focus: "Basis" },
        { name: "build", weeks: 3, label: "Entwicklungsphase", focus: "Aufbau" },
        { name: "peak", weeks: 2, label: "Spezifische Vorbereitung", focus: "Spitze" },
        { name: "taper", weeks: 1, label: "Tapering", focus: "Erholen" },
      ],
      sessionNames: {},
      rules: { restDays: [1], longRunDay: 0, intervalDay: 2, tempoDay: 5, maxTrainingDaysPerWeek: 5, weeklyKmMultiplier: 1 },
    };
    return { content: [{ type: "text", text: JSON.stringify(structure) }], usage: {} };
  }
  const message = String(params.messages?.[0]?.content ?? "");
  const weeks = [];
  const workouts = [];
  for (const m of message.matchAll(/- Woche (\d+) \(global w\d+\): startIso=(\d{4}-\d{2}-\d{2})/g)) {
    const wn = Number(m[1]);
    weeks.push({ id: `w${wn}`, label: `Woche ${wn}`, startIso: m[2], totalKm: AUDIT_WEEK_KM[wn - 1] });
    workouts.push(...auditWorkoutsForWeek(wn, Date.parse(`${START}T00:00:00Z`) + (wn - 1) * 7 * DAY_MS));
  }
  return { content: [{ type: "text", text: JSON.stringify({ weeks, workouts }) }], usage: {} };
}

const ymd = (w) => String(w.dateIso).slice(0, 10);
const kmOf = (week) => week.workouts.reduce((s, w) => s + (w.sport !== "rest" && w.sessionType !== "race" ? w.km : 0), 0);
const isHard = (w) => w.sessionType === "interval" || w.sessionType === "tempo";

let plan;

beforeAll(async () => {
  jest.spyOn(process.stdout, "write").mockImplementation(() => true);
  jest.spyOn(console, "log").mockImplementation(() => {});
  jest.spyOn(console, "warn").mockImplementation(() => {});
  Anthropic.mockImplementation(() => ({ messages: { create: mockCreate } }));
  mockCreate.mockImplementation(async (params) => auditReply(params));
  ({ plan } = await generateFullPlanByPhases({ messages: { create: mockCreate } }, PROFILE));
});

afterAll(() => jest.restoreAllMocks());

describe("Audit 10-km-Plan (Rennen Di 01.12.2026)", () => {
  it("Plan hat 8 Wochen und übersteht die Client-Normalisierung unverändert", () => {
    expect(plan.weeks).toHaveLength(8);
    const normalized = normalizeTrainingPlan(plan);
    expect(validateTrainingPlanV2Integrity(normalized)).toBe(true);
    expect(normalized.workouts).toHaveLength(plan.workouts.length);
  });

  it("1. Umfang steigt bis zur Spitze (statt 55 53 47 34 44 35 31 28), danach Taper", () => {
    const build = plan.weeks.filter((w) => w.meta.phase !== "taper");
    const taper = plan.weeks.filter((w) => w.meta.phase === "taper");
    let previous = 0;
    for (const week of build) {
      if (week.meta.isRecoveryWeek) continue;
      expect(kmOf(week)).toBeGreaterThanOrEqual(previous * 0.97 - 0.5);
      previous = kmOf(week);
    }
    expect(Math.max(...build.map(kmOf))).toBe(kmOf(build[build.length - 1]));
    expect(kmOf(plan.weeks[0])).toBeLessThan(kmOf(build[build.length - 1]));
    expect(taper.length).toBeGreaterThanOrEqual(1);
    expect(taper.every((w) => kmOf(w) < kmOf(build[build.length - 1]))).toBe(true);
  });

  it("2. Längster Lauf liegt 2–3 Wochen vor dem Rennen, nicht in Woche 1", () => {
    const longs = plan.workouts.filter((w) => w.sessionType === "long").sort((a, b) => ymd(a).localeCompare(ymd(b)));
    const peak = longs.reduce((a, b) => (b.km >= a.km ? b : a));
    expect(ymd(peak)).toBe("2026-11-15");
    expect(longs[0].km).toBeLessThan(peak.km);
    const beforePeak = longs.filter((w) => ymd(w) < ymd(peak));
    beforePeak.forEach((w, i) => {
      const week = plan.weeks.find((x) => x.workouts.some((y) => y.id === w.id));
      if (i > 0 && !week.meta.isRecoveryWeek) expect(w.km).toBeGreaterThanOrEqual(beforePeak[i - 1].km - 0.15);
    });
    for (const w of longs) {
      const week = plan.weeks.find((x) => x.workouts.some((y) => y.id === w.id));
      const total = week.workouts.reduce((s, y) => s + (y.sport !== "rest" ? y.km : 0), 0);
      expect(w.km / total).toBeLessThanOrEqual(0.305);
    }
  });

  it("3. Taper: Rennen ist die letzte Einheit, Di 01.12. ist Renntag, davor locker oder frei, danach nichts", () => {
    const sorted = [...plan.workouts].sort((a, b) => ymd(a).localeCompare(ymd(b)));
    const last = sorted[sorted.length - 1];
    expect(last.sessionType).toBe("race");
    expect(ymd(last)).toBe(RACE);
    expect(last.km).toBe(10);
    expect(sorted.some((w) => ymd(w) > RACE)).toBe(false);
    const byDay = new Map(sorted.map((w) => [ymd(w), w]));
    expect(["easy", "rest"]).toContain(byDay.get("2026-11-29").sessionType); // So = Renntag −2 (war: 12 km Tempo)
    expect(["easy", "rest"]).toContain(byDay.get("2026-11-30").sessionType); // Mo = Renntag −1
    expect(byDay.get("2026-11-29").km).toBeLessThanOrEqual(10);
    expect(byDay.get("2026-11-30").km).toBeLessThanOrEqual(6);
    expect(sorted.some((w) => /Ruhetag vor Renntag|Taper/.test(w.title))).toBe(false);
    // Die Woche des Renntags beginnt am Montag 30.11.
    expect(plan.weeks[plan.weeks.length - 1].startIso).toBe("2026-11-30");
  });

  it("4. Kein Tempo/Intervall am Vortag eines Long Runs oder des Rennens (war: Sa Tempo in W3–W6)", () => {
    const sorted = [...plan.workouts].sort((a, b) => ymd(a).localeCompare(ymd(b)));
    sorted.forEach((w, i) => {
      const next = sorted[i + 1];
      if (isHard(w) && next && (Date.parse(ymd(next)) - Date.parse(ymd(w))) / DAY_MS === 1) {
        expect(["long", "race"]).not.toContain(next.sessionType);
      }
    });
  });

  it("5. Do 29.10.: km = Summe der Bausteine; So 01.11.: Text nennt die km der Einheit", () => {
    const thursday = plan.workouts.find((w) => ymd(w) === "2026-10-29");
    expect(thursday.sessionType === "interval" || thursday.sessionType === "easy").toBe(true);
    for (const w of plan.workouts.filter(isHard)) {
      const parsed = parseStructuredWorkoutSpecFromDesc(w.desc);
      expect(Math.abs(computeStructuredWorkoutDistance(parsed.workout) - w.km)).toBeLessThanOrEqual(0.1 * w.km);
      expect(Math.abs(getSessionPlannedDistanceKm({ km: w.km, type: w.sessionType, desc: w.desc, structured: w.structured }) - w.km)).toBeLessThanOrEqual(0.2);
    }
    const sunday = plan.workouts.find((w) => ymd(w) === "2026-11-01");
    expect(sunday.desc).not.toMatch(/18 km/);
    expect(sunday.sessionType).toBe("long");
    expect(sunday.desc).toContain(String(sunday.km).replace(".", ",") + " km");
  });

  it("6. Eine Zonensprache: kein GA2, keine 60–70 % HFmax, Zone im Text = Zone der Einheit", () => {
    const zoneByType = { easy: "Zone 2", long: "Zone 2", tempo: "Zone 3–4", interval: "Zone 4–5", race: "Zone 4–5" };
    for (const week of plan.weeks) {
      for (const w of week.workouts) {
        const text = `${w.title} ${w.desc}`;
        expect(text).not.toMatch(/GA\s?[12]|HFmax|%|bpm|Puls/);
        const expected = w.sessionType === "easy" && week.meta.isRecoveryWeek ? "Zone 1" : zoneByType[w.sessionType];
        for (const z of text.match(/Zone \d(?:–\d)?/g) ?? []) expect(z).toBe(expected);
      }
    }
  });

  it("7. Ein Phasenname pro Woche: Wochenlabel trägt den Namen der Phase, nicht 'Entwicklungsphase'", () => {
    const names = { base: "Grundlage", build: "Aufbau", peak: "Spitze", taper: "Taper" };
    plan.weeks.forEach((week, i) => {
      expect(week.meta.label).toBe(`Woche ${i + 1} · ${names[week.meta.phase]}`);
      expect(week.meta.label).not.toMatch(/Entwicklungsphase|Tapering|Aerober|Spezifische/);
    });
  });
});
