import { useMemo } from "react";
import { getAppNow } from "../../core/time/timeSystem";
import type { AiAssistantAction } from "../../lib/ai/types";
import { rowHeadingForSessionDateLabel } from "./SwapPreviewCard";

type Props = {
  before: any;
  after: any;
  coachTodayIso?: string;
  coachFeedback: string;
  confidence?: "high" | "medium" | "low";
  action: AiAssistantAction;
  onConfirm: () => void;
  onCancel: () => void;
};

function sportGlyph(sport?: string): string {
  if (sport === "bike") return "🚴";
  if (sport === "run") return "🏃";
  return "";
}

function sessionTypeLabel(type?: string): string {
  if (!type || type === "rest") return "";
  if (type === "easy") return "Easy";
  if (type === "tempo") return "Tempo";
  if (type === "interval") return "Intervall";
  if (type === "long") return "Long Run";
  if (type === "bike") return "Rennrad";
  if (type === "strength") return "Kraft";
  return type;
}

function metricsLine(session: any): string {
  if (!session) return "—";
  if (session.type === "rest") return "Ruhetag";
  const parts: string[] = [];
  const sport = typeof session.sport === "string" ? session.sport : session.type === "bike" ? "bike" : "run";
  const sportLabel = sportGlyph(sport);
  const typeLabel = sessionTypeLabel(session.sessionType ?? session.type);
  if (sportLabel || typeLabel) {
    parts.push([sportLabel, typeLabel].filter(Boolean).join(" "));
  }
  if (typeof session.km === "number" && session.km > 0) parts.push(`${session.km} km`);
  if (typeof session.pace === "string" && session.pace.trim()) parts.push(session.pace.trim());
  if (typeof session.desc === "string" && session.desc.trim().length > 0 && parts.length <= 1) {
    parts.push(session.desc.trim().slice(0, 80));
  }
  return parts.length ? parts.join(" · ") : "—";
}

export function ReplaceWorkoutPreviewCard({
  before,
  after,
  coachTodayIso,
  coachFeedback,
  confidence,
  action,
  onConfirm,
  onCancel,
}: Props) {
  const isConvert = action?.type === "convert_workout_to_run";
  const canConfirm = action?.type === "replace_workout" || isConvert;

  const coachRef = useMemo(() => {
    const parsed = coachTodayIso ? Date.parse(coachTodayIso) : Number.NaN;
    return Number.isFinite(parsed) ? new Date(parsed) : getAppNow();
  }, [coachTodayIso]);

  const rowBefore = useMemo(
    () => rowHeadingForSessionDateLabel(before?.date, coachRef),
    [before?.date, coachRef],
  );
  const rowAfter = useMemo(() => rowHeadingForSessionDateLabel(after?.date, coachRef), [after?.date, coachRef]);

  const lowConf = confidence === "low" ? " Zuordnung ist unsicher — bitte kurz prüfen." : "";

  return (
    <div
      style={{
        background: "rgba(15,23,42,0.82)",
        border: "1px solid rgba(148,163,184,0.18)",
        borderRadius: 16,
        padding: "12px 12px",
        color: "#dbeafe",
        maxWidth: 520,
      }}
    >
      <div style={{ fontSize: 14, fontWeight: 900, color: "#fff" }}>
        {isConvert ? "Training konvertieren" : "Training ersetzen"}
      </div>

      {coachFeedback ? (
        <div
          style={{
            marginTop: 10,
            fontSize: 12,
            lineHeight: 1.55,
            color: "#cbd5e1",
          }}
        >
          {coachFeedback}
        </div>
      ) : null}

      <div
        style={{
          marginTop: 12,
          display: "grid",
          gridTemplateColumns: "1fr auto 1fr",
          gap: 10,
          alignItems: "center",
          fontSize: 13,
        }}
      >
        <div style={{ fontWeight: 800, fontSize: 11, letterSpacing: "0.08em", color: "#94a3b8", textTransform: "uppercase" }}>
          Vorher
        </div>
        <div style={{ textAlign: "center", color: "#64748b", fontWeight: 900 }}>→</div>
        <div style={{ fontWeight: 800, fontSize: 11, letterSpacing: "0.08em", color: "#94a3b8", textTransform: "uppercase" }}>
          Nachher
        </div>

        <div
          style={{
            borderRadius: 12,
            padding: "10px 10px",
            border: "1px solid rgba(56,189,248,0.28)",
            background: "rgba(56,189,248,0.06)",
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 900, color: "#7dd3fc", textTransform: "uppercase" }}>{rowBefore}</div>
          <div style={{ marginTop: 6, fontWeight: 880, color: "#f8fafc" }}>
            {before?.type === "rest" ? "Ruhetag" : before?.title || "—"}
          </div>
          <div style={{ marginTop: 6, fontSize: 12, color: "#cbd5e1", lineHeight: 1.45 }}>{metricsLine(before)}</div>
          {before?.date ? <div style={{ marginTop: 6, fontSize: 11, color: "#64748b" }}>{before.date}</div> : null}
        </div>

        <div />

        <div
          style={{
            borderRadius: 12,
            padding: "10px 10px",
            border: "1px solid rgba(167,139,250,0.35)",
            background: "rgba(167,139,250,0.07)",
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 900, color: "#e9d5ff", textTransform: "uppercase" }}>{rowAfter}</div>
          <div style={{ marginTop: 6, fontWeight: 880, color: "#f8fafc" }}>
            {after?.type === "rest" ? "Ruhetag" : after?.title || "—"}
          </div>
          <div style={{ marginTop: 6, fontSize: 12, color: "#cbd5e1", lineHeight: 1.45 }}>{metricsLine(after)}</div>
          {after?.date ? <div style={{ marginTop: 6, fontSize: 11, color: "#64748b" }}>{after.date}</div> : null}
        </div>
      </div>

      {lowConf ? (
        <div
          style={{
            marginTop: 12,
            padding: "10px 11px",
            borderRadius: 12,
            background: "rgba(251,191,36,0.10)",
            border: "1px solid rgba(251,191,36,0.32)",
          }}
        >
          <div style={{ fontSize: 12, lineHeight: 1.55, color: "#fcd34d", fontWeight: 650 }}>
            ⚠️{lowConf}
          </div>
        </div>
      ) : null}

      <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={onConfirm}
          disabled={!canConfirm}
          style={{
            background: "linear-gradient(135deg,#10b981,#3b82f6)",
            border: "none",
            color: "#fff",
            borderRadius: 12,
            padding: "10px 12px",
            fontSize: 13,
            fontWeight: 850,
            cursor: canConfirm ? "pointer" : "not-allowed",
          }}
        >
          {isConvert ? "Konvertieren ✓" : "Ersetzen ✓"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          style={{
            background: "rgba(15,23,42,0.85)",
            border: "1px solid rgba(148,163,184,0.2)",
            color: "#cbd5e1",
            borderRadius: 12,
            padding: "10px 12px",
            fontSize: 13,
            fontWeight: 750,
            cursor: "pointer",
          }}
        >
          Abbrechen
        </button>
      </div>
    </div>
  );
}
