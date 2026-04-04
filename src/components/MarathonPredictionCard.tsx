import type { CSSProperties } from "react";
import type { MarathonPredictionResult } from "../marathonPrediction";
import SurfaceCard from "./SurfaceCard";

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

const verdictColor: Record<string, string> = {
  hoch: "#34d399",
  mittel: "#fbbf24",
  "früh im Block": "#94a3b8",
  "wartet auf Daten": "#64748b",
};

export default function MarathonPredictionCard({
  variant,
  prediction,
  targetTimeLabel,
  confidenceLabel,
  coachHints = [],
  style,
}: Props) {
  const isFull = variant === "full";
  const titleSize = isFull ? 12 : 11;
  const timeSize = isFull ? 40 : 32;
  const sub3 = prediction.sub3ProbabilityPercent ?? 0;

  return (
    <SurfaceCard
      style={{
        marginTop: isFull ? 0 : 2,
        border: isFull ? "1px solid rgba(56,189,248,0.2)" : undefined,
        boxShadow: isFull ? "0 20px 44px rgba(2,6,23,0.32)" : undefined,
        ...style,
      }}
    >
      <div
        style={{
          fontSize: titleSize,
          textTransform: "uppercase",
          letterSpacing: "0.12em",
          color: "#7c8aa5",
          fontWeight: 700,
          marginBottom: 10,
          textAlign: "center",
        }}
      >
        Marathon-Prognose
      </div>

      {targetTimeLabel ? (
        <div
          style={{
            fontSize: 11,
            color: "#64748b",
            textAlign: "center",
            marginBottom: 8,
            fontWeight: 600,
          }}
        >
          Zielzeit {targetTimeLabel}
        </div>
      ) : null}

      {prediction.ready && prediction.predictedTime ? (
        <>
          <div
            style={{
              fontSize: timeSize,
              fontWeight: 800,
              color: "#fff",
              letterSpacing: "-0.04em",
              lineHeight: 1.05,
              textAlign: "center",
              marginBottom: 6,
            }}
          >
            {prediction.predictedTime}
          </div>
          {prediction.rangeLabel ? (
            <div
              style={{
                fontSize: 13,
                color: "#64748b",
                textAlign: "center",
                fontWeight: 600,
                marginBottom: isFull ? 16 : 12,
              }}
            >
              {prediction.rangeLabel}
            </div>
          ) : null}

          <div
            style={{
              display: "grid",
              gridTemplateColumns: isFull ? "1fr 1fr" : "1fr 1fr",
              gap: isFull ? 14 : 12,
              marginBottom: isFull ? 16 : 12,
            }}
          >
            <div
              style={{
                background: "rgba(9,11,26,0.88)",
                borderRadius: 14,
                padding: "12px 10px",
                border: "1px solid rgba(148,163,184,0.12)",
              }}
            >
              <div
                style={{
                  fontSize: 10,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  color: "#64748b",
                  fontWeight: 700,
                }}
              >
                Consistency
              </div>
              <div style={{ fontSize: isFull ? 26 : 22, fontWeight: 800, color: "#38bdf8", marginTop: 4 }}>
                {prediction.consistencyScore ?? "—"}
              </div>
            </div>
            <div
              style={{
                background: "rgba(9,11,26,0.88)",
                borderRadius: 14,
                padding: "12px 10px",
                border: "1px solid rgba(148,163,184,0.12)",
              }}
            >
              <div
                style={{
                  fontSize: 10,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  color: "#64748b",
                  fontWeight: 700,
                }}
              >
                Sub-3
              </div>
              <div style={{ fontSize: isFull ? 22 : 20, fontWeight: 800, color: "#e2e8f0", marginTop: 4 }}>{sub3}%</div>
              <div style={{ marginTop: 8, height: 8, borderRadius: 999, background: "rgba(15,23,42,0.9)", overflow: "hidden" }}>
                <div
                  style={{
                    height: "100%",
                    width: `${Math.min(100, Math.max(0, sub3))}%`,
                    borderRadius: 999,
                    background: "linear-gradient(90deg,#059669,#34d399)",
                    transition: "width .35s ease",
                  }}
                />
              </div>
            </div>
          </div>

          {isFull && prediction.sub250ProbabilityPercent != null ? (
            <div
              style={{
                fontSize: 12,
                color: "#94a3b8",
                textAlign: "center",
                marginBottom: 12,
              }}
            >
              Sub-2:50 ·{" "}
              <span style={{ color: "#fbbf24", fontWeight: 800 }}>{prediction.sub250ProbabilityPercent}%</span>
            </div>
          ) : null}

          {confidenceLabel ? (
            <div
              style={{
                fontSize: 11,
                color: verdictColor[confidenceLabel] || "#94a3b8",
                textAlign: "center",
                marginBottom: coachHints.length ? 12 : 0,
                fontWeight: 600,
              }}
            >
              Confidence · {confidenceLabel}
            </div>
          ) : null}

          {coachHints.length > 0 ? (
            <div
              style={{
                marginTop: 4,
                paddingTop: 12,
                borderTop: "1px solid rgba(148,163,184,0.1)",
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: "#64748b", fontWeight: 700 }}>
                Coach
              </div>
              {coachHints.map((line, i) => (
                <div key={i} style={{ fontSize: 12, color: "#cbd5e1", lineHeight: 1.55 }}>
                  · {line}
                </div>
              ))}
            </div>
          ) : null}

          {null}
        </>
      ) : (
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 13, color: "#64748b", lineHeight: 1.5 }}>{prediction.message}</div>
          {prediction.consistencyScore != null ? (
            <div style={{ marginTop: 10, fontSize: 11, color: "#64748b" }}>
              Consistency: <span style={{ color: "#38bdf8", fontWeight: 800 }}>{prediction.consistencyScore}</span>
            </div>
          ) : null}
        </div>
      )}
    </SurfaceCard>
  );
}
