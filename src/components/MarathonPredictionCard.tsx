import type { CSSProperties } from "react";
import type { MarathonPredictionResult } from "../marathonPrediction";
import { forecastTitle } from "../raceDistance";

type Variant = "compact" | "full";

type Props = {
  variant: Variant;
  prediction: MarathonPredictionResult;
  /** Renndistanz des aktiven Plans (Titel); ohne Angabe neutraler Titel „Prognose". */
  raceDistanceKm?: number | null;
  /** Eingestellte Zielzeit (Anzeige) */
  targetTimeLabel?: string;
  /** z. B. aus Formprognose / Readiness */
  confidenceLabel?: string | null;
  /** Coach-Zeilen unter der Prognose */
  coachHints?: string[];
  style?: CSSProperties;
};

/** Prognose-Karte, Titel nach Plan-Distanz (docs/design-system/mockups/leistung.html). */
export default function MarathonPredictionCard({
  prediction,
  raceDistanceKm,
  targetTimeLabel,
  confidenceLabel,
  coachHints = [],
  style,
}: Props) {
  const sub3 = prediction.sub3ProbabilityPercent != null ? Math.min(100, Math.max(0, prediction.sub3ProbabilityPercent)) : null;
  const ready = prediction.ready && !!prediction.predictedTime;
  const hasSub250 = prediction.sub250ProbabilityPercent != null;
  const probabilityCols = 1 + (sub3 != null ? 1 : 0) + (hasSub250 ? 1 : 0);

  return (
    <section className="mr-card" style={style}>
      <div className="mr-card__top">
        <span className="mr-label">{forecastTitle(raceDistanceKm)}</span>
        {targetTimeLabel ? <span className="mr-card__meta">{/^Ziel\b/.test(targetTimeLabel) ? targetTimeLabel : `Ziel ${targetTimeLabel}`}</span> : null}
      </div>

      {ready ? (
        <>
          <div className="mr-metric-l" style={{ marginTop: 8 }}>
            {prediction.predictedTime}
          </div>
          {prediction.rangeLabel ? <p className="mr-caption" style={{ marginTop: 4 }}>{prediction.rangeLabel}</p> : null}

          <div className={probabilityCols >= 3 ? "mr-cols mr-card__divided" : "mr-cols mr-cols--2 mr-card__divided"}>
            <div>
              <div className="mr-cols__label">Konstanz</div>
              <div className="mr-cols__value">{prediction.consistencyScore ?? "—"}</div>
            </div>
            {sub3 != null ? (
              <div>
                <div className="mr-cols__label">Unter 3:00</div>
                <div className="mr-cols__value">{sub3} %</div>
              </div>
            ) : null}
            {hasSub250 ? (
              <div>
                <div className="mr-cols__label">Unter 2:50</div>
                <div className="mr-cols__value">{prediction.sub250ProbabilityPercent} %</div>
              </div>
            ) : null}
          </div>
          {confidenceLabel ? <p className="mr-caption" style={{ marginTop: 12 }}>Sicherheit: {confidenceLabel}</p> : null}

          {coachHints.length > 0 ? (
            <div className="mr-card__divided">
              <ul className="mr-bullets">
                {coachHints.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      ) : (
        <>
          <div className="mr-metric-l mr-metric--empty" style={{ marginTop: 8 }}>
            —
          </div>
          {prediction.message ? <p className="mr-card__text">{prediction.message}</p> : null}
          {prediction.consistencyScore != null ? (
            <p className="mr-caption" style={{ marginTop: 8 }}>Konstanz: {prediction.consistencyScore}</p>
          ) : null}
        </>
      )}
    </section>
  );
}
