/**
 * Streak from a set of completed local training days (YYYY-MM-DD).
 * Self-contained (no appSmartFeatures import — avoids circular dependency).
 */

function normalizeCalendarDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function formatLocalYmd(dayStart: Date): string {
  const x = normalizeCalendarDay(dayStart);
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, "0");
  const d = String(x.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Consecutive calendar days with at least one completion, walking backward from today.
 * If today has no completion, skip today (yesterday still counts).
 */
export function calculateStreak(completedDays: Set<string>, now: Date = new Date()): number {
  const todayStart = normalizeCalendarDay(now);
  let d = new Date(todayStart);
  let streak = 0;
  const max = 800;

  for (let i = 0; i < max; i += 1) {
    const ymd = formatLocalYmd(d);
    const isCalToday = normalizeCalendarDay(d).getTime() === todayStart.getTime();

    if (completedDays.has(ymd)) {
      streak += 1;
      d.setDate(d.getDate() - 1);
      continue;
    }

    if (isCalToday) {
      d.setDate(d.getDate() - 1);
      continue;
    }

    break;
  }

  return streak;
}
