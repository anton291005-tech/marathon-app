// Plan-Kern Schritt 6: Texte der Einheiten gegen den App-Parser und die Zonen-Abbildung der App.
// - I1 (Parser-Anteil): `getSessionPlannedDistanceKm` liest aus Beschreibung/Struktur dieselben km wie der Kern (±0,1 km).
// - Die geparsten Bausteine entsprechen den Bausteinen des Kerns (Rundlauf).
// - `SESSION_TYPE_OF_KIND` (Kern) passt zur Abbildung in hrZones.ts: mit `kind` kommt die Zone der Art, nicht die des Typs.

import { PROFILES } from "../planCore/__fixtures__/profiles";
import { planSessions } from "../planCore/planSessions";
import type { CoreSession } from "../planCore/sessions";
import { renderSession, SESSION_TYPE_OF_KIND } from "../planCore/text";
import type { CoreInputs, CoreKind } from "../planCore/types";
import { randomInputs } from "../planCore/__fixtures__/randomInputs";
import { getSessionPlannedDistanceKm, parseStructuredWorkoutSpecFromDesc } from "../sessionDistance";
import { zoneLabelForSession } from "../trainingIntelligence/hrZones";

type Case = { label: string; inputs: CoreInputs; todayYmd: string };

const CASES: Case[] = PROFILES.map((p) => ({ label: p.name, inputs: p.inputs, todayYmd: p.todayYmd }));
for (let index = 0; index < 300; index += 1) {
  const { inputs, todayYmd } = randomInputs(20261107 + index);
  CASES.push({ label: `seed ${20261107 + index}`, inputs, todayYmd });
}

function rendered(c: Case): Array<{ session: CoreSession; text: ReturnType<typeof renderSession> }> {
  const plan = planSessions(c.inputs, c.todayYmd);
  const out: Array<{ session: CoreSession; text: ReturnType<typeof renderSession> }> = [];
  plan.weeks.forEach((week) =>
    week.sessions.forEach((session) =>
      out.push({ session, text: renderSession(session, { distance: c.inputs.distance, recoveryWeek: week.isRecoveryWeek }) }),
    ),
  );
  return out;
}

describe("Plan-Kern: Texte der Einheiten", () => {
  it("I1: der App-Parser liest dieselben km wie der Kern (P1–P6 und 300 Zufallspläne)", () => {
    const problems: string[] = [];
    let parsed = 0;
    CASES.forEach((c) => {
      rendered(c).forEach(({ session, text }) => {
        if (session.kind === "REST") return;
        const km = getSessionPlannedDistanceKm({ km: session.km, type: text.sessionType, desc: text.desc, structured: text.structured });
        if (Math.abs(km - session.km) > 0.1 + 1e-9) problems.push(`${c.label} ${session.ymd} ${session.kind}: ${km} != ${session.km} (${text.desc})`);
        if (text.sessionType === "tempo" || text.sessionType === "interval") {
          const spec = parseStructuredWorkoutSpecFromDesc(text.desc);
          if (spec === null) problems.push(`${c.label} ${session.ymd}: nicht parsebar (${text.desc})`);
          else parsed += 1;
        }
      });
    });
    expect(problems.slice(0, 10)).toEqual([]);
    expect(parsed).toBeGreaterThan(1000);
  });

  it("Rundlauf: geparste Bausteine = Bausteine des Kerns (Dauerlauf, Wiederholungen, Ein-/Auslaufen)", () => {
    const problems: string[] = [];
    CASES.forEach((c) => {
      rendered(c).forEach(({ session, text }) => {
        if (text.sessionType !== "tempo" && text.sessionType !== "interval") return;
        const parsed = parseStructuredWorkoutSpecFromDesc(text.desc);
        if (parsed === null) return;
        const spec = parsed.workout;
        session.segments.forEach((segment) => {
          if (segment.type === "warmup" && spec.warmupKm !== segment.km) problems.push(`${session.ymd}: WU`);
          if (segment.type === "cooldown" && spec.cooldownKm !== segment.km) problems.push(`${session.ymd}: CD`);
          if (segment.type === "steady" && (spec.steadyBlocksKm ?? []).join() !== String(segment.km)) problems.push(`${session.ymd}: Block ${text.desc}`);
          if (segment.type === "reps") {
            const block = (spec.intervals ?? [])[0];
            if (block === undefined || block.reps !== segment.reps || Math.abs(block.distanceKm - segment.repKm) > 1e-9) problems.push(`${session.ymd}: Wdh ${text.desc}`);
            if (Math.abs((spec.recoveryJogKm ?? 0) - segment.restKm) > 1e-9) problems.push(`${session.ymd}: Pause ${text.desc}`);
          }
        });
      });
    });
    expect(problems.slice(0, 10)).toEqual([]);
  });

  it("Pace-Feld im Format m:ss–m:ss oder leer (Einsteiger-T/M, Ruhetag)", () => {
    const bad: string[] = [];
    CASES.slice(0, 40).forEach((c) =>
      rendered(c).forEach(({ text }) => {
        if (text.pace !== null && !/^\d{1,2}:\d{2}–\d{1,2}:\d{2}$/.test(text.pace)) bad.push(text.pace);
      }),
    );
    expect(bad).toEqual([]);
  });

  it("Abbildung kind → sessionType passt zu hrZones: mit kind kommt die Zone der Art", () => {
    const expected: Partial<Record<CoreKind, string>> = {
      REC: "Zone 1",
      E: "Zone 2",
      MLR: "Zone 2",
      LR: "Zone 2",
      "LR+M": "Zone 2",
      M: "Zone 3",
      T: "Zone 4",
      I: "Zone 4–5",
      R: "Zone 4–5",
    };
    (Object.keys(expected) as CoreKind[]).forEach((kind) => {
      expect([kind, zoneLabelForSession(SESSION_TYPE_OF_KIND[kind], kind, false)]).toEqual([kind, expected[kind]]);
    });
  });
});
