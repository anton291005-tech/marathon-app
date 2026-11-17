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
  /**
   * Zielzeit des aktiven Plans in Sekunden. Steuert, ob die Marken „Unter 3:00" / „Unter 2:50" erscheinen —
   * für eine 4:00-Läuferin sind sie bedeutungslos (0 %). `undefined` = alte Anzeige (beide Marken).
   */
  targetSeconds?: number | null;
  style?: CSSProperties;
};

/** Spielraum über der Marke, in dem sie noch als Bezug taugt (Ziel 3:10 → „Unter 3:00" bleibt sichtbar). */
const MARK_RELEVANCE_SECONDS = 15 * 60;

// ENTSCHEIDUNG (Anton absegnen): Sub-3/Sub-2:50 nur zeigen, wenn die Zielzeit höchstens 15 min darüber liegt;
// ohne Zielzeit keine Marken. Antons Ziel (Sub 2:50) sieht beide wie bisher.
export function visibleMarathonMarks(targetSeconds: number | null | undefined): { sub3: boolean; sub250: boolean } {
  if (targetSeconds === undefined) return { sub3: true, sub250: true };
  if (targetSeconds == null || !Number.isFinite(targetSeconds) || targetSeconds <= 0) return { sub3: false, sub250: false };
  return {
    sub3: targetSeconds <= 3 * 3600 + MARK_RELEVANCE_SECONDS,
    sub250: targetSeconds <= 2 * 3600 + 50 * 60 + MARK_RELEVANCE_SECONDS,
  };
}

/** Prognose-Karte, Titel nach Plan-Distanz (docs/design-system/mockups/leistung.html). */
export default function MarathonPredictionCard({
  prediction,
  raceDistanceKm,
  targetTimeLabel,
  confidenceLabel,
  coachHints = [],
  targetSeconds,
  style,
}: Props) {
  const marks = visibleMarathonMarks(targetSeconds);
  const sub3 =
    marks.sub3 && prediction.sub3ProbabilityPercent != null ? Math.min(100, Math.max(0, prediction.sub3ProbabilityPercent)) : null;
  const ready = prediction.ready && !!prediction.predictedTime;
  const hasSub250 = marks.sub250 && prediction.sub250ProbabilityPercent != null;
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
