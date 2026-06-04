import type { SessionLog } from "../marathonPrediction";
import type { RecoveryDailyRow } from "./recoveryTypes";
import { mergeRecoveryDailyRows } from "./aggregateRecoverySamples";

export const RECOVERY_DAILY_STORAGE_KEY = "recoveryHealthDaily";
export const RECOVERY_HAS_EVER_KPI_KEY = "marathonRecoveryHasEverKpi";
export const RECOVERY_HOME_SCORE_BY_DAY_KEY = "marathonRecoveryHomeScoreByDay";
/** Nach erstem Live-Recovery-KPI: harte Gates aktiv (localStorage `"1"`). */
export const RECOVERY_BOOT_PHASE_COMPLETE_KEY = "marathonRecoveryBootPhaseComplete";

/** Persistiert nur die jüngsten Einträge — begrenzt Drift / Map-Wachstum. */
export const RECOVERY_HOME_SCORE_MAX_DAYS = 14;

export function trimRecoveryHomeScoreDayMap(
  map: Record<string, number>,
  maxDays: number = RECOVERY_HOME_SCORE_MAX_DAYS,
): Record<string, number> {
  return Object.fromEntries(
    Object.entries(map)
      .sort(([a], [b]) => b.localeCompare(a))
      .slice(0, maxDays),
  );
}

export function readRecoveryHasEverKpiFromStorage(readItem: (key: string) => string | null): boolean {
  return readItem(RECOVERY_HAS_EVER_KPI_KEY) === "1";
}

export function readRecoveryBootPhaseComplete(readItem: (key: string) => string | null): boolean {
  return readItem(RECOVERY_BOOT_PHASE_COMPLETE_KEY) === "1";
}

export function writeRecoveryBootPhaseComplete(writeItem: (key: string, value: string) => void): void {
  writeItem(RECOVERY_BOOT_PHASE_COMPLETE_KEY, "1");
}

export function writeRecoveryHasEverKpiToStorage(writeItem: (key: string, value: string) => void): void {
  writeItem(RECOVERY_HAS_EVER_KPI_KEY, "1");
}

export function readRecoveryHomeScoreDayMap(
  readItem: (key: string) => string | null,
  safeParseJSON: (v: string, fb: unknown) => unknown,
): Record<string, number> {
  const raw = readItem(RECOVERY_HOME_SCORE_BY_DAY_KEY);
  const p = safeParseJSON(raw || "null", {});
  if (!p || typeof p !== "object") return {};
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(p as Record<string, unknown>)) {
    if (typeof v === "number" && Number.isFinite(v)) {
      out[k] = Math.round(Math.max(0, Math.min(100, v)));
    }
  }
  return trimRecoveryHomeScoreDayMap(out, RECOVERY_HOME_SCORE_MAX_DAYS);
}

export function upsertRecoveryHomeScoreForDay(args: {
  readItem: (key: string) => string | null;
  writeItem: (key: string, value: string) => void;
  safeParseJSON: (v: string, fb: unknown) => unknown;
  ymd: string;
  score: number;
}): void {
  const map = readRecoveryHomeScoreDayMap(args.readItem, args.safeParseJSON);
  map[args.ymd] = Math.round(Math.max(0, Math.min(100, args.score)));
  const trimmed = trimRecoveryHomeScoreDayMap(map, RECOVERY_HOME_SCORE_MAX_DAYS);
  args.writeItem(RECOVERY_HOME_SCORE_BY_DAY_KEY, JSON.stringify(trimmed));
}

/** Volle Map ersetzen (z. B. Migration) — immer getrimmt persistieren. */
export function persistRecoveryHomeScoreDayMap(args: {
  map: Record<string, number>;
  writeItem: (key: string, value: string) => void;
}): void {
  const trimmed = trimRecoveryHomeScoreDayMap(args.map, RECOVERY_HOME_SCORE_MAX_DAYS);
  args.writeItem(RECOVERY_HOME_SCORE_BY_DAY_KEY, JSON.stringify(trimmed));
}

/** Kalendertag ± `deltaDays` im Format YYYY-MM-DD (lokale Semantik des übergebenen `ymd`). */
export function addCalendarDaysYmd(ymd: string, deltaDays: number): string {
  const [y, m, d] = ymd.split("-").map((x) => parseInt(x, 10));
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + deltaDays);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

export function recoveryTrendVsYesterdayLine(args: {
  todayYmd: string;
  todayScore: number | null;
  isInsufficient: boolean;
  readItem: (key: string) => string | null;
  safeParseJSON: (v: string, fb: unknown) => unknown;
}): string | null {
  if (args.isInsufficient || args.todayScore == null) return null;
  const yPrev = addCalendarDaysYmd(args.todayYmd, -1);
  const map = readRecoveryHomeScoreDayMap(args.readItem, args.safeParseJSON);
  const prev = map[yPrev];
  if (prev == null || !Number.isFinite(prev)) return null;
  const d = args.todayScore - prev;
  if (d === 0) return "±0 vs. gestern";
  return `${d > 0 ? "+" : ""}${d} vs. gestern`;
}

/** Stabiler „Version“-String für Trainingslogs — gleiche Daten → gleiche Berechnung. */
export function recoveryWorkoutsVersionFingerprint(logs: Record<string, SessionLog>): string {
  const keys = Object.keys(logs || {}).sort();
  const parts: string[] = [];
  for (const k of keys) {
    const L = logs[k];
    if (!L) continue;
    parts.push(
      [
        k,
        L.at ?? "",
        L.done ? "1" : "0",
        L.skipped ? "1" : "0",
        L.actualKm ?? "",
        L.assignedRun?.runId ?? "",
        String(L.feeling ?? ""),
      ].join("\t"),
    );
  }
  return parts.join("\n");
}

/** Stabiler „Version“-String für Health-basierte Recovery-Tageszeilen. */
export function recoveryHealthVersionFingerprint(rows: RecoveryDailyRow[]): string {
  return `${rows.length}|${rows.map((r) => `${r.date}:${r.sleepHours ?? ""}:${r.hrvMs ?? ""}:${r.restingHr ?? ""}:${r.sleepDebtHours ?? ""}`).join(";")}`;
}

/** Monoton zusammengesetzte Snapshot-Version (Logs + Health + Plan). */
export function recoverySnapshotVersionHash(args: {
  workoutsFingerprint: string;
  healthFingerprint: string;
  planFingerprint: string;
}): string {
  return `${args.workoutsFingerprint}\n---\n${args.healthFingerprint}\n---\n${args.planFingerprint}`;
}

/** Mittelwert der gespeicherten Scores für die letzten `maxDays` Kalendertage vor `todayYmd` (nur vorhandene Tage). */
export function recoveryRecentDaysAverageFromMap(
  map: Record<string, number>,
  todayYmd: string,
  maxDays: number,
): number | null {
  const vals: number[] = [];
  for (let i = 1; i <= maxDays; i++) {
    const k = addCalendarDaysYmd(todayYmd, -i);
    const s = map[k];
    if (s != null && Number.isFinite(s)) vals.push(s);
  }
  if (vals.length === 0) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

/** Trend: bei ≥3 Vortagen mit Daten Ø der letzten 3 Tage, sonst Differenz zu gestern. */
export function recoveryTrendLinePreferred(args: {
  todayYmd: string;
  todayScore: number | null;
  isInsufficient: boolean;
  readItem: (key: string) => string | null;
  safeParseJSON: (v: string, fb: unknown) => unknown;
}): string | null {
  if (args.isInsufficient || args.todayScore == null) return null;
  const map = readRecoveryHomeScoreDayMap(args.readItem, args.safeParseJSON);
  let availableDays = 0;
  for (let i = 1; i <= 3; i++) {
    const k = addCalendarDaysYmd(args.todayYmd, -i);
    const s = map[k];
    if (s != null && Number.isFinite(s)) availableDays += 1;
  }
  if (availableDays >= 3) {
    const avg = recoveryRecentDaysAverageFromMap(map, args.todayYmd, 3);
    if (avg != null && Number.isFinite(avg)) {
      const d = Math.round(args.todayScore - avg);
      if (d === 0) return "±0 vs. Ø letzte Tage";
      return `${d > 0 ? "+" : ""}${d} vs. Ø letzte Tage`;
    }
  }
  return recoveryTrendVsYesterdayLine({
    todayYmd: args.todayYmd,
    todayScore: args.todayScore,
    isInsufficient: args.isInsufficient,
    readItem: args.readItem,
    safeParseJSON: args.safeParseJSON,
  });
}

export function loadRecoveryDailyFromStorage(
  readItem: (key: string) => string | null,
  safeParseJSON: (v: string, fb: unknown) => unknown,
): RecoveryDailyRow[] {
  const raw = readItem(RECOVERY_DAILY_STORAGE_KEY);
  const parsed = safeParseJSON(raw || "null", []);
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((r) => r && typeof r.date === "string") as RecoveryDailyRow[];
}

export function mergeRecoveryDailyPersisted(existing: RecoveryDailyRow[], incoming: RecoveryDailyRow[]): RecoveryDailyRow[] {
  return mergeRecoveryDailyRows(existing, incoming);
}
