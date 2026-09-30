import type { CSSProperties } from "react";
import SurfaceCard from "../SurfaceCard";
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
  if (completedBy === "race_done") return "Rennen gelaufen 🎉";
  if (completedBy === "plan_ended") return "Plan durchgezogen 🎉";
  return "Renntag vorbei";
}

const tileStyle: CSSProperties = {
  background: "rgba(9,11,26,0.88)",
  borderRadius: 14,
  padding: "12px 10px",
  border: "1px solid rgba(148,163,184,0.12)",
  minWidth: 0,
  textAlign: "center",
};

const tileLabelStyle: CSSProperties = {
  fontSize: 10,
  textTransform: "uppercase",
  letterSpacing: "0.1em",
  color: "#64748b",
  fontWeight: 700,
  marginBottom: 6,
};

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
    <SurfaceCard
      data-testid="race-result-card"
      style={{ border: "1px solid rgba(34,197,94,0.22)", boxShadow: "0 20px 44px rgba(2,6,23,0.32)", ...style }}
    >
      <div
        style={{
          fontSize: 12,
          textTransform: "uppercase",
          letterSpacing: "0.12em",
          color: "#7c8aa5",
          fontWeight: 700,
          marginBottom: 10,
          textAlign: "center",
        }}
      >
        {heading}
      </div>
      {raceName ? (
        <div
          style={{
            fontSize: 18,
            fontWeight: 800,
            color: "#f8fafc",
            textAlign: "center",
            overflowWrap: "anywhere",
            marginBottom: 4,
          }}
        >
          {raceName}
        </div>
      ) : null}
      {dateLabel ? (
        <div style={{ fontSize: 12, color: "#64748b", textAlign: "center", fontWeight: 600, marginBottom: 12 }}>
          {dateLabel}
        </div>
      ) : null}

      {finish ? (
        <>
          <div
            data-testid="race-result-time"
            style={{
              fontSize: 40,
              fontWeight: 800,
              color: "#fff",
              letterSpacing: "-0.04em",
              lineHeight: 1.05,
              textAlign: "center",
              marginBottom: 4,
            }}
          >
            {formatFinishTime(finish.seconds)}
          </div>
          {sourceNote ? (
            <div style={{ fontSize: 12, color: "#64748b", textAlign: "center", fontWeight: 600, marginBottom: 4 }}>
              {sourceNote}
            </div>
          ) : null}
          {reachedLine ? (
            <div style={{ fontSize: 13, color: "#86efac", textAlign: "center", fontWeight: 750, marginBottom: 4 }}>
              {reachedLine}
            </div>
          ) : null}
          {pace || goalLabel ? (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: pace && goalLabel ? "1fr 1fr" : "1fr",
                gap: 12,
                marginTop: 12,
              }}
            >
              {pace ? (
                <div style={tileStyle}>
                  <div style={tileLabelStyle}>Pace</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: "#e2e8f0" }}>{pace}</div>
                </div>
              ) : null}
              {goalLabel ? (
                <div style={tileStyle}>
                  <div style={tileLabelStyle}>Zielvorgabe</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: "#e2e8f0" }}>{goalLabel.replace(/^Ziel:\s*/, "")}</div>
                </div>
              ) : null}
            </div>
          ) : null}
        </>
      ) : (
        <>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#f8fafc", textAlign: "center", marginBottom: 4 }}>
            {noTimeHeadline(completedBy)}
          </div>
          {goalLabel ? (
            <div style={{ fontSize: 12, color: "#64748b", textAlign: "center", fontWeight: 600 }}>{goalLabel}</div>
          ) : null}
        </>
      )}
      {onEditFinishTime && editFinishTimeLabel && completedBy !== "plan_ended" ? (
        <div style={{ display: "flex", justifyContent: "center", marginTop: 12 }}>
          <button
            type="button"
            className="dashboard-action"
            data-testid="race-result-edit-time"
            onClick={onEditFinishTime}
            disabled={editFinishTimeLoading}
            style={{
              minHeight: 40,
              padding: "0 18px",
              borderRadius: 999,
              border: "1px solid rgba(148,163,184,0.28)",
              background: "rgba(148,163,184,0.08)",
              color: "#e2e8f0",
              fontSize: 13,
              fontWeight: 750,
              cursor: editFinishTimeLoading ? "default" : "pointer",
              opacity: editFinishTimeLoading ? 0.6 : 1,
            }}
          >
            {editFinishTimeLabel}
          </button>
        </div>
      ) : null}
    </SurfaceCard>
  );
}
