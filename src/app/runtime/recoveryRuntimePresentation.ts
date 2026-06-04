/**
 * Pure presentation helpers lifted from `useRecoveryDomainRuntime` without changing call sites —
 * avoids hidden behavior drift when editing effect logic elsewhere.
 */

export function formatRecoverySevenDayWindowYmds(todayYmd: string, nowFallback: Date): readonly string[] {
  const out: string[] = [];
  const [yy, mm, dd] = String(todayYmd || "").split("-").map((x) => Number.parseInt(x, 10));
  const base =
    Number.isFinite(yy) && Number.isFinite(mm) && Number.isFinite(dd)
      ? new Date(yy, mm - 1, dd)
      : nowFallback;
  const t0 = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  for (let i = 6; i >= 0; i -= 1) {
    const x = new Date(t0);
    x.setDate(t0.getDate() - i);
    const y = x.getFullYear();
    const m = String(x.getMonth() + 1).padStart(2, "0");
    const d = String(x.getDate()).padStart(2, "0");
    out.push(`${y}-${m}-${d}`);
  }
  return out;
}

export function meanFiniteNumbers(nums: unknown): number | null {
  const v = ((nums as unknown[]) || []).filter((n): n is number => typeof n === "number" && Number.isFinite(n));
  if (!v.length) return null;
  return v.reduce((a, b) => a + b, 0) / v.length;
}

export function formatSleepHoursAvg(h: unknown): string | null {
  if (typeof h !== "number" || !Number.isFinite(h) || h <= 0) return null;
  const totalMin = Math.round(h * 60);
  const hh = Math.floor(totalMin / 60);
  const mm = totalMin % 60;
  if (hh <= 0) return `${mm}m`;
  return mm > 0 ? `${hh}h ${mm}m` : `${hh}h`;
}

export function interpret7dTrainingLoad(totalLoad: number, daysWithLoad: number): string {
  if (!Number.isFinite(totalLoad) || totalLoad <= 0 || daysWithLoad <= 0) {
    return "Keine Trainingsdaten in den letzten 7 Tagen";
  }
  if (totalLoad >= 95 || daysWithLoad >= 6) {
    return "Deutlich erhöhte Trainingsbelastung durch sehr regelmäßige Einheiten";
  }
  if (totalLoad >= 60 || daysWithLoad >= 4) {
    return "Moderat erhöhte Trainingsbelastung durch regelmäßige Einheiten";
  }
  if (totalLoad >= 28 || daysWithLoad >= 2) {
    return "Moderate Trainingsbelastung mit ausreichenden Erholungstagen";
  }
  return "Geringe Trainingsbelastung in den letzten 7 Tagen";
}
