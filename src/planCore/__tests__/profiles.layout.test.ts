import { checkPlanLayouts, compactWeek } from "../__fixtures__/layoutChecks";
import { PROFILES } from "../__fixtures__/profiles";
import type { Profile, ProfileName } from "../__fixtures__/profiles";
import { buildPaceProfile } from "../pace";
import { planPhases } from "../phases";
import { layoutWeeks } from "../placement";
import type { WeekLayout } from "../placement";

function layoutOf(profile: Profile): { layouts: WeekLayout[]; beginner: boolean } {
  const { inputs, todayYmd } = profile;
  const beginner = buildPaceProfile(inputs, todayYmd).mode === "beginner";
  const layouts = layoutWeeks(inputs, planPhases(inputs), { beginner });
  return { layouts, beginner };
}

const byName = (name: ProfileName): Profile => PROFILES.filter((p) => p.name === name)[0];
const qOf = (layout: WeekLayout) => layout.days.filter((d) => d.slot === "Q1" || d.slot === "Q1L" || d.slot === "Q2").length;
const slots = (layout: WeekLayout) => layout.days.map((d) => d.slot);

/** Erste volle Woche je Art: Basis, Aufbau, Spezifisch, Taper-Woche vor der Rennwoche, Rennwoche. */
function representative(layouts: WeekLayout[]): Record<string, string> {
  const pick = (test: (l: WeekLayout) => boolean): string => {
    const found = layouts.filter(test)[0];
    return found === undefined ? "—" : `W${found.wn}: ${compactWeek(found)}`;
  };
  return {
    base: pick((l) => l.mode === "base" && l.days.length === 7),
    build: pick((l) => l.phase === "build" && l.days.length === 7),
    peak: pick((l) => l.phase === "peak" && l.days.length === 7),
    taper: pick((l) => l.mode === "taper"),
    race: pick((l) => l.mode === "race"),
  };
}

describe("Referenzprofile P1–P6: Wochenformen", () => {
  PROFILES.forEach((profile) => {
    it(`${profile.name} ${profile.label}: keine Verstöße, ${profile.weeks} Wochen, Rennen am Sonntag als letzter Tag`, () => {
      const { layouts } = layoutOf(profile);
      expect(layouts).toHaveLength(profile.weeks);
      expect(
        checkPlanLayouts(layouts, {
          distance: profile.inputs.distance,
          runDays: profile.inputs.runDaysPerWeek,
          availableDays: profile.inputs.availableDays,
          longRunDay: "So",
          raceDate: profile.inputs.raceDate,
        }),
      ).toEqual([]);
      const last = layouts[layouts.length - 1];
      expect(last.days[last.days.length - 1]).toMatchObject({ slot: "RACE", weekday: "So" });
      layouts.forEach((layout) => expect(layout.notes).toEqual([]));
    });
  });

  it("P1 (Einsteiger, 3 Tage): Basis ohne Q, danach genau 1 Q", () => {
    const { layouts, beginner } = layoutOf(byName("P1"));
    expect(beginner).toBe(true);
    layouts.filter((l) => l.mode === "base").forEach((l) => expect(qOf(l)).toBe(0));
    layouts.filter((l) => l.mode === "main").forEach((l) => expect(qOf(l)).toBe(1));
  });

  it("P2 (10k, 4 Tage, Schätzzeit): in der Basis höchstens 1 Q (leichte Q1), Q2 erst ab Aufbau", () => {
    const { layouts, beginner } = layoutOf(byName("P2"));
    expect(beginner).toBe(false);
    layouts.filter((l) => l.mode === "base").forEach((l) => expect(slots(l)).toContain("Q1L"));
    layouts.filter((l) => l.mode === "base").forEach((l) => expect(qOf(l)).toBeLessThanOrEqual(1));
    layouts.filter((l) => l.mode === "main").forEach((l) => expect(slots(l)).toContain("Q2"));
  });

  it("P3 (HM, 5 Tage): Basis 1 Q, Aufbau/Spezifisch 2 Q, kein MLR", () => {
    const { layouts } = layoutOf(byName("P3"));
    layouts.filter((l) => l.mode === "base").forEach((l) => expect(qOf(l)).toBe(1));
    layouts.filter((l) => l.mode === "main").forEach((l) => expect(qOf(l)).toBe(2));
    layouts.forEach((l) => expect(slots(l)).not.toContain("MLR"));
  });

  it("P4 (M, 4 Tage): Q2 nur in Aufbau/Spezifisch; Rennwoche mit Q spätestens 4 Tage vor dem Rennen", () => {
    const { layouts } = layoutOf(byName("P4"));
    layouts.filter((l) => l.mode === "base").forEach((l) => expect(slots(l)).not.toContain("Q2"));
    layouts.filter((l) => l.mode === "main").forEach((l) => expect(slots(l)).toContain("Q2"));
    const race = layouts[layouts.length - 1];
    const qIndex = slots(race).indexOf("Q1");
    expect(qIndex).toBeGreaterThanOrEqual(0);
    expect(race.days.length - 1 - qIndex).toBeGreaterThanOrEqual(4);
  });

  it("P5 (M, 6 Tage): Aufbau/Spezifisch mit LR, Q1, Q2, MLR, E und REC in jeder Woche", () => {
    const { layouts } = layoutOf(byName("P5"));
    layouts
      .filter((l) => l.mode === "main")
      .forEach((l) => {
        ["LR", "Q1", "Q2", "MLR", "E", "REC"].forEach((slot) => expect(slots(l)).toContain(slot));
        expect(l.runDayCount).toBe(6);
      });
  });

  it("P6 (M, 3 Tage): nie mehr als 1 Q, jede volle Nicht-Rennwoche 3 Lauftage", () => {
    const { layouts } = layoutOf(byName("P6"));
    layouts.forEach((l) => expect(qOf(l)).toBeLessThanOrEqual(1));
    layouts.filter((l) => l.days.length === 7 && l.mode !== "race").forEach((l) => expect(l.runDayCount).toBe(3));
  });

  it("Rennwoche: höchstens 2 Ruhetage direkt vor dem Rennen, E an Renntag−2 (Zeilen für die Freigabe)", () => {
    const lines: Record<string, string> = {};
    PROFILES.forEach((profile) => {
      const race = layoutOf(profile).layouts.slice(-1)[0];
      lines[profile.name] = race.days.map((d) => (d.slot === "REST" ? "–" : d.slot)).join(" ");
    });
    expect(lines).toEqual({
      P1: "– – – Q1 E – RACE",
      P2: "– – – Q1 E – RACE",
      P3: "– – – Q1 E E RACE",
      P4: "– – Q1 – E – RACE",
      P5: "E – Q1 – E E RACE",
      P6: "– – Q1 – E – RACE",
    });
  });

  it("jedes Profil hat eine Rennwoche, die Profile mit Taper-Woche vor der Rennwoche (M, HM) zeigen sie", () => {
    PROFILES.forEach((profile) => {
      const shown = representative(layoutOf(profile).layouts);
      expect(shown.race).not.toBe("—");
      expect(shown.base).not.toBe("—");
      expect(shown.build).not.toBe("—");
      const twoTaperWeeks = profile.inputs.distance === "hm" || profile.inputs.distance === "m";
      expect(shown.taper === "—").toBe(!twoTaperWeeks);
    });
  });

  it("Snapshot aller Wochenformen (Änderungen sind bewusst)", () => {
    const out: Record<string, string[]> = {};
    PROFILES.forEach((profile) => {
      out[profile.name] = layoutOf(profile).layouts.map((l) => `W${l.wn} ${l.phase}/${l.mode}: ${compactWeek(l)}`);
    });
    expect(out).toMatchSnapshot();
  });
});
