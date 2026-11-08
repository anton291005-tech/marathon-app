import { execFileSync } from "child_process";

import { dateIsoToYmd, labelToYmd, sessionYmd } from "./sessionDate";
import { freezeTimeForTests } from "./timeSystem";

/** Plan Sa 07.11.2026 → So 28.02.2027: das Label verliert das Jahr, `dateIso` nicht. */
const NOV_SESSION = { date: "7. Nov", dateIso: "2026-11-07" };
const JAN_SESSION = { date: "3. Jan", dateIso: "2027-01-03" };
const RACE_SESSION = { date: "28. Feb", dateIso: "2027-02-28" };

afterEach(() => freezeTimeForTests(null));

describe("sessionYmd", () => {
  it("nimmt bei Plänen über Neujahr das Jahr aus dateIso, nicht aus dem Label", () => {
    expect(sessionYmd(NOV_SESSION)).toBe("2026-11-07");
    expect(sessionYmd(JAN_SESSION)).toBe("2027-01-03");
    expect(sessionYmd(RACE_SESSION)).toBe("2027-02-28");
  });

  it("dateIso schlägt fallbackYear (2027-Plan bleibt 2027)", () => {
    expect(sessionYmd({ date: "14. Mär", dateIso: "2027-03-14" }, 2026)).toBe("2027-03-14");
  });

  it("akzeptiert volle ISO-Strings und nimmt nur den Kalendertag", () => {
    expect(sessionYmd({ date: "7. Nov", dateIso: "2026-11-07T12:00:00.000Z" })).toBe("2026-11-07");
  });

  it("ohne dateIso: Label + fallbackYear", () => {
    expect(sessionYmd({ date: "28. Feb" }, 2027)).toBe("2027-02-28");
    expect(sessionYmd({ date: "28. Feb", dateIso: null }, 2026)).toBe("2026-02-28");
    expect(sessionYmd({ date: "28. Feb", dateIso: "kaputt" }, 2027)).toBe("2027-02-28");
  });

  it("ohne dateIso und ohne fallbackYear: Jahr der App-Uhr, nicht ein festes Jahr", () => {
    freezeTimeForTests(new Date("2027-06-01T10:00:00+02:00"));
    expect(sessionYmd({ date: "28. Feb" })).toBe("2027-02-28");
    freezeTimeForTests(new Date("2026-11-08T10:00:00+01:00"));
    expect(sessionYmd({ date: "28. Feb" })).toBe("2026-02-28");
  });

  it("liest auch „Mär“ (Label aus planCore) und „Mar“", () => {
    expect(sessionYmd({ date: "14. Mär" }, 2027)).toBe("2027-03-14");
    expect(sessionYmd({ date: "14. Mar" }, 2027)).toBe("2027-03-14");
  });

  it("null bei fehlender oder unlesbarer Session", () => {
    expect(sessionYmd(null)).toBeNull();
    expect(sessionYmd(undefined)).toBeNull();
    expect(sessionYmd({})).toBeNull();
    expect(sessionYmd({ date: "Montag" }, 2026)).toBeNull();
    expect(sessionYmd({ date: "31. Feb" }, 2026)).toBeNull();
    expect(sessionYmd({ date: "7. Nov", dateIso: "2026-13-45" }, 2026)).toBe("2026-11-07");
  });
});

describe("labelToYmd / dateIsoToYmd", () => {
  it("brauchen ein explizites Jahr bzw. ein echtes Datum", () => {
    expect(labelToYmd("1. Jan", 2027)).toBe("2027-01-01");
    expect(labelToYmd("1. Jan", Number.NaN)).toBeNull();
    expect(labelToYmd(undefined, 2027)).toBeNull();
    expect(dateIsoToYmd("2027-02-29")).toBeNull();
    expect(dateIsoToYmd("2028-02-29")).toBe("2028-02-29");
  });
});

/**
 * Jest kann die Zeitzone nicht zur Laufzeit wechseln (`process.env.TZ` wirkt in der Test-VM nicht),
 * deshalb läuft die Zeitzonenprobe in einem Kindprozess mit gesetztem `TZ`.
 */
function runInTimeZone(tz: string, expression: string): unknown {
  const script = `
    const { sessionDate, sessionYmd } = require("./src/core/time/sessionDate");
    const f = (d) => d && [d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours()];
    console.log(JSON.stringify(${expression}));
  `;
  const out = execFileSync(process.execPath, ["-r", "sucrase/register", "-e", script], {
    cwd: process.cwd(),
    env: { ...process.env, TZ: tz },
    encoding: "utf8",
  });
  return JSON.parse(out.trim());
}

describe.each([
  ["Europe/Berlin", -60],
  ["UTC", 0],
])("sessionDate in Zeitzone %s", (tz, offsetMinutes) => {
  it("läuft wirklich in der Zeitzone", () => {
    expect(runInTimeZone(tz, "new Date(2027, 0, 3, 12).getTimezoneOffset()")).toBe(offsetMinutes);
  });

  it("liefert den lokalen Kalendertag um 12:00 (kein Kippen auf den Vortag)", () => {
    expect(
      runInTimeZone(
        tz,
        `[
          f(sessionDate({ date: "7. Nov", dateIso: "2026-11-07" })),
          f(sessionDate({ date: "3. Jan", dateIso: "2027-01-03" })),
          f(sessionDate({ date: "28. Feb", dateIso: "2027-02-28" })),
          f(sessionDate({ date: "1. Jan", dateIso: "2027-01-01" })),
          sessionYmd({ date: "1. Jan", dateIso: "2027-01-01T00:30:00+01:00" }),
        ]`,
      ),
    ).toEqual([[2026, 11, 7, 12], [2027, 1, 3, 12], [2027, 2, 28, 12], [2027, 1, 1, 12], "2027-01-01"]);
  });

  it("Session ohne dateIso: Label mit fallbackYear, ebenfalls lokal 12:00", () => {
    expect(runInTimeZone(tz, `f(sessionDate({ date: "28. Feb" }, 2027))`)).toEqual([2027, 2, 28, 12]);
  });

  it("null, wenn kein Datum ableitbar ist", () => {
    expect(runInTimeZone(tz, `[sessionDate({ date: "—" }), sessionDate(null)]`)).toEqual([null, null]);
  });
});
