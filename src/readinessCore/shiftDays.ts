/**
 * Tageseignung aus dem Dienstplan (Schicht-Modus, docs/readiness-spec.md §7.6).
 *
 * Rein: keine Uhr, kein Netz, nur Kalendertage (`YYYY-MM-DD`) und Uhrzeiten (`HH:MM`). Alle Rechnungen laufen in
 * „Wanduhr-Minuten“ ab einem festen Kalendertag (UTC-Arithmetik aus `planCore/dates`), deshalb ist das Ergebnis
 * unabhängig von Zeitzone und Sommerzeit. Ein Nachtdienst 22–6 Uhr zählt immer als 8 h, auch in der Nacht der
 * Zeitumstellung (7 h bzw. 9 h echte Zeit) — für die Regeln zählt der Dienstplan, nicht die Stoppuhr.
 *
 * ES5-tauglich: keine Iteration über Set/Map, nur Arrays und einfache Objekte.
 *
 * Regeln (Nummern wie im Arbeitsplan W1, Spec §7.6):
 *  1 Tag, an dem ein Nachtdienst morgens endet → hart + Long Run ungeeignet, locker eingeschränkt („kurz, nach dem Schlafen“)
 *  2 Tag, an dem der erste Nachtdienst eines Blocks abends beginnt → hart eingeschränkt, Long Run ungeeignet
 *  3 Tag zwischen zwei Nachtdiensten → hart + Long Run ungeeignet, locker eingeschränkt (Vorrang vor 1)
 *  4 erster freier Tag nach einem Nachtblock → hart eingeschränkt, Long Run ungeeignet; zweiter freier Tag → frei
 *  5 Ruhezeit < 11 h vor einem Dienst → Tag dieses Dienstes hart (und Long Run) eingeschränkt
 *  6 Spätdienst endet nach Mitternacht (höchstens 2 h im neuen Tag) → Folgetag hart (und Long Run) eingeschränkt
 *  7 größte freie Lücke 06–22 Uhr < Dauer + 45 min → hart + Long Run ungeeignet, locker „passt zeitlich nicht“
 *  8 Dienst > 8 h → hart (und Long Run) eingeschränkt, außer das ausreichende Fenster liegt vor Dienstbeginn
 *  9 eine Schicht zählt nie als Training; bei mehreren Regeln gilt die strengste Eignung und deren Grund
 * Tage ohne Bezug zum Dienstplan bekommen keinen Eintrag (keine Aussage, nicht „frei“).
 */

import { addDays, diffDays, isYmd } from "../planCore/dates";
import { CONFIG } from "./config";
import type { Ymd } from "./types";

export type ShiftKind = "early" | "late" | "night" | "off" | "custom";

/** Ein Dienstplan-Eintrag (`shift_entries`): `dateYmd` = Tag des Dienstbeginns; `end <= start` = endet am Folgetag. */
export type ShiftEntry = {
  readonly dateYmd: Ymd;
  readonly kind: ShiftKind;
  /** `HH:MM`; bei `off` beide `null`. Fehlen sie bei early/late/night, gelten die Standardzeiten. */
  readonly start: string | null;
  readonly end: string | null;
  readonly label?: string | null;
};

/** Eignung eines Tages; UI: frei · eingeschränkt · ungeeignet · passt zeitlich nicht. */
export type ShiftSuitability = "free" | "limited" | "unsuitable" | "no_window";

export type ShiftReasonCode =
  | "after_night"
  | "before_night"
  | "between_nights"
  | "recovery_after_nights"
  | "free_after_nights"
  | "quick_return"
  | "late_shift"
  | "no_window"
  | "long_shift"
  | "day_off"
  | "shift_fits";

export type ShiftCategory = "hard" | "long" | "easy";

export type ShiftDayAssessment = {
  readonly dateYmd: Ymd;
  readonly hard: ShiftSuitability;
  readonly long: ShiftSuitability;
  readonly easy: ShiftSuitability;
  /** Grund der strengsten Eignung (hart vor Long Run vor locker bei Gleichstand). */
  readonly reasonCode: ShiftReasonCode;
  readonly reasonText: string;
  /** Grund je Art der Einheit. */
  readonly reasons: { readonly hard: ShiftReasonCode; readonly long: ShiftReasonCode; readonly easy: ShiftReasonCode };
  /** Der Dienst, der an diesem Tag beginnt (für die Kürzel F/S/N). */
  readonly shift?: ShiftEntry;
  /** Der Dienst, auf den sich `reasonCode` bezieht (z. B. die Nacht davor); fehlt bei „frei“ ohne Dienst. */
  readonly causeShift?: ShiftEntry;
  /** Größte freie Lücke im Tagesfenster in Minuten; `null`, wenn kein Dienst das Fenster berührt. */
  readonly largestGapMin: number | null;
};

export type ShiftDaysInput = {
  readonly entries: readonly ShiftEntry[];
  /** Erster und letzter Tag der Ausgabe (inklusive). */
  readonly fromYmd: Ymd;
  readonly toYmd: Ymd;
  /** Geplante Dauer je Tag in Minuten (gilt für alle Arten); ohne Eintrag gelten die Standarddauern aus `CONFIG.shift`. */
  readonly plannedMinByDay?: Readonly<Record<Ymd, number>>;
};

export const SHIFT_REASON_TEXT: Readonly<Record<ShiftReasonCode, string>> = {
  after_night: "Nach dem Nachtdienst",
  before_night: "Vor dem ersten Nachtdienst",
  between_nights: "Zwischen zwei Nachtdiensten",
  recovery_after_nights: "Erster freier Tag nach den Nachtdiensten",
  free_after_nights: "Zweiter freier Tag nach den Nachtdiensten",
  quick_return: "Weniger als 11 Stunden Ruhe vor dem Dienst",
  late_shift: "Nach dem Spätdienst bis nach Mitternacht",
  no_window: "Kein ausreichendes Zeitfenster neben dem Dienst",
  long_shift: "Langer Dienst",
  day_off: "Dienstfrei",
  shift_fits: "Der Dienst lässt genug Zeit",
};

const DAY_MIN = 1440;
const EPOCH: Ymd = "2000-01-01";

/** Strenge-Rang je Eignung: höher = strenger. */
const RANK: Readonly<Record<ShiftSuitability, number>> = { free: 0, limited: 1, no_window: 2, unsuitable: 3 };

/** `HH:MM` (auch `HH:MM:SS`) → Minuten seit Mitternacht; `null` bei ungültiger Angabe. */
export function timeToMinutes(value: string | null | undefined): number | null {
  if (typeof value !== "string") return null;
  const match = /^(\d{1,2}):(\d{2})/.exec(value.trim());
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h > 24 || m > 59 || (h === 24 && m !== 0)) return null;
  return h * 60 + m;
}

/** Zeiten eines Eintrags; Standardzeiten, wenn bei early/late/night keine angegeben sind. `null` bei off/ungültig. */
export function resolveShiftTimes(entry: ShiftEntry): { start: number; end: number } | null {
  if (entry.kind === "off") return null;
  let start = timeToMinutes(entry.start);
  let end = timeToMinutes(entry.end);
  if ((start == null || end == null) && entry.kind !== "custom") {
    const defaults = CONFIG.shift.defaultTimes.value[entry.kind];
    start = timeToMinutes(defaults.start);
    end = timeToMinutes(defaults.end);
  }
  if (start == null || end == null) return null;
  // end <= start: endet am Folgetag (24:00 zählt als Mitternacht desselben Tages).
  const endAbs = end <= start ? end + DAY_MIN : end;
  return { start, end: endAbs };
}

/** Dauer in Minuten (0 bei frei/ungültig). */
export function shiftDurationMin(entry: ShiftEntry): number {
  const times = resolveShiftTimes(entry);
  return times ? times.end - times.start : 0;
}

/** Minuten, die ein Dienst in den Folgetag hineinreicht (0, wenn er am selben Tag endet). */
export function minutesIntoNextDay(entry: ShiftEntry): number {
  const times = resolveShiftTimes(entry);
  return times ? Math.max(0, times.end - DAY_MIN) : 0;
}

/**
 * Nachtdienst = Art `night` oder ein Dienst, der mehr als `overnightMinHoursNextDay` (2 h) in den neuen Tag reicht.
 * Ein Spätdienst bis 0:30 Uhr ist damit kein Nachtdienst, sondern Regel 6.
 */
export function isNightShift(entry: ShiftEntry): boolean {
  if (entry.kind === "off") return false;
  const into = minutesIntoNextDay(entry);
  if (entry.kind === "night") return resolveShiftTimes(entry) != null;
  return into > CONFIG.calendar.overnightMinHoursNextDay.value * 60;
}

type Work = { entry: ShiftEntry; day: number; start: number; end: number; night: boolean };

type Verdict = { suit: ShiftSuitability; code: ShiftReasonCode; cause?: ShiftEntry };

type DayAcc = {
  hard: Verdict | null;
  long: Verdict | null;
  easy: Verdict | null;
};

function dayNumber(ymd: Ymd): number {
  return diffDays(ymd, EPOCH);
}

function ymdOf(day: number): Ymd {
  return addDays(EPOCH, day);
}

/** Strengere Eignung gewinnt; bei Gleichstand bleibt die zuerst eingetragene (Reihenfolge der Regeln = Vorrang). */
function stricter(current: Verdict | null, next: Verdict): Verdict {
  if (!current) return next;
  return RANK[next.suit] > RANK[current.suit] ? next : current;
}

function freeGaps(busy: Array<[number, number]>, windowStart: number, windowEnd: number): Array<[number, number]> {
  const clamped = busy
    .map((b): [number, number] => [Math.max(b[0], windowStart), Math.min(b[1], windowEnd)])
    .filter((b) => b[1] > b[0])
    .sort((a, b) => a[0] - b[0]);
  const gaps: Array<[number, number]> = [];
  let cursor = windowStart;
  for (let i = 0; i < clamped.length; i += 1) {
    if (clamped[i][0] > cursor) gaps.push([cursor, clamped[i][0]]);
    cursor = Math.max(cursor, clamped[i][1]);
  }
  if (windowEnd > cursor) gaps.push([cursor, windowEnd]);
  return gaps;
}

/**
 * Tageseignung für alle Tage von `fromYmd` bis `toYmd` mit Bezug zum Dienstplan (Spec §7.6).
 * Ergebnis aufsteigend nach Datum; Tage ohne Bezug fehlen.
 */
export function assessShiftDays(input: ShiftDaysInput): ShiftDayAssessment[] {
  if (!isYmd(input.fromYmd) || !isYmd(input.toYmd) || input.toYmd < input.fromYmd) return [];
  const from = dayNumber(input.fromYmd);
  const to = dayNumber(input.toYmd);

  // Einträge je Tag (bei Dubletten gewinnt der letzte, wie ein Upsert über user_id+shift_date).
  const byDay: Record<string, ShiftEntry> = {};
  for (let i = 0; i < input.entries.length; i += 1) {
    const entry = input.entries[i];
    if (!entry || !isYmd(entry.dateYmd)) continue;
    byDay[String(dayNumber(entry.dateYmd))] = entry;
  }

  const works: Work[] = [];
  const workByDay: Record<string, Work> = {};
  Object.keys(byDay).forEach((key) => {
    const entry = byDay[key];
    const times = resolveShiftTimes(entry);
    if (!times) return;
    const day = Number(key);
    const work: Work = { entry, day, start: day * DAY_MIN + times.start, end: day * DAY_MIN + times.end, night: isNightShift(entry) };
    works.push(work);
    workByDay[key] = work;
  });
  works.sort((a, b) => a.start - b.start);

  const workOn = (day: number): Work | null => workByDay[String(day)] ?? null;
  const nightOn = (day: number): Work | null => {
    const w = workOn(day);
    return w && w.night ? w : null;
  };

  const acc: Record<string, DayAcc> = {};
  const touch = (day: number): DayAcc | null => {
    if (day < from || day > to) return null;
    const key = String(day);
    if (!acc[key]) acc[key] = { hard: null, long: null, easy: null };
    return acc[key];
  };
  const mark = (day: number, category: ShiftCategory, verdict: Verdict) => {
    const a = touch(day);
    if (!a) return;
    a[category] = stricter(a[category], verdict);
  };

  const { quickReturnHours, windowStart, windowEnd, windowExtraMin } = CONFIG.calendar;
  const shiftCfg = CONFIG.shift;
  const ws = timeToMinutes(windowStart.value) as number;
  const we = timeToMinutes(windowEnd.value) as number;

  // Tage mit Eintrag haben immer Bezug.
  Object.keys(byDay).forEach((key) => touch(Number(key)));

  // Regeln 1–4: Nachtblöcke. Reihenfolge der `mark`-Aufrufe = Vorrang bei gleicher Strenge.
  for (let i = 0; i < works.length; i += 1) {
    const w = works[i];
    if (!w.night) continue;
    const endDay = Math.floor((w.end - 1) / DAY_MIN);
    const nextNight = nightOn(w.day + 1);
    const prevNight = nightOn(w.day - 1);
    if (endDay > w.day) {
      if (nextNight && nextNight.day === endDay) {
        // Regel 3: zwischen zwei Nachtdiensten.
        mark(endDay, "hard", { suit: "unsuitable", code: "between_nights", cause: w.entry });
        mark(endDay, "long", { suit: "unsuitable", code: "between_nights", cause: w.entry });
        mark(endDay, "easy", { suit: "limited", code: "between_nights", cause: w.entry });
      } else {
        // Regel 1: Nachtdienst endet morgens.
        mark(endDay, "hard", { suit: "unsuitable", code: "after_night", cause: w.entry });
        mark(endDay, "long", { suit: "unsuitable", code: "after_night", cause: w.entry });
        mark(endDay, "easy", { suit: "limited", code: "after_night", cause: w.entry });
        // Regel 4: freie Tage nach dem Block (ohne Dienst bzw. mit „frei“).
        const recoveryDays = shiftCfg.recoveryDaysAfterNights.value;
        let free = 0;
        for (let d = endDay + 1; d <= endDay + recoveryDays + 1; d += 1) {
          if (workOn(d)) break;
          free += 1;
          if (free <= recoveryDays) {
            mark(d, "hard", { suit: "limited", code: "recovery_after_nights", cause: w.entry });
            mark(d, "long", { suit: "unsuitable", code: "recovery_after_nights", cause: w.entry });
            mark(d, "easy", { suit: "free", code: "recovery_after_nights", cause: w.entry });
          } else {
            mark(d, "hard", { suit: "free", code: "free_after_nights", cause: w.entry });
            mark(d, "long", { suit: "free", code: "free_after_nights", cause: w.entry });
            mark(d, "easy", { suit: "free", code: "free_after_nights", cause: w.entry });
          }
        }
      }
    }
    if (!prevNight) {
      // Regel 2: erster Nachtdienst eines Blocks beginnt abends.
      mark(w.day, "hard", { suit: "limited", code: "before_night", cause: w.entry });
      mark(w.day, "long", { suit: "unsuitable", code: "before_night", cause: w.entry });
    }
  }

  // Regel 5: kurze Ruhezeit vor einem Dienst.
  for (let i = 1; i < works.length; i += 1) {
    const prev = works[i - 1];
    const next = works[i];
    const rest = next.start - prev.end;
    if (rest >= 0 && rest < quickReturnHours.value * 60) {
      mark(next.day, "hard", { suit: "limited", code: "quick_return", cause: prev.entry });
      mark(next.day, "long", { suit: "limited", code: "quick_return", cause: prev.entry });
    }
  }

  // Regel 6: Spätdienst endet nach Mitternacht (kein Nachtdienst).
  for (let i = 0; i < works.length; i += 1) {
    const w = works[i];
    if (w.night || w.end <= (w.day + 1) * DAY_MIN) continue;
    mark(w.day + 1, "hard", { suit: "limited", code: "late_shift", cause: w.entry });
    mark(w.day + 1, "long", { suit: "limited", code: "late_shift", cause: w.entry });
  }

  // Regeln 7 und 8: Trainingsfenster und langer Dienst, je Tag der Ausgabe.
  const gapByDay: Record<string, number | null> = {};
  for (let day = from; day <= to; day += 1) {
    const own = workOn(day);
    const carried = workOn(day - 1);
    const busy: Array<[number, number]> = [];
    let cause: ShiftEntry | undefined;
    if (carried && carried.end > day * DAY_MIN) {
      busy.push([0, carried.end - day * DAY_MIN]);
      cause = carried.entry;
    }
    if (own) {
      busy.push([own.start - day * DAY_MIN, Math.min(own.end - day * DAY_MIN, DAY_MIN)]);
      cause = own.entry;
    }
    const touchesWindow = busy.some((b) => Math.min(b[1], we) > Math.max(b[0], ws));
    if (!touchesWindow) {
      gapByDay[String(day)] = null;
      continue;
    }
    const gaps = freeGaps(busy, ws, we);
    let largest = 0;
    for (let g = 0; g < gaps.length; g += 1) largest = Math.max(largest, gaps[g][1] - gaps[g][0]);
    gapByDay[String(day)] = largest;

    const planned = input.plannedMinByDay ? input.plannedMinByDay[ymdOf(day)] : undefined;
    const plannedValid = typeof planned === "number" && Number.isFinite(planned) && planned > 0 ? planned : null;
    const need = {
      hard: (plannedValid ?? shiftCfg.defaultHardMin.value) + windowExtraMin.value,
      long: (plannedValid ?? shiftCfg.defaultLongRunMin.value) + windowExtraMin.value,
      easy: (plannedValid ?? shiftCfg.defaultEasyMin.value) + windowExtraMin.value,
    };
    if (largest < need.hard) mark(day, "hard", { suit: "unsuitable", code: "no_window", cause });
    if (largest < need.long) mark(day, "long", { suit: "unsuitable", code: "no_window", cause });
    if (largest < need.easy) mark(day, "easy", { suit: "no_window", code: "no_window", cause });

    // Regel 8: langer Dienst, außer ein ausreichendes Fenster liegt vor Dienstbeginn.
    if (own && own.end - own.start > shiftCfg.longShiftHours.value * 60) {
      const ownStart = own.start - day * DAY_MIN;
      const before = gaps.filter((g) => g[1] <= ownStart);
      const fitsBefore = (minutes: number) => before.some((g) => g[1] - g[0] >= minutes);
      if (!fitsBefore(need.hard)) mark(day, "hard", { suit: "limited", code: "long_shift", cause: own.entry });
      if (!fitsBefore(need.long)) mark(day, "long", { suit: "limited", code: "long_shift", cause: own.entry });
    }
  }

  const out: ShiftDayAssessment[] = [];
  Object.keys(acc)
    .map(Number)
    .sort((a, b) => a - b)
    .forEach((day) => {
      const a = acc[String(day)];
      const entry = byDay[String(day)];
      const fallback: Verdict = entry && entry.kind === "off" ? { suit: "free", code: "day_off" } : { suit: "free", code: "shift_fits", cause: entry };
      const hard = a.hard ?? fallback;
      const long = a.long ?? fallback;
      const easy = a.easy ?? fallback;
      // Strengste Eignung über alle Arten; Gleichstand: hart vor Long Run vor locker.
      let top = hard;
      if (RANK[long.suit] > RANK[top.suit]) top = long;
      if (RANK[easy.suit] > RANK[top.suit]) top = easy;
      const assessment: ShiftDayAssessment = {
        dateYmd: ymdOf(day),
        hard: hard.suit,
        long: long.suit,
        easy: easy.suit,
        reasonCode: top.code,
        reasonText: SHIFT_REASON_TEXT[top.code],
        reasons: { hard: hard.code, long: long.code, easy: easy.code },
        ...(entry ? { shift: entry } : {}),
        ...(top.cause ? { causeShift: top.cause } : {}),
        largestGapMin: gapByDay[String(day)] ?? null,
      };
      out.push(assessment);
    });
  return out;
}

/** Ergebnis als Nachschlage-Objekt je Kalendertag. */
export function indexShiftDays(days: readonly ShiftDayAssessment[]): Record<Ymd, ShiftDayAssessment> {
  const out: Record<Ymd, ShiftDayAssessment> = {};
  for (let i = 0; i < days.length; i += 1) out[days[i].dateYmd] = days[i];
  return out;
}

/** Eignung eines Tages für eine Art von Einheit. */
export function suitabilityFor(day: ShiftDayAssessment, category: ShiftCategory): ShiftSuitability {
  return category === "hard" ? day.hard : category === "long" ? day.long : day.easy;
}

/** Grund-Code eines Tages für eine Art von Einheit. */
export function reasonFor(day: ShiftDayAssessment, category: ShiftCategory): ShiftReasonCode {
  return day.reasons[category];
}
