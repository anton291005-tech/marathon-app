import {
  finishTimeSourceNote,
  formatFinishTime,
  formatRaceDateDe,
  formatRacePace,
  goalReachedLine,
  type RaceFinishDisplay,
} from "../../prepRecap/raceResultPresentation";
import { formatGoalLabel } from "../../prepRecap/prepCompletionState";

type Props = {
  raceName: string | null;
  raceYmd: string;
  goalSeconds: number | null;
  finish: RaceFinishDisplay | null;
  raceDistanceKm: number | null;
  /** true wenn die Vorbereitung ohne Race-Session endete (nur Planende). */
  planEndedWithoutRace?: boolean;
  compact?: boolean;
  /** Öffnet den Rückblick; ohne Handler keine Aktion. */
  onOpenRecap?: () => void;
  /** Snapshot wird gerade angelegt/geladen. */
  recapLoading?: boolean;
  /** „Neue Vorbereitung starten" (Snapshot → Wizard → Archivierung); ohne Handler keine Aktion. */
  onStartNewPrep?: () => void;
  /** Snapshot für die neue Vorbereitung wird gerade gesichert. */
  newPrepStarting?: boolean;
  /** Verständliche Meldung, wenn der Start abgebrochen wurde (nichts verändert). */
  newPrepError?: string | null;
};

/**
 * Home im Zustand „Vorbereitung abgeschlossen" — ersetzt den Ruhetag-Fallback.
 * Aktionen: „Rückblick ansehen" und (dezenter) „Neue Vorbereitung starten".
 */
export default function PrepCompleteHeroCard({
  raceName,
  raceYmd,
  goalSeconds,
  finish,
  raceDistanceKm,
  planEndedWithoutRace = false,
  compact = false,
  onOpenRecap,
  recapLoading = false,
  onStartNewPrep,
  newPrepStarting = false,
  newPrepError = null,
}: Props) {
  const dateLabel = formatRaceDateDe(raceYmd);
  const title = raceName ?? (planEndedWithoutRace ? "Dein Trainingsplan" : "Dein Rennen");
  const goalLabel = goalSeconds != null ? formatGoalLabel(goalSeconds) : null;
  const pace = finish ? formatRacePace(finish.seconds, raceDistanceKm) : null;
  const sourceNote = finish ? finishTimeSourceNote(finish) : null;
  const reachedLine = finish ? goalReachedLine(finish.seconds, goalSeconds) : null;

  return (
    <div
      data-testid="prep-complete-hero"
      style={{
        width: "100%",
        maxWidth: "min(100%, 340px)",
        margin: "0 auto",
        boxSizing: "border-box",
        textAlign: "center",
        padding: compact ? "6px 8px 8px" : "10px 10px 12px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: compact ? 4 : 6,
        minWidth: 0,
      }}
    >
      <div
        style={{
          fontSize: 10,
          textTransform: "uppercase",
          letterSpacing: "0.1em",
          color: "#86efac",
          fontWeight: 800,
        }}
      >
        🏁 Vorbereitung abgeschlossen
      </div>
      <div
        style={{
          fontSize: compact ? 23 : 26,
          fontWeight: 800,
          color: "#f8fafc",
          lineHeight: 1.15,
          letterSpacing: "-0.03em",
          overflowWrap: "anywhere",
          maxWidth: "100%",
        }}
      >
        {title}
      </div>
      {dateLabel || goalLabel ? (
        <div style={{ fontSize: 12, fontWeight: 650, color: "rgba(148,163,184,0.95)", overflowWrap: "anywhere" }}>
          {[dateLabel, goalLabel].filter(Boolean).join(" · ")}
        </div>
      ) : null}
      {finish ? (
        <div style={{ marginTop: compact ? 2 : 4, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
          <div
            data-testid="prep-complete-hero-time"
            style={{ fontSize: compact ? 28 : 32, fontWeight: 850, color: "#fff", letterSpacing: "-0.04em", lineHeight: 1.05 }}
          >
            {formatFinishTime(finish.seconds)}
          </div>
          {pace || sourceNote ? (
            <div style={{ fontSize: 11, fontWeight: 600, color: "rgba(148,163,184,0.9)" }}>
              {[pace, sourceNote].filter(Boolean).join(" · ")}
            </div>
          ) : null}
          {reachedLine ? (
            <div style={{ fontSize: 12, fontWeight: 750, color: "#86efac" }}>{reachedLine}</div>
          ) : null}
        </div>
      ) : null}
      {onOpenRecap ? (
        <button
          type="button"
          className="dashboard-action"
          data-testid="prep-open-recap"
          onClick={onOpenRecap}
          disabled={recapLoading}
          aria-busy={recapLoading}
          style={{
            marginTop: compact ? 6 : 10,
            minHeight: compact ? 38 : 44,
            padding: compact ? "0 18px" : "0 22px",
            borderRadius: 999,
            border: "1px solid rgba(253,230,138,0.45)",
            background: "linear-gradient(135deg, rgba(250,204,21,0.22), rgba(34,197,94,0.18))",
            color: "#fef9c3",
            fontSize: compact ? 13 : 14,
            fontWeight: 800,
            letterSpacing: "0.01em",
            cursor: recapLoading ? "default" : "pointer",
            opacity: recapLoading ? 0.7 : 1,
            boxShadow: "0 10px 26px rgba(250,204,21,0.12)",
          }}
        >
          {recapLoading ? "Rückblick wird vorbereitet …" : "Rückblick ansehen"}
        </button>
      ) : null}
      {onStartNewPrep ? (
        <button
          type="button"
          data-testid="prep-start-new"
          onClick={onStartNewPrep}
          disabled={newPrepStarting || recapLoading}
          aria-busy={newPrepStarting}
          style={{
            marginTop: compact ? 2 : 4,
            minHeight: compact ? 34 : 40,
            padding: "0 16px",
            border: "none",
            background: "transparent",
            color: "rgba(226,232,240,0.85)",
            fontSize: compact ? 12 : 13,
            fontWeight: 700,
            textDecoration: "underline",
            textUnderlineOffset: 3,
            cursor: newPrepStarting || recapLoading ? "default" : "pointer",
            opacity: newPrepStarting || recapLoading ? 0.6 : 1,
          }}
        >
          {newPrepStarting ? "Rückblick wird gesichert …" : "Neue Vorbereitung starten"}
        </button>
      ) : null}
      {newPrepError ? (
        <div
          role="alert"
          data-testid="prep-start-new-error"
          style={{ fontSize: 12, fontWeight: 600, color: "#fca5a5", lineHeight: 1.4, maxWidth: 320 }}
        >
          {newPrepError}
        </div>
      ) : null}
    </div>
  );
}
