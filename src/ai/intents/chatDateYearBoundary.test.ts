/**
 * Backlog W3 (c): Datumsangaben ohne Jahr im Chat („am 3. Januar") meinen das nächste Vorkommen ab heute.
 * Früher nahm „Ersetze …" das Jahr aus dem UTC-Zeitstempel bzw. fest 2026 und rollte nicht vor.
 */
import { nextOccurrenceYmd } from "../../core/time/sessionDate";
import { freezeTimeForTests } from "../../core/time/timeSystem";
import type { AiPlanWeek } from "../../lib/ai/types";
import { extractReplaceWorkoutIntent } from "./extractReplaceWorkoutIntent";
import { resolveSwap } from "./resolveSwap";

afterEach(() => freezeTimeForTests(null));

describe("nextOccurrenceYmd", () => {
  it("rollt über den Jahreswechsel", () => {
    expect(nextOccurrenceYmd(3, 0, "2026-11-17")).toBe("2027-01-03");
    expect(nextOccurrenceYmd(31, 11, "2026-11-17")).toBe("2026-12-31");
    expect(nextOccurrenceYmd(17, 10, "2026-11-17")).toBe("2026-11-17");
    expect(nextOccurrenceYmd(16, 10, "2026-11-17")).toBe("2027-11-16");
  });

  it("nimmt ohne Angabe die App-Uhr (eingefroren am 30.12.2026)", () => {
    freezeTimeForTests(new Date(2026, 11, 30, 23, 30));
    expect(nextOccurrenceYmd(3, 0)).toBe("2027-01-03");
    expect(nextOccurrenceYmd(30, 11)).toBe("2026-12-30");
  });

  it("verwirft unmögliche Tage, Schalttag springt ins nächste Schaltjahr", () => {
    expect(nextOccurrenceYmd(31, 3, "2026-11-17")).toBeNull();
    expect(nextOccurrenceYmd(32, 0, "2026-11-17")).toBeNull();
    expect(nextOccurrenceYmd(29, 1, "2026-11-17")).toBe("2028-02-29");
  });
});

describe("Chat: „Ersetze das Training am 3. Januar …“", () => {
  it("am 17.11.2026 ist das der 03.01.2027", () => {
    freezeTimeForTests(new Date(2026, 10, 17, 9, 0));
    const ext = extractReplaceWorkoutIntent("Ersetze das Training am 3. Januar mit einem Easy Run", {
      todayIso: new Date(2026, 10, 17, 9, 0).toISOString(),
    });
    expect(ext.sourceIsoHint).toBe("2027-01-03");
    expect(ext.sourceAnchor).toBe("iso");
  });

  it("an Silvester kurz nach Mitternacht (UTC noch 2026) zählt der lokale Kalendertag", () => {
    // 01.01.2027 00:30 Berlin = 31.12.2026 23:30 UTC: früher Jahr 2026 aus dem UTC-String → 03.01.2026.
    const now = new Date(2027, 0, 1, 0, 30);
    freezeTimeForTests(now);
    const ext = extractReplaceWorkoutIntent("Ersetze das Training am 3. Januar mit einem Tempo Run", {
      todayIso: now.toISOString(),
    });
    expect(ext.sourceIsoHint).toBe("2027-01-03");
  });

  it("ausgeschriebene Monate wie „November“ und „Dezember“ werden erkannt", () => {
    freezeTimeForTests(new Date(2026, 10, 17, 9, 0));
    expect(extractReplaceWorkoutIntent("Ersetze das Training am 20. Dezember mit einem Easy Run").sourceIsoHint).toBe("2026-12-20");
    expect(extractReplaceWorkoutIntent("Ersetze das Training am 18. November mit einem Easy Run").sourceIsoHint).toBe("2026-11-18");
  });
});

describe("Chat: „Tausche 30. Dezember und 3. Januar“ über den Jahreswechsel", () => {
  const plan: AiPlanWeek[] = [
    {
      wn: 8,
      phase: "BUILD",
      label: "W8",
      dates: "—",
      km: 40,
      s: [
        { id: "dec30", day: "Mi", date: "30. Dez", dateIso: "2026-12-30", type: "tempo", title: "Tempo", km: 10 },
        { id: "jan03", day: "So", date: "3. Jan", dateIso: "2027-01-03", type: "long", title: "Long Run", km: 22 },
      ],
    },
  ];

  it("findet beide Einheiten im richtigen Jahr", () => {
    const now = new Date(2026, 11, 28, 10, 0);
    freezeTimeForTests(now);
    const res = resolveSwap(plan, "Tausche das Training vom 30. Dezember mit dem vom 3. Januar", { now });
    expect(res.status).toBe("ok");
    if (res.status === "ok") {
      expect([res.source.id, res.target.id].sort()).toEqual(["dec30", "jan03"]);
    }
  });
});
