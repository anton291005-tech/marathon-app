/**
 * Schnelleingabe der Dienstplan-Seite: Rotationsmuster („F F S S N N – – –“) und „Woche kopieren“.
 * Reine Funktionen über Kalendertage; die Zeiten kommen aus den (änderbaren) Standardzeiten.
 */
import { addDays, diffDays, isYmd } from "../planCore/dates";
import { CONFIG } from "../readinessCore/config";
import type { ShiftEntryKind, StoredShiftEntry } from "../lib/supabase/services/shiftEntriesService";
import type { ShiftDefaultTimes } from "../lib/supabase/services/shiftProfileService";

export type RotationKind = "early" | "late" | "night" | "off";

export type RotationParse = { ok: true; kinds: RotationKind[] } | { ok: false; invalid: string[] };

const TOKEN: Readonly<Record<string, RotationKind>> = {
  f: "early",
  früh: "early",
  frueh: "early",
  s: "late",
  spät: "late",
  spaet: "late",
  n: "night",
  nacht: "night",
  "–": "off",
  "—": "off",
  "-": "off",
  x: "off",
  frei: "off",
  "0": "off",
};

/** Längstes zulässiges Muster (Tage) und längste Anwendung (Wochen). */
export const ROTATION_MAX_DAYS = 42;
export const ROTATION_MAX_WEEKS = 12;

/** „F F S S N N – – –“, „FFSSNN---“ oder „F,F,S“ → Arten. Unbekannte Zeichen werden gemeldet, nicht geraten. */
export function parseRotationPattern(text: string): RotationParse {
  const raw = (text ?? "").trim().toLowerCase();
  if (!raw) return { ok: false, invalid: [] };
  const parts = /[\s,;/]/.test(raw)
    ? raw.split(/[\s,;/]+/).filter(Boolean)
    : // Ohne Trenner: jedes Zeichen ein Tag („FFSSNN---“).
      raw.split("");
  const kinds: RotationKind[] = [];
  const invalid: string[] = [];
  parts.forEach((part) => {
    const kind = TOKEN[part];
    if (kind) kinds.push(kind);
    else invalid.push(part);
  });
  if (invalid.length > 0 || kinds.length === 0 || kinds.length > ROTATION_MAX_DAYS) return { ok: false, invalid };
  return { ok: true, kinds };
}

export function defaultTimesFor(kind: "early" | "late" | "night", defaults?: ShiftDefaultTimes | null): { start: string; end: string } {
  const own = defaults?.[kind];
  return own ?? CONFIG.shift.defaultTimes.value[kind];
}

/** Ein Eintrag der Art `kind` mit Standardzeiten. */
export function entryOfKind(dateYmd: string, kind: ShiftEntryKind, defaults?: ShiftDefaultTimes | null, custom?: { start: string; end: string }): StoredShiftEntry {
  if (kind === "off") return { dateYmd, kind, start: null, end: null, label: null };
  if (kind === "custom") return { dateYmd, kind, start: custom?.start ?? "09:00", end: custom?.end ?? "17:00", label: null };
  const times = defaultTimesFor(kind, defaults);
  return { dateYmd, kind, start: times.start, end: times.end, label: null };
}

/**
 * Muster ab `startYmd` für `weeks` Wochen, zyklisch wiederholt. `untilYmd` begrenzt nach hinten (z. B. auf das
 * Fenster der Seite); Ergebnis aufsteigend.
 */
export function applyRotation(args: {
  kinds: readonly RotationKind[];
  startYmd: string;
  weeks: number;
  defaults?: ShiftDefaultTimes | null;
  untilYmd?: string;
}): StoredShiftEntry[] {
  if (!isYmd(args.startYmd) || args.kinds.length === 0) return [];
  const weeks = Math.max(1, Math.min(ROTATION_MAX_WEEKS, Math.round(args.weeks)));
  const out: StoredShiftEntry[] = [];
  for (let i = 0; i < weeks * 7; i += 1) {
    const dateYmd = addDays(args.startYmd, i);
    if (args.untilYmd && dateYmd > args.untilYmd) break;
    out.push(entryOfKind(dateYmd, args.kinds[i % args.kinds.length], args.defaults));
  }
  return out;
}

/**
 * „Woche kopieren“: die 7 Tage ab `sourceStartYmd` auf die folgenden `times` Wochen übertragen. Tage ohne Eintrag in
 * der Quellwoche werden in der Zielwoche gelöscht (`deletes`), damit die Kopie wirklich gleich aussieht.
 */
export function copyWeek(args: {
  entriesByDate: Readonly<Record<string, StoredShiftEntry>>;
  sourceStartYmd: string;
  times: number;
  untilYmd?: string;
}): { upserts: StoredShiftEntry[]; deletes: string[] } {
  const upserts: StoredShiftEntry[] = [];
  const deletes: string[] = [];
  if (!isYmd(args.sourceStartYmd)) return { upserts, deletes };
  for (let w = 1; w <= Math.max(1, Math.min(ROTATION_MAX_WEEKS, args.times)); w += 1) {
    for (let d = 0; d < 7; d += 1) {
      const source = args.entriesByDate[addDays(args.sourceStartYmd, d)];
      const target = addDays(args.sourceStartYmd, w * 7 + d);
      if (args.untilYmd && target > args.untilYmd) continue;
      if (source) upserts.push({ ...source, dateYmd: target });
      else if (args.entriesByDate[target]) deletes.push(target);
    }
  }
  return { upserts, deletes };
}

/** Tage von `fromYmd` bis einschließlich `toYmd`. */
export function daysBetween(fromYmd: string, toYmd: string): string[] {
  if (!isYmd(fromYmd) || !isYmd(toYmd) || toYmd < fromYmd) return [];
  const n = diffDays(toYmd, fromYmd);
  const out: string[] = [];
  for (let i = 0; i <= n; i += 1) out.push(addDays(fromYmd, i));
  return out;
}
