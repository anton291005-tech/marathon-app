import { PROFILES } from "../__fixtures__/profiles";
import type { ProfileName } from "../__fixtures__/profiles";
import { planSessions } from "../planSessions";
import { renderSession } from "../text";
import type { SessionText } from "../text";

function weekText(name: ProfileName, wn: number): SessionText[] {
  const profile = PROFILES.filter((p) => p.name === name)[0];
  const plan = planSessions(profile.inputs, profile.todayYmd);
  const week = plan.weeks.filter((w) => w.wn === wn)[0];
  return week.sessions.map((s) => renderSession(s, { distance: profile.inputs.distance, recoveryWeek: week.isRecoveryWeek }));
}

describe("planCore text", () => {
  it("P3 Peak-Woche: Titel, Beschreibung im Parser-Format, Pace-Feld, Typ", () => {
    const [mo, di, mi, doTag, , , so] = weekText("P3", 10);
    expect(mo).toMatchObject({ sessionType: "easy", intensity: "low", title: "Lockerer Dauerlauf", structured: null });
    expect(di).toMatchObject({
      sessionType: "tempo",
      title: "Schwelle 4 × 1,5 km",
      desc: "2 km WU · 4 × 1.5 km (60 s Pause) · 1.5 km CD. Zone 4.",
      pace: "4:23–4:33",
      structured: null,
    });
    expect(mi).toMatchObject({ sessionType: "rest", title: "Ruhetag", desc: null, pace: null });
    expect(doTag).toMatchObject({
      sessionType: "tempo",
      title: "HM-Tempo 3 × 2 km",
      desc: "2 km WU · 3 × 2 km HM-Tempo (120 s Pause) · 1.5 km CD. Zone 4.",
      pace: "4:25–4:35",
    });
    expect(so).toMatchObject({ sessionType: "long", intensity: "medium", title: "Langer Lauf" });
  });

  it("Intervalle mit Struktur für den Client, Rennen mit Zielpace", () => {
    const di = weekText("P3", 9)[1];
    expect(di).toMatchObject({
      sessionType: "interval",
      title: "Intervalle 4 × 1 km",
      structured: { warmupKm: 2, cooldownKm: 1.5, intervals: [{ reps: 4, distanceKm: 1 }], recoveryJogKm: 2.4 },
    });
    const race = weekText("P3", 12)[6];
    expect(race).toMatchObject({ sessionType: "race", title: "Halbmarathon", pace: "4:25–4:35" });
    expect(race.desc).toContain("Zielpace 4:30/km");
  });

  it("Einsteiger: T nach Minuten ohne Pace, Strides als Steigerungen", () => {
    const peak = weekText("P1", 7);
    const t = peak.filter((x) => x.sessionType === "tempo")[0];
    expect(t.pace).toBeNull();
    expect(t.desc).toMatch(/km Tempo \(ca\. \d+ min nach Gefühl\)/);
    const race = weekText("P1", 8);
    expect(race.filter((x) => x.title === "Lockerer Lauf mit Steigerungen").length).toBeGreaterThan(0);
  });

  it("LR+M: M-Block im Text, Typ long", () => {
    const so = weekText("P5", 16)[6];
    expect(so).toMatchObject({ sessionType: "long", intensity: "high", title: "Langer Lauf mit M-Block" });
    expect(so.desc).toMatch(/dann \d+(,\d)? km im Marathontempo in Zone 3/);
  });
});
