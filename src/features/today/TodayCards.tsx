import type { ReactNode } from "react";
import { Check, ChevronDown, ChevronUp, Flame, HeartPulse } from "lucide-react";
import { ICON_SIZE_S, ICON_STROKE } from "../../ui/icons";
import { StatusChip, type StatusChipTone } from "../../ui/StatusChip";
import { clampScore100, formatKmDe } from "../../ui/formatDe";

export type TodayHeroSession = {
  title: string;
  /** Geplante Distanz; `null` bei Einheiten ohne Distanz (Kraft, Rad nach Zeit). */
  distanceKm: number | null;
  /** „Zone 2 · 120–150 bpm" */
  hrFact: string;
  /** Ein Satz zur Ausführung (Plan-Beschreibung). */
  hint: string;
};

type TodayHeroProps = {
  /** „Lauf · Woche 1 von 8" */
  label: string;
  /** `null` = Ruhetag bzw. keine Einheit: kein Erledigt/Auslassen. */
  session: TodayHeroSession | null;
  /** Satz unter „Ruhetag". */
  restReason: string;
  status: "open" | "done" | "skipped";
  /** Zustand neben dem Label („Erledigt", „Plan startet am …"). */
  chip?: { tone: StatusChipTone; text: string } | null;
  /** false, wenn „Erledigt" nur aus einem zugeordneten Health-Lauf stammt (kein Rückgängig möglich). */
  canToggleDone?: boolean;
  onToggleDone: () => void;
  onToggleSkip: () => void;
  onOpenDetails: () => void;
};

/** Hauptkarte des Heute-Screens (docs/design-system/components.md, „TodayHero"). */
export function TodayHero({
  label,
  session,
  restReason,
  status,
  chip,
  canToggleDone = true,
  onToggleDone,
  onToggleSkip,
  onOpenDetails,
  ...rest
}: TodayHeroProps & { "data-tour"?: string }) {
  const top = (
    <div className="mr-hero__top">
      <span className="mr-label">{label}</span>
      {chip ? <StatusChip tone={chip.tone}>{chip.text}</StatusChip> : null}
    </div>
  );

  if (!session) {
    return (
      <section className="mr-hero" {...rest}>
        {top}
        <div className="mr-hero__title mr-hero__title--lead">Ruhetag</div>
        <p className="mr-hero__reason">{restReason}</p>
      </section>
    );
  }

  const hasDistance = session.distanceKm != null && session.distanceKm > 0;
  const showDone = status !== "skipped" && canToggleDone;
  const showSkip = status !== "done";

  return (
    <section className="mr-hero" {...rest}>
      <button type="button" className="mr-hero__open" onClick={onOpenDetails} aria-label={`Details zu ${session.title} öffnen`}>
        {top}
        {hasDistance ? (
          <div className="mr-hero__distance">
            <span className="mr-hero__km">{formatKmDe(session.distanceKm as number)}</span>
            <span className="mr-unit">km</span>
          </div>
        ) : null}
        <div className={hasDistance ? "mr-hero__title" : "mr-hero__title mr-hero__title--lead"}>{session.title}</div>
        {session.hrFact || session.hint ? (
          <div className="mr-hero__facts">
            {session.hrFact ? (
              <div className="mr-hero__fact">
                <HeartPulse aria-hidden size={ICON_SIZE_S} strokeWidth={ICON_STROKE} />
                <span>{session.hrFact}</span>
              </div>
            ) : null}
            {session.hint ? (
              <div className="mr-hero__fact">
                <Flame aria-hidden size={ICON_SIZE_S} strokeWidth={ICON_STROKE} />
                <span>{session.hint}</span>
              </div>
            ) : null}
          </div>
        ) : null}
      </button>
      {showDone || showSkip ? (
        <div className={showDone && showSkip ? "mr-hero__actions" : "mr-hero__actions mr-hero__actions--single"}>
          {showDone ? (
            <button
              type="button"
              className={`mr-btn ${status === "done" ? "mr-btn--secondary" : "mr-btn--primary"}`}
              onClick={onToggleDone}
              aria-label={status === "done" ? "Erledigt-Markierung rückgängig machen" : undefined}
            >
              {status === "done" ? (
                "Rückgängig"
              ) : (
                <>
                  <Check aria-hidden size={18} strokeWidth={2} />
                  Erledigt
                </>
              )}
            </button>
          ) : null}
          {showSkip ? (
            <button
              type="button"
              className="mr-btn mr-btn--secondary"
              onClick={onToggleSkip}
              aria-label={status === "skipped" ? "Übersprungen-Markierung rückgängig machen" : undefined}
            >
              {status === "skipped" ? "Rückgängig" : "Auslassen"}
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

type MeterProps = {
  label: string;
  /** 0–100; `null` = keine Daten. */
  score: number | null;
  loading?: boolean;
  /** Balkenfarbe folgt dem Status; ohne Status Markenrot (Fortschritt). */
  tone?: "good" | "fair" | "low";
  /** Ein Satz, was fehlt, wenn kein Wert da ist. */
  emptyNote?: string;
  onClick: () => void;
};

function Meter({ label, score, loading = false, tone, emptyNote, onClick }: MeterProps) {
  const value = clampScore100(score);
  return (
    <button type="button" className="mr-meter" onClick={onClick}>
      <div className="mr-meter__row">
        <span className="mr-meter__label">{label}</span>
        {loading && value == null ? (
          <span className="mr-skeleton" style={{ width: 56, height: 16 }} />
        ) : value == null ? (
          <span className="mr-meter__value mr-meter__value--empty">—</span>
        ) : (
          <span className="mr-meter__value">
            {value}
            <small> / 100</small>
          </span>
        )}
      </div>
      <div className="mr-progress">
        <div className={tone ? `mr-progress__bar mr-progress__bar--${tone}` : "mr-progress__bar"} style={{ width: `${value ?? 0}%` }} />
      </div>
      {value == null && !loading && emptyNote ? <p className="mr-caption" style={{ marginTop: 8 }}>{emptyNote}</p> : null}
    </button>
  );
}

type PrepCardProps = {
  doneSessions: number;
  totalSessions: number;
  adherenceScore: number | null;
  recoveryScore: number | null;
  recoveryLoading?: boolean;
  recoveryTone?: "good" | "fair" | "low";
  /** Ein Satz unter den Balken (Prognose bzw. was dafür fehlt). */
  note?: string | null;
  onOpenAdherence: () => void;
  onOpenRecovery: () => void;
  expanded: boolean;
  onToggleExpanded: () => void;
  moreLabel: string;
  /** Aufgeklappte Einordnung (Coach-Satz, Detailzeilen). */
  children?: ReactNode;
};

/** Karte „Vorbereitung": Umsetzung und Erholung als Balken statt Ring. */
export function PrepCard({
  doneSessions,
  totalSessions,
  adherenceScore,
  recoveryScore,
  recoveryLoading,
  recoveryTone,
  note,
  onOpenAdherence,
  onOpenRecovery,
  expanded,
  onToggleExpanded,
  moreLabel,
  children,
  ...rest
}: PrepCardProps & { "data-tour"?: string }) {
  return (
    <section className="mr-card" {...rest}>
      <div className="mr-card__head">
        <h2 className="mr-card__title">Vorbereitung</h2>
        <span className="mr-card__meta">
          {doneSessions} von {totalSessions} Einheiten
        </span>
      </div>
      <div className="mr-meter-list">
        <Meter label="Plan & Umsetzung" score={adherenceScore} onClick={onOpenAdherence} />
        <Meter
          label="Erholung"
          score={recoveryScore}
          loading={recoveryLoading}
          tone={recoveryTone}
          emptyNote="Noch keine Erholungsdaten verfügbar."
          onClick={onOpenRecovery}
        />
      </div>
      {note ? <p className="mr-card__note">{note}</p> : null}
      {expanded && children ? <div className="mr-card__detail">{children}</div> : null}
      <button type="button" className="mr-card__more" onClick={onToggleExpanded} aria-expanded={expanded}>
        {expanded ? "Weniger anzeigen" : moreLabel}
        {expanded ? (
          <ChevronUp aria-hidden size={ICON_SIZE_S} strokeWidth={ICON_STROKE} />
        ) : (
          <ChevronDown aria-hidden size={ICON_SIZE_S} strokeWidth={ICON_STROKE} />
        )}
      </button>
    </section>
  );
}

type ProgressCardProps = {
  /** Laufende Planwoche; `null`, wenn heute in keiner Planwoche liegt (dann nur die Kacheln). */
  week: { rangeLabel: string; actualKm: number; plannedKm: number } | null;
  longRuns: { done: number; total: number };
  quality: { done: number; total: number };
  streakDays: number;
};

/** Karte „Diese Woche": Wochen-km mit Balken, darunter drei Nebenwerte. */
export function WeekProgressCard({ week, longRuns, quality, streakDays }: ProgressCardProps) {
  const pct = week && week.plannedKm > 0 ? Math.max(0, Math.min(100, (week.actualKm / week.plannedKm) * 100)) : 0;
  return (
    <section className="mr-card">
      <div className="mr-card__head" style={{ marginBottom: 12 }}>
        <h2 className="mr-card__title">{week ? "Diese Woche" : "Fortschritt"}</h2>
        {week ? <span className="mr-card__meta">{week.rangeLabel}</span> : null}
      </div>
      {week ? (
        <>
          <div className="mr-km">
            <span className="mr-km__value">{formatKmDe(week.actualKm)}</span>
            <span className="mr-unit">/ {formatKmDe(week.plannedKm, { trimZero: true })} km</span>
          </div>
          <div className="mr-progress" style={{ margin: "12px 0 16px" }}>
            <div className="mr-progress__bar" style={{ width: `${pct}%` }} />
          </div>
        </>
      ) : null}
      <div className="mr-tiles">
        <div className="mr-tile">
          <span className="mr-label">Lange Läufe</span>
          <span className="mr-tile__value">
            {longRuns.done}
            <small> / {longRuns.total}</small>
          </span>
        </div>
        <div className="mr-tile">
          <span className="mr-label">Qualität</span>
          <span className="mr-tile__value">
            {quality.done}
            <small> / {quality.total}</small>
          </span>
        </div>
        <div className="mr-tile">
          <span className="mr-label">Serie</span>
          <span className="mr-tile__value">
            {streakDays}
            <small> {streakDays === 1 ? "Tag" : "Tage"}</small>
          </span>
        </div>
      </div>
    </section>
  );
}
