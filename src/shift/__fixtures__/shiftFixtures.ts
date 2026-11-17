/** Testbausteine für den Schicht-Modus: Wochen im AiPlanWeek-Format und Dienstplan-Einträge. */
import type { AiPlanSession, AiPlanWeek, SessionType } from "../../lib/ai/types";
import type { StoredShiftEntry } from "../../lib/supabase/services/shiftEntriesService";
import { addDays, weekdayOf } from "../../planCore/dates";

const MONTHS = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];

export function session(id: string, dateIso: string, type: SessionType, km = type === "rest" ? 0 : 8, title?: string): AiPlanSession {
  return {
    id,
    day: weekdayOf(dateIso),
    date: `${Number(dateIso.slice(8, 10))}. ${MONTHS[Number(dateIso.slice(5, 7)) - 1]}`,
    dateIso,
    type,
    title: title ?? ({ interval: "Intervalle", tempo: "Tempolauf", long: "Long Run", race: "Rennen", rest: "Ruhetag", easy: "Lockerer Lauf" } as Record<string, string>)[type] ?? "Lauf",
    km,
  };
}

/** Woche ab Montag `monday` mit sieben Typen (Mo … So). */
export function week(wn: number, monday: string, types: SessionType[], phase = "build", prefix = `w${wn}`): AiPlanWeek {
  return {
    wn,
    phase,
    label: `Woche ${wn}`,
    dates: monday,
    km: 0,
    s: types.map((type, i) => session(`${prefix}-${i}`, addDays(monday, i), type)),
  };
}

export const N = (dateYmd: string): StoredShiftEntry => ({ dateYmd, kind: "night", start: "22:00", end: "06:00", label: null });
export const F = (dateYmd: string): StoredShiftEntry => ({ dateYmd, kind: "early", start: "06:00", end: "14:00", label: null });
export const S = (dateYmd: string, start = "14:00", end = "22:00"): StoredShiftEntry => ({ dateYmd, kind: "late", start, end, label: null });
export const OFF = (dateYmd: string): StoredShiftEntry => ({ dateYmd, kind: "off", start: null, end: null, label: null });
