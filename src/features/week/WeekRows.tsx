import type { KeyboardEvent, ReactNode } from "react";
import { CalendarDays, Check, ChevronRight } from "lucide-react";
import { ICON_SIZE_S, ICON_STROKE, SessionTypeIcon } from "../../ui/icons";
import { formatKmDe } from "../../ui/formatDe";

type WeekSummaryCardProps = {
  actualKm: number;
  plannedKm: number;
  doneSessions: number;
  plannedSessions: number;
  /** Schlanke Zeile „Mit meinem Kalender abgleichen"; ohne Handler keine Zeile. */
  onSyncCalendar?: () => void;
};

/** Kopfkarte der Woche: Ist/Soll-km mit Balken und der Kalenderabgleich als Zeile. */
export function WeekSummaryCard({
  actualKm,
  plannedKm,
  doneSessions,
  plannedSessions,
  onSyncCalendar,
  ...rest
}: WeekSummaryCardProps & { "data-tour"?: string }) {
  const pct = plannedKm > 0 ? Math.max(0, Math.min(100, (actualKm / plannedKm) * 100)) : 0;
  return (
    <section className={onSyncCalendar ? "mr-card mr-week-summary mr-week-summary--action" : "mr-card mr-week-summary"} {...rest}>
      <div className="mr-week-summary__top">
        <div className="mr-km">
          <span className="mr-km__value">{formatKmDe(actualKm)}</span>
          <span className="mr-unit">/ {formatKmDe(plannedKm, { trimZero: true })} km</span>
        </div>
        <span className="mr-week-summary__done">
          {doneSessions} von {plannedSessions} erledigt
        </span>
      </div>
      <div className="mr-progress">
        <div className="mr-progress__bar" style={{ width: `${pct}%` }} />
      </div>
      {onSyncCalendar ? (
        <button type="button" className="mr-week-action" onClick={onSyncCalendar}>
          <CalendarDays aria-hidden size={18} strokeWidth={ICON_STROKE} />
          <span>Mit meinem Kalender abgleichen</span>
          <ChevronRight aria-hidden size={ICON_SIZE_S} strokeWidth={ICON_STROKE} />
        </button>
      ) : null}
    </section>
  );
}

type WeekDayRowProps = {
  /** „Mo" */
  dayLabel: string;
  /** Tag des Monats; `null`, wenn das Datum nicht lesbar ist. */
  dayNumber: number | null;
  type: string;
  title: string;
  subtitle?: string | null;
  /** Geplante Distanz rechts; entfällt bei erledigten Einheiten (dort steht das Häkchen). */
  distanceKm?: number | null;
  state?: "open" | "done" | "skipped";
  isToday?: boolean;
  /** Öffnet die Einheit; ohne Handler ist die Zeile nicht bedienbar (Ruhetag). */
  onOpen?: () => void;
};

/** Eine Tageszeile: Wochentag + Datum, Sport-Icon, Titel, rechts km oder Erledigt-Häkchen. */
export function WeekDayRow({
  dayLabel,
  dayNumber,
  type,
  title,
  subtitle,
  distanceKm,
  state = "open",
  isToday = false,
  onOpen,
}: WeekDayRowProps) {
  const isRest = type === "rest";
  const className = [
    "mr-week-row",
    isRest ? "mr-week-row--rest" : "mr-week-row--session",
    isToday ? "is-today" : "",
    state !== "open" ? "is-settled" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const interactive = onOpen
    ? {
        role: "button",
        tabIndex: 0,
        onClick: onOpen,
        onKeyDown: (e: KeyboardEvent<HTMLDivElement>) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onOpen();
          }
        },
      }
    : {};
  return (
    <div className={className} data-layout-week-card="1" {...interactive}>
      <div className="mr-week-row__day">
        <div className="mr-week-row__dow">{dayLabel}</div>
        {dayNumber != null ? <div className="mr-week-row__date">{dayNumber}</div> : null}
      </div>
      <span className="mr-week-row__icon">
        <SessionTypeIcon type={type} size={20} />
      </span>
      <div className="mr-week-row__text">
        <div className="mr-week-row__title">{title}</div>
        {subtitle ? <div className="mr-week-row__sub">{subtitle}</div> : null}
      </div>
      {state === "done" ? (
        <span role="img" aria-label="Erledigt" className="mr-week-row__badge">
          <Check aria-hidden size={14} strokeWidth={2.25} />
        </span>
      ) : distanceKm != null && distanceKm > 0 ? (
        <span className="mr-week-row__km">
          {formatKmDe(distanceKm)}
          <small> km</small>
        </span>
      ) : null}
    </div>
  );
}

/** Platzhalter für Tage vor dem Planstart (erste Woche beginnt mitten in der Woche). */
export function WeekPlaceholderRow({ dayLabel, children }: { dayLabel: string; children: ReactNode }) {
  return (
    <div className="mr-week-row mr-week-row--rest">
      <div className="mr-week-row__day">
        <div className="mr-week-row__dow">{dayLabel}</div>
      </div>
      <span className="mr-week-row__icon" style={{ width: 20 }} />
      <div className="mr-week-row__text">
        <div className="mr-week-row__title">{children}</div>
      </div>
    </div>
  );
}
