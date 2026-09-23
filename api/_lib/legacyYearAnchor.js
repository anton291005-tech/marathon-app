"use strict";

/**
 * Serverspiegel von `src/planV2/legacyYearAnchor.ts` — siehe dort für die
 * Herleitung der Regel. Beide Implementierungen müssen identisch rechnen; der
 * gemeinsame Vektor `src/planV2/__fixtures__/legacyYearAnchorVectors.json`
 * pinnt sie in `src/__tests__/legacyYearAnchorParity.test.ts`.
 *
 * Kein direkter Import aus `src/`: CRA blockt Imports aus `api/` (und der
 * Server läuft CJS), deshalb gespiegelt statt geteilt.
 */

/** Siehe Client-Spiegel: Rücksprung, der nur eine Jahresgrenze sein kann. */
const ROLLOVER_MIN_MONTH_DROP = 6;

const MIN_PLAUSIBLE_YEAR = 1900;
const MAX_PLAUSIBLE_YEAR = 2999;

function plausibleYear(value) {
  if (!Number.isInteger(value)) return null;
  if (value < MIN_PLAUSIBLE_YEAR || value > MAX_PLAUSIBLE_YEAR) return null;
  return value;
}

function yearFromAnchorDate(raw) {
  if (raw == null) return null;
  const text = String(raw).trim();
  if (!text) return null;

  const iso = /^(\d{4})-\d{2}-\d{2}/.exec(text);
  if (iso) return plausibleYear(Number(iso[1]));

  const trailing = /(\d{4})\s*$/.exec(text);
  if (trailing) return plausibleYear(Number(trailing[1]));

  return null;
}

function computeLegacyYearOffsets(months) {
  const offsets = [];
  let offset = 0;
  let previousMonth = null;

  for (const month of months) {
    if (previousMonth != null && previousMonth - month >= ROLLOVER_MIN_MONTH_DROP) {
      offset += 1;
    }
    previousMonth = month;
    offsets.push(offset);
  }

  return offsets;
}

function resolveLegacyYearAnchor(input) {
  const startYear = yearFromAnchorDate(input.planStartDate);
  if (startYear != null) {
    return { year: startYear, index: 0, source: "planStartDate" };
  }

  const raceYear = yearFromAnchorDate(input.raceDate);
  if (raceYear != null) {
    const raceIndex = input.raceIndex == null ? -1 : input.raceIndex;
    const index = raceIndex >= 0 && raceIndex <= input.lastIndex ? raceIndex : input.lastIndex;
    return { year: raceYear, index: Math.max(0, index), source: "raceDate" };
  }

  return { year: input.currentYear, index: 0, source: "currentYear" };
}

function resolveLegacyYears(months, anchor) {
  const offsets = computeLegacyYearOffsets(months);
  if (offsets.length === 0) return [];

  const anchorIndex = Math.min(Math.max(anchor.index, 0), offsets.length - 1);
  const baseYear = anchor.year - offsets[anchorIndex];
  return offsets.map((offset) => baseYear + offset);
}

module.exports = {
  yearFromAnchorDate,
  computeLegacyYearOffsets,
  resolveLegacyYearAnchor,
  resolveLegacyYears,
};
