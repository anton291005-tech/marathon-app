import type { PrepRecapStats } from "../../prepRecap/buildPrepRecapSnapshot";
import type { PrepRecapRecord } from "../../prepRecap/prepRecapRecord";

/** Warschau-ähnlicher Snapshot mit allen Blöcken (Testdaten, keine Produktionswerte). */
export function fullRecapStats(overrides: Partial<PrepRecapStats> = {}): PrepRecapStats {
  return {
    schemaVersion: 1,
    race: {
      name: "Warschau Marathon",
      ymd: "2026-09-27",
      distanceKm: 42.195,
      goalSeconds: 10190,
      completedBy: "race_done",
    },
    weeks: { count: 18, firstYmd: "2026-05-25" },
    volume: { actualKm: 1284.3, plannedKm: 1350, ratio: 0.951, marathonEquivalents: 30.4 },
    sessions: { done: 86, planned: 94, skipped: 5 },
    streak: { longestDays: 23 },
    longRuns: { done: 14, total: 16, longestKm: 32.4 },
    quality: { done: 22, total: 25 },
    strongestWeek: { weekNumber: 13, km: 96.4 },
    phases: [
      { phase: "base", km: 312, weeks: 5 },
      { phase: "build", km: 468.2, weeks: 6 },
      { phase: "peak", km: 330, weeks: 4 },
      { phase: "taper", km: 174.1, weeks: 3 },
    ],
    body: {
      sleep: { firstAvgHours: 7.1, lastAvgHours: 7.4 },
      hrv: { firstAvgMs: 52, lastAvgMs: 58 },
    },
    ...overrides,
  };
}

/** Snapshot ohne jede erledigte Einheit — alle optionalen Blöcke null. */
export function emptyRecapStats(overrides: Partial<PrepRecapStats> = {}): PrepRecapStats {
  return fullRecapStats({
    weeks: null,
    volume: null,
    sessions: null,
    streak: null,
    longRuns: null,
    quality: null,
    strongestWeek: null,
    phases: null,
    body: null,
    ...overrides,
  });
}

export function recapRecord(overrides: Partial<PrepRecapRecord> = {}): PrepRecapRecord {
  return {
    id: "rec-1",
    planId: "plan-1",
    raceName: "Warschau Marathon",
    raceDate: "2026-09-27",
    finishTimeSeconds: 11637,
    finishTimeSource: "health",
    finishTimeConfirmed: false,
    schemaVersion: 1,
    stats: fullRecapStats(),
    ...overrides,
  };
}

/** jsdom kennt keine PointerEvents — Minimal-Polyfill, damit clientX/clientY in Tests ankommen. */
export function installPointerEventPolyfill(): () => void {
  const win = window as unknown as { PointerEvent?: unknown };
  const original = win.PointerEvent;
  class TestPointerEvent extends MouseEvent {
    pointerId: number;
    constructor(type: string, init: MouseEventInit & { pointerId?: number } = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 1;
    }
  }
  win.PointerEvent = TestPointerEvent;
  return () => {
    win.PointerEvent = original;
  };
}
