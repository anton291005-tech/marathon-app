/**
 * Jahresauflösung für Legacy-Plandaten, deren Sessions nur ein Anzeige-Label
 * ("14. Mär") statt eines datierten ISO-Strings tragen.
 *
 * Bisher riet der Client das Jahr über den hartkodierten 2026-Default von
 * `parseSessionDateLabel`. Dieses Modul wendet stattdessen dieselbe Ankerregel
 * an wie der Server (`api/_lib/planWorkoutUtils.js`): planStartDate → raceDate →
 * aktuelles Jahr. Zusätzlich erkennt es den Jahreswechsel *innerhalb* einer
 * Sequenz, den ein einzelnes Fallback-Jahr nicht abbilden kann (Nov → Feb
 * überspannt zwei Jahre).
 *
 * SPIEGEL: `api/_lib/legacyYearAnchor.js` muss sich identisch verhalten — CRA
 * (ModuleScopePlugin) lässt keinen Import aus `api/` in den Client-Bundle zu,
 * deshalb zwei Implementierungen. Beide Seiten sind über den gemeinsamen
 * Vektor `src/planV2/__fixtures__/legacyYearAnchorVectors.json` gepinnt
 * (`src/__tests__/legacyYearAnchorParity.test.ts`).
 */

export type LegacyYearAnchorSource = "planStartDate" | "raceDate" | "currentYear";

export type LegacyYearAnchor = {
  /** Kalenderjahr, das an `index` gilt. */
  year: number;
  /** Position in der Sequenz, an der `year` verankert ist. */
  index: number;
  source: LegacyYearAnchorSource;
};

/**
 * Rückwärtssprung in Monaten, der in einer chronologischen Plansequenz nur ein
 * Jahreswechsel sein kann. Ein Planschritt ist höchstens ~einen Monat weit,
 * also ist jeder Rücksprung ≥ 6 (Dez→Jan = 11, Nov→Feb = 9, Okt→Jan = 9) eine
 * Jahresgrenze, während leicht unsortierte Daten (Apr→Mär = 1) es nicht sind.
 */
const ROLLOVER_MIN_MONTH_DROP = 6;

const MIN_PLAUSIBLE_YEAR = 1900;
const MAX_PLAUSIBLE_YEAR = 2999;

function plausibleYear(value: number): number | null {
  if (!Number.isInteger(value)) return null;
  if (value < MIN_PLAUSIBLE_YEAR || value > MAX_PLAUSIBLE_YEAR) return null;
  return value;
}

/**
 * Liest das Jahr aus einem Anker-Datum. Akzeptiert ISO (`2026-03-14`) und das
 * deutsche Onboarding-Format (`14.03.2026`), das der Server heute via
 * `slice(-4)` ausliest.
 */
export function yearFromAnchorDate(raw: unknown): number | null {
  if (raw == null) return null;
  const text = String(raw).trim();
  if (!text) return null;

  const iso = /^(\d{4})-\d{2}-\d{2}/.exec(text);
  if (iso) return plausibleYear(Number(iso[1]));

  const trailing = /(\d{4})\s*$/.exec(text);
  if (trailing) return plausibleYear(Number(trailing[1]));

  return null;
}

/**
 * Relative Jahresverschiebung je Sequenzposition, beginnend bei 0. Erhöht sich
 * an jeder erkannten Jahresgrenze um 1.
 */
export function computeLegacyYearOffsets(months: readonly number[]): number[] {
  const offsets: number[] = [];
  let offset = 0;
  let previousMonth: number | null = null;

  for (const month of months) {
    if (previousMonth != null && previousMonth - month >= ROLLOVER_MIN_MONTH_DROP) {
      offset += 1;
    }
    previousMonth = month;
    offsets.push(offset);
  }

  return offsets;
}

/**
 * Wählt den Anker nach Serverregel. `planStartDate` datiert den Sequenzanfang,
 * `raceDate` das Rennen (bzw. ersatzweise das Sequenzende) — deshalb tragen die
 * beiden Quellen unterschiedliche Anker-Indizes.
 */
export function resolveLegacyYearAnchor(input: {
  planStartDate?: unknown;
  raceDate?: unknown;
  /** Position der Race-Session, -1 wenn keine erkennbar ist. */
  raceIndex?: number;
  lastIndex: number;
  currentYear: number;
}): LegacyYearAnchor {
  const startYear = yearFromAnchorDate(input.planStartDate);
  if (startYear != null) {
    return { year: startYear, index: 0, source: "planStartDate" };
  }

  const raceYear = yearFromAnchorDate(input.raceDate);
  if (raceYear != null) {
    const raceIndex = input.raceIndex ?? -1;
    const index = raceIndex >= 0 && raceIndex <= input.lastIndex ? raceIndex : input.lastIndex;
    return { year: raceYear, index: Math.max(0, index), source: "raceDate" };
  }

  return { year: input.currentYear, index: 0, source: "currentYear" };
}

/** Konkrete Kalenderjahre je Sequenzposition für den gewählten Anker. */
export function resolveLegacyYears(
  months: readonly number[],
  anchor: LegacyYearAnchor,
): number[] {
  const offsets = computeLegacyYearOffsets(months);
  if (offsets.length === 0) return [];

  const anchorIndex = Math.min(Math.max(anchor.index, 0), offsets.length - 1);
  const baseYear = anchor.year - offsets[anchorIndex];
  return offsets.map((offset) => baseYear + offset);
}
