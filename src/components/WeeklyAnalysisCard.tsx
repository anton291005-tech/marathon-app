import type { WeeklyAnalysis } from "../weeklyAnalysis";
import SurfaceCard from "./SurfaceCard";

const toneBorder: Record<WeeklyAnalysis["verdictTone"], string> = {
  strong: "rgba(16,185,129,0.35)",
  solid: "rgba(56,189,248,0.25)",
  warn: "rgba(248,113,113,0.3)",
  neutral: "rgba(148,163,184,0.15)",
  upcoming: "rgba(148,163,184,0.15)",
};

const toneLabel: Record<WeeklyAnalysis["verdictTone"], string> = {
  strong: "#34d399",
  solid: "#38bdf8",
  warn: "#f87171",
  neutral: "#94a3b8",
  upcoming: "#94a3b8",
};

type Props = {
  weekLabel: string;
  weekDates: string;
  analysis: WeeklyAnalysis;
};

export default function WeeklyAnalysisCard({ weekLabel, weekDates, analysis }: Props) {
  const b = toneBorder[analysis.verdictTone];
  const c = toneLabel[analysis.verdictTone];

  return (
    <SurfaceCard style={{ border: `1px solid ${b}` }}>
      <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: "#7c8aa5", fontWeight: 700, marginBottom: 10 }}>
        Wochenanalyse
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 10, marginBottom: 14 }}>
        <div style={{ background: "rgba(9,11,26,0.85)", borderRadius: 12, padding: "10px 8px", border: "1px solid rgba(148,163,184,0.1)" }}>
          <div style={{ fontSize: 10, color: "#64748b", fontWeight: 700 }}>Geplant km</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: "#38bdf8" }}>{analysis.plannedKm}</div>
        </div>
        <div style={{ background: "rgba(9,11,26,0.85)", borderRadius: 12, padding: "10px 8px", border: "1px solid rgba(148,163,184,0.1)" }}>
          <div style={{ fontSize: 10, color: "#64748b", fontWeight: 700 }}>Ist km</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: "#10b981" }}>{analysis.actualKm.toFixed(1)}</div>
        </div>
        <div style={{ background: "rgba(9,11,26,0.85)", borderRadius: 12, padding: "10px 8px", border: "1px solid rgba(148,163,184,0.1)" }}>
          <div style={{ fontSize: 10, color: "#64748b", fontWeight: 700 }}>Einheiten</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: "#e2e8f0" }}>
            {analysis.doneSessions}/{analysis.plannedTrainSessions}
          </div>
        </div>
        <div style={{ background: "rgba(9,11,26,0.85)", borderRadius: 12, padding: "10px 8px", border: "1px solid rgba(148,163,184,0.1)" }}>
          <div style={{ fontSize: 10, color: "#64748b", fontWeight: 700 }}>Intensiv</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: "#fb7185" }}>
            {analysis.intenseDone}/{analysis.intensePlanned}
          </div>
        </div>
      </div>

      {analysis.longRunPlanned && (
        <div style={{ fontSize: 11, marginBottom: 10 }}>
          <span style={{ color: "#64748b" }}>Long Run · </span>
          {analysis.longRunDone ? (
            <span style={{ color: "#86efac", fontWeight: 700 }}>✓{analysis.longRunKmPlanned ? ` ${analysis.longRunKmPlanned} km` : ""}</span>
          ) : (
            <span style={{ color: "#fca5a5", fontWeight: 700 }}>offen</span>
          )}
        </div>
      )}

      <div
        style={{
          padding: "12px 14px",
          borderRadius: 14,
          background: "rgba(9,11,26,0.72)",
          border: `1px solid ${b}`,
        }}
      >
        <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "#64748b", fontWeight: 700, marginBottom: 6 }}>Fazit</div>
        <div style={{ fontSize: 17, fontWeight: 800, color: c }}>{analysis.verdict}</div>
      </div>
    </SurfaceCard>
  );
}
