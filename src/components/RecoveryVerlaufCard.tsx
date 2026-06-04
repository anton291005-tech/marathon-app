import SurfaceCard from "./SurfaceCard";
import type { RecoveryFactorPill, RecoveryVerlaufCardPresentation } from "../recovery/recoveryPresentation";

function RecoveryMiniTrend({
  values,
  width,
  height,
}: {
  values: number[];
  width: number;
  height: number;
}) {
  const pts = values.length >= 2 ? values : values.length === 1 ? [values[0]!, values[0]!] : [50, 50];
  const displayMin = Math.max(0, Math.min(...pts) - 5);
  const displayMax = Math.min(100, Math.max(...pts) + 5);
  const pad = 4;
  const xAt = (i: number) => pad + (i / Math.max(1, pts.length - 1)) * (width - 2 * pad);
  const yAt = (v: number) => {
    const t = displayMax === displayMin ? 0.5 : (v - displayMin) / (displayMax - displayMin);
    return height - pad - t * (height - 2 * pad);
  };
  const linePts = pts.map((v, i) => `${xAt(i)},${yAt(v)}`).join(" ");
  const areaD =
    `M ${xAt(0)},${yAt(pts[0]!)} ` +
    pts
      .slice(1)
      .map((v, i) => `L ${xAt(i + 1)},${yAt(v)}`)
      .join(" ") +
    ` L ${xAt(pts.length - 1)},${height} L ${xAt(0)},${height} Z`;

  return (
    <svg width={width} height={height} style={{ display: "block" }}>
      <path d={areaD} fill="rgba(56,189,248,0.08)" stroke="none" />
      <polyline
        fill="none"
        stroke="rgba(56,189,248,0.85)"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
        points={linePts}
      />
      {pts.map((v, i) => (
        <circle
          key={i}
          cx={xAt(i)}
          cy={yAt(v)}
          r={i === pts.length - 1 ? 3.5 : 2}
          fill={i === pts.length - 1 ? "rgba(56,189,248,1)" : "rgba(56,189,248,0.5)"}
        />
      ))}
    </svg>
  );
}

function FactorPill({ label, trend, context, available, trendColor }: RecoveryFactorPill) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 3,
        flex: "1 1 auto",
        minWidth: 76,
        maxWidth: 110,
        borderRadius: 12,
        padding: "8px 10px",
        background: "rgba(15,23,42,0.75)",
        border: "1px solid rgba(148,163,184,0.12)",
      }}
    >
      <div
        style={{
          fontSize: 9,
          textTransform: "uppercase",
          letterSpacing: "0.07em",
          color: "#7c8aa5",
          fontWeight: 700,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 18,
          fontWeight: 800,
          color: available ? trendColor : "#4b5563",
          lineHeight: 1,
        }}
      >
        {available ? trend : "—"}
      </div>
      <div
        style={{
          fontSize: 10,
          color: available ? "#94a3b8" : "#4b5563",
          fontWeight: 600,
          lineHeight: 1.3,
        }}
      >
        {context}
      </div>
    </div>
  );
}

type Props = {
  presentation: RecoveryVerlaufCardPresentation;
};

/**
 * Display-only: all interpretation lives in `getRecoveryPresentationState` (recoveryPresentation.ts).
 */
export default function RecoveryVerlaufCard({ presentation: p }: Props) {
  const { header, factors, trendValues, insightText, insightShowWarning } = p;

  return (
    <SurfaceCard style={{ flexShrink: 0 }}>
      <div
        style={{
          fontSize: 11,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: "#7c8aa5",
          fontWeight: 700,
          marginBottom: 14,
        }}
      >
        Recovery
      </div>

      {/* Header: large score + status label + delta */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          gap: 14,
          marginBottom: 16,
        }}
      >
        <div
          style={{
            fontSize: 64,
            fontWeight: 900,
            color: header.statusColor,
            lineHeight: 1,
            letterSpacing: "-0.03em",
            minWidth: 80,
          }}
        >
          {header.score !== null ? header.score : "—"}
        </div>
        <div style={{ flex: 1, paddingBottom: 6 }}>
          <div
            style={{
              fontSize: 17,
              fontWeight: 800,
              color: "#e2e8f0",
              lineHeight: 1.2,
            }}
          >
            {header.statusLabel}
          </div>
          {header.deltaLine ? (
            <div
              style={{
                fontSize: 12,
                color: "#94a3b8",
                fontWeight: 600,
                marginTop: 3,
              }}
            >
              {header.deltaLine}
            </div>
          ) : null}
        </div>
      </div>

      {/* Contributing factor pills */}
      <div
        style={{
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
          marginBottom: 16,
        }}
      >
        {factors.map((f) => (
          <FactorPill key={f.id} {...f} />
        ))}
      </div>

      {/* Mini trend: last 7 days */}
      {trendValues.length >= 2 ? (
        <div style={{ marginBottom: 14 }}>
          <div
            style={{
              fontSize: 10,
              color: "#64748b",
              fontWeight: 600,
              marginBottom: 6,
              letterSpacing: "0.04em",
            }}
          >
            Letzte 7 Tage
          </div>
          <RecoveryMiniTrend values={trendValues} width={240} height={40} />
        </div>
      ) : null}

      {/* Insight text */}
      {insightText ? (
        <div
          style={{
            padding: "10px 12px",
            borderRadius: 10,
            background: insightShowWarning ? "rgba(245,158,11,0.08)" : "rgba(15,23,42,0.65)",
            border: `1px solid ${insightShowWarning ? "rgba(245,158,11,0.25)" : "rgba(148,163,184,0.12)"}`,
            fontSize: 13,
            color: "#e2e8f0",
            lineHeight: 1.5,
          }}
        >
          {insightText}
        </div>
      ) : null}
    </SurfaceCard>
  );
}
