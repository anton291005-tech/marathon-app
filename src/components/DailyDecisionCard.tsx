import type { DailyDecision } from "../dailyDecision";

type Props = { decision: DailyDecision };

const STATUS_COLOR: Record<DailyDecision["status"], string> = {
  green: "#34d399",
  yellow: "#fbbf24",
  red: "#f87171",
};

const STATUS_BG: Record<DailyDecision["status"], string> = {
  green: "rgba(16,185,129,0.09)",
  yellow: "rgba(245,158,11,0.09)",
  red: "rgba(248,113,113,0.09)",
};

const STATUS_BORDER: Record<DailyDecision["status"], string> = {
  green: "rgba(52,211,153,0.22)",
  yellow: "rgba(251,191,36,0.22)",
  red: "rgba(248,113,113,0.22)",
};

export default function DailyDecisionCard({ decision }: Props) {
  const col = STATUS_COLOR[decision.status];
  const bg = STATUS_BG[decision.status];
  const border = STATUS_BORDER[decision.status];

  return (
    <div
      style={{
        background: bg,
        border: `1px solid ${border}`,
        borderRadius: 20,
        padding: "14px 16px 15px",
      }}
    >
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: col,
            flexShrink: 0,
            boxShadow: `0 0 7px ${col}99`,
          }}
        />
        <span
          style={{
            fontSize: 10,
            textTransform: "uppercase",
            letterSpacing: "0.12em",
            color: "#7c8aa5",
            fontWeight: 700,
          }}
        >
          Heutige Empfehlung
        </span>
      </div>

      {/* Main recommendation */}
      <div
        style={{
          fontSize: 16,
          fontWeight: 700,
          color: "#f1f5f9",
          lineHeight: 1.4,
          marginBottom: decision.reasons.length ? 10 : 0,
        }}
      >
        {decision.recommendation}
      </div>

      {/* Reason bullets */}
      {decision.reasons.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          {decision.reasons.map((r, i) => (
            <div
              key={i}
              style={{ fontSize: 12, color: "#94a3b8", lineHeight: 1.5 }}
            >
              · {r}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
