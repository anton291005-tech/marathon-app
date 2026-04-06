import type { DailyCoachDecision, DecisionLevel } from "../../lib/ai/getDailyCoachDecision";

type Props = {
  decision: DailyCoachDecision;
  onGoToCoach: () => void;
  onAdjustPlan: () => void;
};

// ─── Level → visual tokens ────────────────────────────────────────────────────

const LEVEL_STYLE: Record<
  DecisionLevel,
  { dot: string; glow: string; accent: string; bg: string; border: string; chip: string; chipText: string }
> = {
  hard: {
    dot: "#f472b6",
    glow: "#f472b644",
    accent: "#f472b6",
    bg: "linear-gradient(160deg,rgba(30,14,36,0.97),rgba(16,11,24,0.96))",
    border: "rgba(244,114,182,0.22)",
    chip: "rgba(244,114,182,0.12)",
    chipText: "#f9a8d4",
  },
  easy: {
    dot: "#34d399",
    glow: "#34d39944",
    accent: "#34d399",
    bg: "linear-gradient(160deg,rgba(11,26,24,0.97),rgba(10,16,24,0.96))",
    border: "rgba(52,211,153,0.2)",
    chip: "rgba(52,211,153,0.1)",
    chipText: "#6ee7b7",
  },
  rest: {
    dot: "#38bdf8",
    glow: "#38bdf844",
    accent: "#38bdf8",
    bg: "linear-gradient(160deg,rgba(8,22,40,0.97),rgba(9,14,26,0.96))",
    border: "rgba(56,189,248,0.18)",
    chip: "rgba(56,189,248,0.1)",
    chipText: "#7dd3fc",
  },
  alternative: {
    dot: "#fbbf24",
    glow: "#fbbf2444",
    accent: "#fbbf24",
    bg: "linear-gradient(160deg,rgba(30,24,10,0.97),rgba(16,14,10,0.96))",
    border: "rgba(251,191,36,0.2)",
    chip: "rgba(251,191,36,0.1)",
    chipText: "#fde68a",
  },
};

const LEVEL_LABEL: Record<DecisionLevel, string> = {
  hard: "Volle Intensität",
  easy: "Lockere Last",
  rest: "Erholung",
  alternative: "Alternative",
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function DailyCoachDecisionCard({ decision, onGoToCoach, onAdjustPlan }: Props) {
  const s = LEVEL_STYLE[decision.level];

  return (
    <div
      style={{
        background: s.bg,
        border: `1px solid ${s.border}`,
        borderRadius: 20,
        padding: "16px 16px 14px",
        display: "flex",
        flexDirection: "column",
        gap: 12,
        boxShadow: `0 16px 36px rgba(2,6,23,0.2), 0 0 0 1px ${s.border}`,
      }}
    >
      {/* ── Header row ───────────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {/* pulsing dot */}
        <div
          style={{
            width: 9,
            height: 9,
            borderRadius: "50%",
            flexShrink: 0,
            background: s.dot,
            boxShadow: `0 0 10px ${s.glow}`,
          }}
        />
        {/* title */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <span
            style={{
              fontSize: 16,
              fontWeight: 800,
              color: "#f8fafc",
              letterSpacing: "-0.02em",
              lineHeight: 1.2,
            }}
          >
            {decision.title}
          </span>
        </div>
        {/* level chip */}
        <div
          style={{
            flexShrink: 0,
            background: s.chip,
            color: s.chipText,
            borderRadius: 999,
            padding: "4px 10px",
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            whiteSpace: "nowrap",
          }}
        >
          {LEVEL_LABEL[decision.level]}
        </div>
      </div>

      {/* ── Reason ───────────────────────────────────────────────────────── */}
      <div
        style={{
          fontSize: 13,
          color: "rgba(148,163,184,0.9)",
          lineHeight: 1.45,
          paddingLeft: 19,
        }}
      >
        {decision.reason}
      </div>

      {/* ── Detail bullets ───────────────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 6,
          paddingLeft: 19,
        }}
      >
        {decision.details.map((line) => (
          <div
            key={line}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 8,
            }}
          >
            <span
              style={{
                flexShrink: 0,
                width: 5,
                height: 5,
                borderRadius: "50%",
                background: s.accent,
                opacity: 0.7,
                marginTop: 5,
              }}
            />
            <span
              style={{
                fontSize: 13,
                color: "rgba(226,232,240,0.82)",
                lineHeight: 1.4,
              }}
            >
              {line}
            </span>
          </div>
        ))}
      </div>

      {/* ── Action buttons ───────────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: 8, marginTop: 2 }}>
        <button
          onClick={onGoToCoach}
          style={{
            flex: 1,
            background: "rgba(56,189,248,0.12)",
            border: "1px solid rgba(56,189,248,0.26)",
            color: "#7dd3fc",
            borderRadius: 12,
            padding: "10px 12px",
            fontSize: 13,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Zum Coach
        </button>
        <button
          onClick={onAdjustPlan}
          style={{
            flex: 1,
            background: `${s.chip}`,
            border: `1px solid ${s.border}`,
            color: s.chipText,
            borderRadius: 12,
            padding: "10px 12px",
            fontSize: 13,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Plan anpassen
        </button>
      </div>
    </div>
  );
}
