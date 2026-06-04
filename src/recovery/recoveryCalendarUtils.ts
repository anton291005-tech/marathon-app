/** Pure date helpers for recovery (local calendar, no UI). */

export function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseYmd(s: string): Date | null {
  const [yy, mm, dd] = s.split("-").map(Number);
  if (!yy || !mm || !dd) return null;
  return new Date(yy, mm - 1, dd);
}

export function daysBetweenInclusive(a: Date, b: Date): string[] {
  const out: string[] = [];
  const cur = new Date(a.getFullYear(), a.getMonth(), a.getDate());
  const end = new Date(b.getFullYear(), b.getMonth(), b.getDate());
  while (cur.getTime() <= end.getTime()) {
    out.push(ymd(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

export function last7CalendarDays(now: Date): string[] {
  const out: string[] = [];
  const t0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  for (let i = 6; i >= 0; i--) {
    const d = new Date(t0);
    d.setDate(t0.getDate() - i);
    out.push(ymd(d));
  }
  return out;
}
