import { applyPlanPatches } from "../../lib/ai/actions";
import type { StoredShiftEntry } from "../../lib/supabase/services/shiftEntriesService";
import { clearMarathonLocalStorage } from "../../persistence/clearMarathonLocalStorage";
import { buildShiftCapacityContext } from "../shiftAdapter";
import { proposeShiftWeek, type ShiftWeekProposal } from "../proposeShiftWeek";
import { proposeShiftSingle } from "../proposeShiftSingle";
import { readAcceptedShiftMoves, recordAcceptedShiftMoves, validAcceptedShiftKeys, acceptedMovesKey } from "../shiftAcceptedMoves";
import { F, N, OFF, week } from "../__fixtures__/shiftFixtures";

const TODAY = "2026-11-17";
const USER = "user-a";

function byDate(entries: StoredShiftEntry[]): Record<string, StoredShiftEntry> {
  const out: Record<string, StoredShiftEntry> = {};
  entries.forEach((e) => (out[e.dateYmd] = e));
  return out;
}

function ctx(entries: StoredShiftEntry[]) {
  const c = buildShiftCapacityContext({ enabled: true, worksShifts: true, entries, todayYmd: TODAY });
  if (!c) throw new Error("Kontext erwartet");
  return c;
}

function expectProposal(result: ShiftWeekProposal): Extract<ShiftWeekProposal, { status: "proposal" }> {
  if (result.status !== "proposal") throw new Error(`Vorschlag erwartet, bekommen: ${result.status}`);
  return result;
}

// Repro A: Di+Mi Nacht 22–6, Fr+Sa frei, Intervalle Do → Vorschlag Fr (eingeschränkt).
const reproAPlan = () => [
  week(0, "2026-11-16", ["easy", "interval", "easy", "tempo", "rest", "easy", "long"], "build", "w0"),
  week(1, "2026-11-23", ["easy", "easy", "rest", "interval", "easy", "easy", "long"]),
];
const reproAEntries = () => [N("2026-11-24"), N("2026-11-25"), OFF("2026-11-27"), OFF("2026-11-28")];

describe("bestätigte Verschiebungen im Schicht-Modus", () => {
  beforeEach(() => localStorage.clear());

  it("Repro A: übernehmen → erneuter Scan meldet die Intervalle am Fr nicht mehr", () => {
    const plan = reproAPlan();
    const entries = reproAEntries();
    const c = ctx(entries);
    const first = expectProposal(proposeShiftWeek({ plan, weekIndex: 1, scheduleBlocks: [], shiftContext: c, todayYmd: TODAY }));
    expect(first.moves[0]).toMatchObject({ sessionId: "w1-3", toYmd: "2026-11-27" });

    // „Übernehmen“
    recordAcceptedShiftMoves(USER, first.patches, byDate(entries), c);
    const after = applyPlanPatches(plan, first.patches);

    // Ohne Bestätigung wäre der Fr ein weicher Konflikt mit dem Hinweis „bleibt … kein freier Tag“.
    const without = proposeShiftWeek({ plan: after, weekIndex: 1, scheduleBlocks: [], shiftContext: c, todayYmd: TODAY });
    expect(without.status).toBe("hint-only");

    const keys = validAcceptedShiftKeys(readAcceptedShiftMoves(USER), byDate(entries), c);
    const again = proposeShiftWeek({ plan: after, weekIndex: 1, scheduleBlocks: [], shiftContext: c, todayYmd: TODAY, acceptedKeys: keys });
    expect(again.status).toBe("no-conflicts");
    // Einzel-Pfad ebenso: kein Konflikt für die bestätigte Einheit.
    expect(proposeShiftSingle({ plan: after, weekIndex: 1, sessionId: "w1-3", scheduleBlocks: [], shiftContext: c, todayYmd: TODAY, acceptedKeys: keys }).status).toBe(
      "no-conflict",
    );
  });

  it("Dienstplan-Änderung am Tag oder am Vortag hebt die Bestätigung auf", () => {
    const plan = reproAPlan();
    const entries = reproAEntries();
    const c = ctx(entries);
    const first = expectProposal(proposeShiftWeek({ plan, weekIndex: 1, scheduleBlocks: [], shiftContext: c, todayYmd: TODAY }));
    recordAcceptedShiftMoves(USER, first.patches, byDate(entries), c);
    const after = applyPlanPatches(plan, first.patches);

    // Vortag (Do 26.) bekommt einen Frühdienst: Fr bleibt eingeschränkt, aber die Bestätigung gilt nicht mehr.
    const changedVortag = [...entries, F("2026-11-26")];
    const c2 = ctx(changedVortag);
    const keys2 = validAcceptedShiftKeys(readAcceptedShiftMoves(USER), byDate(changedVortag), c2);
    expect([...keys2]).toEqual([]);

    // Am Tag selbst (Fr 27.) ein langer Dienst statt frei: Fr bleibt für Intervalle eingeschränkt.
    const longShift: StoredShiftEntry = { dateYmd: "2026-11-27", kind: "custom", start: "05:30", end: "15:00", label: null };
    const changedDay = [N("2026-11-24"), N("2026-11-25"), longShift, OFF("2026-11-28")];
    const c3 = ctx(changedDay);
    expect(c3.byDate["2026-11-27"].hard).toBe("limited");
    // Die Intervalle am Fr verlieren die Bestätigung; der verdrängte lockere Lauf am Do (Tag und Vortag unverändert) nicht.
    expect([...validAcceptedShiftKeys(readAcceptedShiftMoves(USER), byDate(changedDay), c3)]).toEqual(["w1-4@2026-11-26"]);
    const rescan = proposeShiftWeek({
      plan: after,
      weekIndex: 1,
      scheduleBlocks: [],
      shiftContext: c3,
      todayYmd: TODAY,
      acceptedKeys: validAcceptedShiftKeys(readAcceptedShiftMoves(USER), byDate(changedDay), c3),
    });
    expect(rescan.status).not.toBe("no-conflicts");

    // Änderung weit weg (Mo 30.) lässt die Bestätigung stehen.
    const farAway = [...entries, F("2026-11-30")];
    expect(validAcceptedShiftKeys(readAcceptedShiftMoves(USER), byDate(farAway), ctx(farAway)).size).toBeGreaterThan(0);
  });

  it("Bestätigung gilt nur für Tag und Einheit, und nur gegen weiche Konflikte", () => {
    const plan = reproAPlan();
    const entries = reproAEntries();
    const c = ctx(entries);
    const first = expectProposal(proposeShiftWeek({ plan, weekIndex: 1, scheduleBlocks: [], shiftContext: c, todayYmd: TODAY }));
    recordAcceptedShiftMoves(USER, first.patches, byDate(entries), c);
    // Ursprünglicher Plan (Intervalle noch am ungeeigneten Do): Schlüssel passt nicht (anderer Tag) → Konflikt bleibt.
    const keys = validAcceptedShiftKeys(readAcceptedShiftMoves(USER), byDate(entries), c);
    expect(proposeShiftWeek({ plan, weekIndex: 1, scheduleBlocks: [], shiftContext: c, todayYmd: TODAY, acceptedKeys: keys }).status).toBe("proposal");
  });

  it("je Konto gespeichert, beim Abmelden gelöscht, „locker statt hart“ ohne Tageswechsel wird übergangen", () => {
    recordAcceptedShiftMoves(USER, [{ sessionId: "s1", changes: { type: "easy", km: 8 } }], {}, null);
    expect(readAcceptedShiftMoves(USER)).toEqual([]);
    recordAcceptedShiftMoves(USER, [{ sessionId: "s1", changes: { day: "Fr", date: "27. Nov", dateIso: "2026-11-27" } }], {}, null);
    expect(readAcceptedShiftMoves(USER).map((m) => m.dayYmd)).toEqual(["2026-11-27"]);
    expect(readAcceptedShiftMoves("user-b")).toEqual([]);
    // Neuer Eintrag derselben Einheit ersetzt den alten.
    recordAcceptedShiftMoves(USER, [{ sessionId: "s1", changes: { day: "Sa", date: "28. Nov", dateIso: "2026-11-28" } }], {}, null);
    expect(readAcceptedShiftMoves(USER).map((m) => m.dayYmd)).toEqual(["2026-11-28"]);
    clearMarathonLocalStorage();
    expect(localStorage.getItem(acceptedMovesKey(USER))).toBeNull();
  });
});
