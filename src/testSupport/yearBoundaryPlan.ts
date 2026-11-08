/**
 * Test-Fixture für Pläne über den Jahreswechsel: Start Sa 07.11.2026, Ende So 28.02.2027, je Tag eine
 * Session. Das Label ("3. Jan") trägt kein Jahr, `dateIso` das echte — genau die Konstellation, in der
 * Label+festes Jahr falsche Daten liefert.
 */

import type { PlanSession, PlanWeek } from "../marathonPrediction";

const DE_MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
const DE_WEEKDAYS = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

export const YEAR_BOUNDARY_START = "2026-11-07";
export const YEAR_BOUNDARY_RACE = "2027-02-28";

function ymdOf(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

export function sessionForYmd(ymd: string, overrides: Partial<PlanSession> = {}): PlanSession {
  const [y, m, d] = ymd.split("-").map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d));
  return {
    id: `s-${ymd}`,
    day: DE_WEEKDAYS[utc.getUTCDay()],
    date: `${d}. ${DE_MONTHS[m - 1]}`,
    dateIso: ymd,
    type: "easy",
    title: "Lockerer Lauf",
    km: 8,
    desc: null,
    pace: null,
    ...overrides,
  } as PlanSession;
}

/** 17 Wochen à 7 Tage ab Sa 07.11.2026 bis So 28.02.2027 (Wochen laufen Sa–Fr, wie der Planstart). */
export function buildYearBoundaryPlan(options: { withDateIso?: boolean } = {}): PlanWeek[] {
  const withDateIso = options.withDateIso ?? true;
  const weeks: PlanWeek[] = [];
  const [sy, sm, sd] = YEAR_BOUNDARY_START.split("-").map(Number);
  const cursor = new Date(Date.UTC(sy, sm - 1, sd));
  const last = ymdOf(new Date(Date.UTC(2027, 1, 28)));
  let wn = 1;
  while (ymdOf(cursor) <= last) {
    const s: PlanSession[] = [];
    for (let i = 0; i < 7 && ymdOf(cursor) <= last; i += 1) {
      const session = sessionForYmd(ymdOf(cursor));
      if (!withDateIso) delete (session as { dateIso?: string }).dateIso;
      s.push(session);
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    weeks.push({ wn, phase: "BUILD", label: `Woche ${wn}`, km: s.length * 8, s });
    wn += 1;
  }
  return weeks;
}
