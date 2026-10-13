import type { CSSProperties } from "react";
import {
  finishTimeSourceNote,
  formatFinishTime,
  formatRaceDateDe,
  formatRacePace,
  goalReachedLine,
  type RaceFinishDisplay,
} from "../../prepRecap/raceResultPresentation";
import { formatGoalLabel, type PrepCompletedBy } from "../../prepRecap/prepCompletionState";

type Props = {
  raceName: string | null;
  raceYmd: string;
  goalSeconds: number | null;
  finish: RaceFinishDisplay | null;
  raceDistanceKm: number | null;
  completedBy: PrepCompletedBy;
  style?: CSSProperties;
  /** Zielzeit bestätigen/eintragen/bearbeiten; ohne Handler keine Aktion. */
  onEditFinishTime?: () => void;
  editFinishTimeLabel?: string;
  editFinishTimeLoading?: boolean;
};

/**
 * Ohne erkannte Zeit: Nur ein erledigtes Rennen wird als gelaufen gefeiert. Ist bloß das Datum
 * vorbei (kein Haken, kein Health-Lauf — evtl. nicht gestartet), bleibt die Aussage neutral.
 */
function noTimeHeadline(completedBy: PrepCompletedBy): string {
  if (completedBy === "race_done") return "Rennen gelaufen";
  if (completedBy === "plan_ended") return "Plan durchgezogen";
  return "Renntag vorbei";
}

/** Leistung nach Plan-Ende: Rennergebnis statt Prognose/Sub-3/Confidence für ein vergangenes Rennen. */
export default function RaceResultCard({
  raceName,
  raceYmd,
  goalSeconds,
  finish,
  raceDistanceKm,
  completedBy,
  style,
  onEditFinishTime,
  editFinishTimeLabel,
  editFinishTimeLoading = false,
}: Props) {
  const dateLabel = formatRaceDateDe(raceYmd);
  const goalLabel = goalSeconds != null ? formatGoalLabel(goalSeconds) : null;
  const pace = finish ? formatRacePace(finish.seconds, raceDistanceKm) : null;
  const sourceNote = finish ? finishTimeSourceNote(finish) : null;
  const reachedLine = finish ? goalReachedLine(finish.seconds, goalSeconds) : null;
  const heading = completedBy === "plan_ended" ? "Vorbereitung abgeschlossen" : "Rennergebnis";

  return (
    <section className="mr-card" data-testid="race-result-card" style={style}>
      <span className="mr-label">{heading}</span>
      {raceName ? (
        <div className="mr-card__title" style={{ marginTop: 8, overflowWrap: "anywhere" }}>
          {raceName}
        </div>
      ) : null}
      {dateLabel ? <p className="mr-caption">{dateLabel}</p> : null}

      {finish ? (
        <>
          <div className="mr-metric-l" data-testid="race-result-time" style={{ marginTop: 12 }}>
            {formatFinishTime(finish.seconds)}
          </div>
          {sourceNote ? <p className="mr-caption" style={{ marginTop: 4 }}>{sourceNote}</p> : null}
          {reachedLine ? <p className="mr-card__text">{reachedLine}</p> : null}
          {pace || goalLabel ? (
            <div className="mr-cols mr-cols--2 mr-card__divided">
              {pace ? (
                <div>
                  <div className="mr-cols__label">Pace</div>
                  <div className="mr-cols__value">{pace}</div>
                </div>
              ) : null}
              {goalLabel ? (
                <div>
                  <div className="mr-cols__label">Zielvorgabe</div>
                  <div className="mr-cols__value">{goalLabel.replace(/^Ziel:\s*/, "")}</div>
                </div>
              ) : null}
            </div>
          ) : null}
        </>
      ) : (
        <>
          <div className="t-title-m" style={{ marginTop: 12 }}>
            {noTimeHeadline(completedBy)}
          </div>
          {goalLabel ? <p className="mr-caption" style={{ marginTop: 4 }}>{goalLabel}</p> : null}
        </>
      )}
      {onEditFinishTime && editFinishTimeLabel && completedBy !== "plan_ended" ? (
        <button
          type="button"
          className="mr-btn mr-btn--secondary mr-btn--mid"
          data-testid="race-result-edit-time"
          onClick={onEditFinishTime}
          disabled={editFinishTimeLoading}
          style={{ marginTop: 16 }}
        >
          {editFinishTimeLabel}
        </button>
      ) : null}
    </section>
  );
}
