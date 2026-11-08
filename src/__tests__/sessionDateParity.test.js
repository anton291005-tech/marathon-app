// Spiegel-Parität:
//   src/core/time/sessionDate.ts  (Client-Bundle)
//   api/_lib/sessionDate.js       (Serverlaufzeit)
// CRA lässt keinen Import aus `api/` im Client-Bundle zu, deshalb zwei Implementierungen. Beide müssen
// für dieselben Sessions dasselbe Datum liefern.

const client = require("../core/time/sessionDate");
const server = require("../../api/_lib/sessionDate");

const FALLBACK_YEAR = 2027;
const SESSIONS = [
  { date: "7. Nov", dateIso: "2026-11-07" },
  { date: "3. Jan", dateIso: "2027-01-03" },
  { date: "28. Feb", dateIso: "2027-02-28T12:00:00.000Z" },
  { date: "28. Feb" },
  { date: "14. Mär" },
  { date: "14. Mar" },
  { date: "29. Feb" },
  { date: "31. Apr" },
  { date: "Montag" },
  { date: "7. Nov", dateIso: "kaputt" },
  { date: "7. Nov", dateIso: "2026-13-45" },
  { dateIso: "2027-01-03" },
  {},
  null,
];

describe("sessionDate: Client und Server stimmen überein", () => {
  test.each(SESSIONS.map((s, i) => [i, s]))("Vektor %i", (_i, session) => {
    expect(server.sessionYmd(session, FALLBACK_YEAR)).toBe(client.sessionYmd(session, FALLBACK_YEAR));
    const a = server.sessionDate(session, FALLBACK_YEAR);
    const b = client.sessionDate(session, FALLBACK_YEAR);
    expect(a && a.getTime()).toBe(b && b.getTime());
  });

  test("labelToYmd / dateIsoToYmd", () => {
    for (const [label, year] of [["1. Jan", 2027], ["29. Feb", 2028], ["29. Feb", 2027], [undefined, 2027], ["1. Jan", NaN]]) {
      expect(server.labelToYmd(label, year)).toBe(client.labelToYmd(label, year));
    }
    for (const iso of ["2027-02-29", "2028-02-29", "2027-01-03T10:00:00Z", null, 5]) {
      expect(server.dateIsoToYmd(iso)).toBe(client.dateIsoToYmd(iso));
    }
  });
});
