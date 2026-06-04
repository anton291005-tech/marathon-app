/**
 * Collapse HealthKit-style samples into one row per local calendar day.
 * Sleep: mehrere Segmente pro Nacht werden auf den Wake-Tag (lokales endDate) summiert.
 * Zeitzonen: alle Berechnungen in lokaler Zeit via Date-Konstruktor.
 */

import { getAppNow } from "../core/time/timeSystem";
import type { RecoveryDailyRow } from "./recoveryTypes";
import { mergeRecoverySignalMeta } from "./signalMetaUtils";

export type MinimalHealthSample = {
  dataType: string;
  value: number;
  unit: string;
  startDate: string;
  endDate: string;
  sleepState?: string;
};

function localYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseIso(iso: string): Date | null {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  return new Date(t);
}

function minutesBetween(start: Date, end: Date): number {
  return Math.max(0, (end.getTime() - start.getTime()) / 60000);
}

function minutesFromMidnightLocal(d: Date): number {
  return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
}

type MutableDay = {
  sleepAsleepMin: number;
  sleepInBedMin: number;
  sleepAwakeMin: number;
  sleepRemMin: number;
  sleepDeepMin: number;
  sleepCoreMin: number;
  /** Frühester lokaler Start (Minuten) aller Schlafsegmente an diesem Wake-Tag */
  sleepEarliestStartMin: number | null;
  /** Spätestes lokales Ende */
  sleepLatestEndMin: number | null;
  hrvSum: number;
  hrvN: number;
  rhrSum: number;
  rhrN: number;
  respSum: number;
  respN: number;
  tempSum: number;
  tempN: number;
  activeEnergyKcalSum: number;
};

function emptyDay(): MutableDay {
  return {
    sleepAsleepMin: 0,
    sleepInBedMin: 0,
    sleepAwakeMin: 0,
    sleepRemMin: 0,
    sleepDeepMin: 0,
    sleepCoreMin: 0,
    sleepEarliestStartMin: null,
    sleepLatestEndMin: null,
    hrvSum: 0,
    hrvN: 0,
    rhrSum: 0,
    rhrN: 0,
    respSum: 0,
    respN: 0,
    tempSum: 0,
    tempN: 0,
    activeEnergyKcalSum: 0,
  };
}

function mergeSleepWindow(b: MutableDay, segStart: Date, segEnd: Date): void {
  const smin = minutesFromMidnightLocal(segStart);
  const emax = minutesFromMidnightLocal(segEnd);
  if (b.sleepEarliestStartMin === null || smin < b.sleepEarliestStartMin) b.sleepEarliestStartMin = smin;
  if (b.sleepLatestEndMin === null || emax > b.sleepLatestEndMin) b.sleepLatestEndMin = emax;
}

/**
 * Merge sleep segments onto local wake days (endDate's calendar day).
 */
export function aggregateRecoverySamples(samples: MinimalHealthSample[], now: Date = getAppNow()): RecoveryDailyRow[] {
  const byDay = new Map<string, MutableDay>();
  const getB = (ymd: string) => {
    let b = byDay.get(ymd);
    if (!b) {
      b = emptyDay();
      byDay.set(ymd, b);
    }
    return b;
  };

  for (const s of samples) {
    const start = parseIso(s.startDate);
    const end = parseIso(s.endDate);
    if (!start || !end) continue;

    if (s.dataType === "sleep") {
      const state = (s.sleepState || "").toLowerCase();
      const dur =
        s.unit === "minute" && Number.isFinite(s.value)
          ? Math.max(0, s.value)
          : minutesBetween(start, end);
      const ymd = localYmd(end);
      const b = getB(ymd);
      if (state === "inbed") {
        b.sleepInBedMin += dur;
      } else if (state === "awake") {
        b.sleepAwakeMin += dur;
      } else if (state === "rem") {
        b.sleepRemMin += dur;
        b.sleepAsleepMin += dur;
        mergeSleepWindow(b, start, end);
      } else if (state === "deep") {
        b.sleepDeepMin += dur;
        b.sleepAsleepMin += dur;
        mergeSleepWindow(b, start, end);
      } else if (state === "light" || state === "core" || state === "asleep") {
        if (state === "core" || state === "light") b.sleepCoreMin += dur;
        b.sleepAsleepMin += dur;
        mergeSleepWindow(b, start, end);
      } else {
        b.sleepAsleepMin += dur;
        mergeSleepWindow(b, start, end);
      }
      continue;
    }

    if (s.dataType === "heartRateVariability" && s.unit === "millisecond") {
      const ymd = localYmd(start);
      const b = getB(ymd);
      b.hrvSum += s.value;
      b.hrvN += 1;
      continue;
    }

    if (s.dataType === "restingHeartRate" && s.unit === "bpm") {
      const ymd = localYmd(start);
      const b = getB(ymd);
      b.rhrSum += s.value;
      b.rhrN += 1;
      continue;
    }

    if (s.dataType === "respiratoryRate") {
      const ymd = localYmd(start);
      const b = getB(ymd);
      b.respSum += s.value;
      b.respN += 1;
      continue;
    }

    if ((s.dataType === "bodyTemperature" || s.dataType === "basalBodyTemperature") && s.unit === "celsius") {
      const ymd = localYmd(start);
      const b = getB(ymd);
      b.tempSum += s.value;
      b.tempN += 1;
      continue;
    }

    if (s.dataType === "activeEnergyBurned") {
      const ymd = localYmd(start);
      const b = getB(ymd);
      // Health bridges vary: accept kcal-ish units, ignore unknown units.
      const u = String(s.unit || "").toLowerCase();
      const isKcal = u.includes("kcal") || u.includes("kilocalorie") || u === "cal";
      if (isKcal && Number.isFinite(s.value) && s.value > 0) {
        b.activeEnergyKcalSum += s.value;
      }
    }
  }

  const cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  cutoff.setDate(cutoff.getDate() - 400);

  const rows: RecoveryDailyRow[] = [];
  for (const [ymd, b] of Array.from(byDay.entries())) {
    const d = parseIso(`${ymd}T12:00:00`);
    if (d && d < cutoff) continue;

    const asleep = b.sleepAsleepMin;
    const inBed = Math.max(b.sleepInBedMin, asleep + b.sleepAwakeMin);
    let sleepHours = asleep > 0 ? asleep / 60 : inBed > 0 ? inBed / 60 : undefined;
    const fragmentation = inBed > 5 ? Math.min(1, b.sleepAwakeMin / inBed) : undefined;
    const remDeepShare =
      asleep > 5 ? (b.sleepRemMin + b.sleepDeepMin) / Math.max(asleep, 1) : undefined;

    const row: RecoveryDailyRow = { date: ymd };
    if (sleepHours !== undefined) {
      row.sleepHours = Math.round(sleepHours * 100) / 100;
      if (sleepHours < 0.85 || sleepHours > 16) {
        row.signalMeta = mergeRecoverySignalMeta(row.signalMeta, {
          sleep: {
            confidenceWeight: 0.3,
            outlierFlag: true,
            reason: "sleep_duration_extreme",
          },
        });
      }
    }
    if (fragmentation !== undefined) row.sleepFragmentation = Math.round(fragmentation * 1000) / 1000;
    if (remDeepShare !== undefined) row.remDeepShare = Math.round(remDeepShare * 1000) / 1000;
    if (b.sleepAwakeMin > 0) row.nightWakeMinutes = Math.round(b.sleepAwakeMin * 10) / 10;
    if (b.sleepEarliestStartMin !== null && b.sleepLatestEndMin !== null) {
      row.sleepWindowStartMin = Math.round(b.sleepEarliestStartMin * 10) / 10;
      row.sleepWindowEndMin = Math.round(b.sleepLatestEndMin * 10) / 10;
    }
    if (b.hrvN > 0) row.hrvMs = Math.round((b.hrvSum / b.hrvN) * 10) / 10;
    if (b.rhrN > 0) row.restingHr = Math.round((b.rhrSum / b.rhrN) * 10) / 10;
    if (b.respN > 0) row.respiratoryBrpm = Math.round((b.respSum / b.respN) * 100) / 100;
    if (b.tempN > 0) row.wristTempReadingC = Math.round((b.tempSum / b.tempN) * 1000) / 1000;
    if (b.activeEnergyKcalSum > 0) row.activeEnergyKcal = Math.round(b.activeEnergyKcalSum);

    rows.push(row);
  }

  rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return rows;
}

export function mergeRecoveryDailyRows(existing: RecoveryDailyRow[], incoming: RecoveryDailyRow[]): RecoveryDailyRow[] {
  const m = new Map(existing.map((r) => [r.date, { ...r }]));
  for (const r of incoming) {
    const prev = m.get(r.date) || { date: r.date };
    m.set(r.date, {
      date: r.date,
      signalMeta: mergeRecoverySignalMeta(prev.signalMeta, r.signalMeta),
      sleepHours: r.sleepHours ?? prev.sleepHours,
      sleepFragmentation: r.sleepFragmentation ?? prev.sleepFragmentation,
      remDeepShare: r.remDeepShare ?? prev.remDeepShare,
      nightWakeMinutes: r.nightWakeMinutes ?? prev.nightWakeMinutes,
      sleepWindowStartMin: r.sleepWindowStartMin ?? prev.sleepWindowStartMin,
      sleepWindowEndMin: r.sleepWindowEndMin ?? prev.sleepWindowEndMin,
      sleepDebtHours: r.sleepDebtHours ?? prev.sleepDebtHours,
      activeEnergyKcal: r.activeEnergyKcal ?? prev.activeEnergyKcal,
      hrvMs: r.hrvMs ?? prev.hrvMs,
      restingHr: r.restingHr ?? prev.restingHr,
      respiratoryBrpm: r.respiratoryBrpm ?? prev.respiratoryBrpm,
      wristTempReadingC: r.wristTempReadingC ?? prev.wristTempReadingC,
      wristTempDeltaC: r.wristTempDeltaC ?? prev.wristTempDeltaC,
    });
  }
  return Array.from(m.values()).sort((a, b) => (a.date < b.date ? -1 : 1));
}
