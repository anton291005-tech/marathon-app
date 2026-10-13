import { Share } from "lucide-react";
import { ICON_STROKE } from "../../ui/icons";
import { formatKmDe } from "../../ui/formatDe";

type PlanProgressCardProps = {
  doneSessions: number;
  totalSessions: number;
  /** „Woche 1 von 8"; leer vor Planstart und nach Planende. */
  weekLabel?: string | null;
  totalWeeks: number;
  /** Index der laufenden Woche; -1 vor Planstart, `totalWeeks` nach Planende. */
  currentWeekIndex: number;
  /** Phasen in Planreihenfolge mit ihrer Wochenzahl (Breite des Labels unter den Segmenten). */
  phases: { key: string; label: string; weeks: number; current: boolean }[];
};

/** Fortschrittskarte der Übersicht: Einheiten als Hauptzahl, ein Segment je Planwoche, Phasen darunter. */
export function PlanProgressCard({
  doneSessions,
  totalSessions,
  weekLabel,
  totalWeeks,
  currentWeekIndex,
  phases,
  ...rest
}: PlanProgressCardProps & { "data-tour"?: string }) {
  const columns = { gridTemplateColumns: `repeat(${Math.max(1, totalWeeks)}, minmax(0, 1fr))` };
  return (
    <section className="mr-card" {...rest}>
      <div className="mr-week-summary__top">
        <div className="mr-km">
          <span className="mr-km__value">{doneSessions}</span>
          <span className="mr-unit">/ {totalSessions} Einheiten</span>
        </div>
        {weekLabel ? <span className="mr-week-summary__done">{weekLabel}</span> : null}
      </div>
      <div className="mr-segments" style={columns} aria-hidden>
        {Array.from({ length: totalWeeks }, (_, i) => (
          <div key={i} className={i <= currentWeekIndex ? "mr-segments__seg is-reached" : "mr-segments__seg"} />
        ))}
      </div>
      <div className="mr-segments mr-segments--labels" style={columns}>
        {phases.map((phase) => (
          <span key={phase.key} className={phase.current ? "is-current" : undefined} style={{ gridColumn: `span ${phase.weeks}` }}>
            {phase.label}
          </span>
        ))}
      </div>
    </section>
  );
}

type PlanTilesProps = { longestRunKm: number; longRuns: number; qualitySessions: number };

/** Drei Nebenwerte des Plans, direkt auf dem Screen. */
export function PlanTiles({ longestRunKm, longRuns, qualitySessions }: PlanTilesProps) {
  return (
    <div className="mr-tiles">
      <div className="mr-tile mr-tile--plain">
        <span className="mr-label">Längster Lauf</span>
        <span className="mr-tile__value">
          {formatKmDe(longestRunKm, { trimZero: true })}
          <small className="mr-tile__unit"> km</small>
        </span>
      </div>
      <div className="mr-tile mr-tile--plain">
        <span className="mr-label">Lange Läufe</span>
        <span className="mr-tile__value">{longRuns}</span>
      </div>
      <div className="mr-tile mr-tile--plain">
        <span className="mr-label">Qualität</span>
        <span className="mr-tile__value">{qualitySessions}</span>
      </div>
    </div>
  );
}

/** Schlanke Zeile „Fortschritt teilen": kopiert die Zusammenfassung als Text. */
export function ShareRow({ feedback, onCopy }: { feedback?: string | null; onCopy: () => void }) {
  return (
    <section className="mr-card mr-share">
      <Share aria-hidden size={20} strokeWidth={ICON_STROKE} />
      <div className="mr-row__text">
        <div className="mr-row__title" style={{ fontWeight: 600 }}>
          Fortschritt teilen
        </div>
        <div className="mr-row__sub" role="status">
          {feedback || "Kurze Zusammenfassung als Text"}
        </div>
      </div>
      <button type="button" className="mr-btn mr-btn--secondary mr-btn--small" onClick={onCopy}>
        Kopieren
      </button>
    </section>
  );
}
