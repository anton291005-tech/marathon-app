import type { CSSProperties } from "react";
import type { MarathonPredictionResult } from "../marathonPrediction";

type Variant = "compact" | "full";

type Props = {
  variant: Variant;
  prediction: MarathonPredictionResult;
  /** Eingestellte Zielzeit (Anzeige) */
  targetTimeLabel?: string;
  /** z. B. aus Formprognose / Readiness */
  confidenceLabel?: string | null;
  /** Coach-Zeilen unter der Prognose */
  coachHints?: string[];
  style?: CSSProperties;
};

/** Karte „Marathon-Prognose" (docs/design-system/mockups/leistung.html). */
export default function MarathonPredictionCard({
  prediction,
  targetTimeLabel,
  confidenceLabel,
  coachHints = [],
  style,
}: Props) {
  const sub3 = Math.min(100, Math.max(0, prediction.sub3ProbabilityPercent ?? 0));
  const ready = prediction.ready && !!prediction.predictedTime;
  const hasSub250 = prediction.sub250ProbabilityPercent != null;

  return (
    <section className="mr-card" style={style}>
      <div className="mr-card__top">
        <span className="mr-label">Marathon-Prognose</span>
        {targetTimeLabel ? <span className="mr-card__meta">{/^Ziel\b/.test(targetTimeLabel) ? targetTimeLabel : `Ziel ${targetTimeLabel}`}</span> : null}
      </div>

      {ready ? (
        <>
          <div className="mr-metric-l" style={{ marginTop: 8 }}>
            {prediction.predictedTime}
          </div>
          {prediction.rangeLabel ? <p className="mr-caption" style={{ marginTop: 4 }}>{prediction.rangeLabel}</p> : null}

          <div className={hasSub250 ? "mr-cols mr-card__divided" : "mr-cols mr-cols--2 mr-card__divided"}>
            <div>
              <div className="mr-cols__label">Konstanz</div>
              <div className="mr-cols__value">{prediction.consistencyScore ?? "—"}</div>
            </div>
            <div>
              <div className="mr-cols__label">Unter 3:00</div>
              <div className="mr-cols__value">{sub3} %</div>
            </div>
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
