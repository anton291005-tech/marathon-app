/**
 * Hilfen für Tests: Kurzformen für Snapshots und lesbare Verstöße. Die Prüfregeln selbst stehen in `../invariants.ts`.
 * Liegt unter `__fixtures__`, weil Jest jede Datei unter `__tests__` als Testdatei behandelt.
 */

import { diffDays } from "../dates";
import type { Violation } from "../invariants";
import type { WeekLayout } from "../placement";
import type { SessionPlan } from "../planSessions";
import type { CoreSession, Segment } from "../sessions";

/** Verstöße als kurze Zeichenketten, z. B. "error I9/share W5 2027-02-21". */
export function codesOf(violations: Violation[]): string[] {
  return violations.map((v) => `${v.severity} ${v.code}/${v.rule}${v.wn !== undefined ? ` W${v.wn}` : ""}${v.ymd !== undefined ? ` ${v.ymd}` : ""}`);
}

/** Alles außer begründeten Abweichungen (Hinweis-Regeln). */
export function unreasoned(violations: Violation[]): Violation[] {
  return violations.filter((v) => !v.reasoned);
}

/** Kompakte Darstellung einer Wochenform, z. B. "Mo REC · Di Q2 · Mi MLR · Do – · Fr Q1 · Sa E · So LR". */
export function compactWeek(layout: WeekLayout): string {
  return layout.days.map((day) => `${day.weekday} ${day.slot === "REST" ? "–" : day.slot}`).join(" · ");
}

const workOf = (session: CoreSession): Segment | undefined => session.segments.filter((s) => s.type === "steady" || s.type === "reps")[0];

/** Kurzform einer Woche für Snapshots: "Mo E 9.2 · Di T 8.7[3x1.6] · …". */
export function compactSessions(plan: SessionPlan, wn: number): string {
  const week = plan.weeks.filter((w) => w.wn === wn)[0];
  return week.sessions
    .map((s) => {
      const weekday = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"][(diffDays(s.ymd, week.startYmd) + 7) % 7];
      if (s.kind === "REST") return `${weekday} –`;
      const w = workOf(s);
      let detail = "";
      if (w !== undefined && w.type === "reps") detail = `[${w.reps}x${w.repKm}]`;
      if (w !== undefined && w.type === "steady") detail = `[${w.km}${w.minutes !== undefined ? `/${w.minutes}min` : ""}]`;
      const strides = s.segments.some((x) => x.type === "strides") ? "+S" : "";
      return `${weekday} ${s.kind}${s.racePace ? "(RP)" : ""} ${s.km}${detail}${strides}`;
    })
    .join(" · ");
}
