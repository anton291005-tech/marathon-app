import { useMemo, useState } from "react";
import { rowHeadingForSessionDateLabel } from "./SwapPreviewCard";
import { getAppNow } from "../../core/time/timeSystem";

type Props = {
  sourceCandidates: any[];
  targetCandidates: any[];
  coachTodayIso?: string;
  onConfirm: (sourceId: string, targetId: string) => void;
  onCancel: () => void;
};

function labelForSession(s: any, coachRef: Date): string {
  const heading = rowHeadingForSessionDateLabel(s?.date, coachRef);
  const title = typeof s?.title === "string" ? s.title : "Einheit";
  const km =
    typeof s?.km === "number" && s.km > 0 ? `${s.km} km` : s?.type === "rest" ? "Ruhetag" : "";
  const core = s?.type === "rest" ? "Ruhetag" : title;
  return `${heading}: ${core}${km ? ` · ${km}` : ""}`.trim();
}

export function SwapSelectionCard({ sourceCandidates, targetCandidates, coachTodayIso, onConfirm, onCancel }: Props) {
  const source = Array.isArray(sourceCandidates) ? sourceCandidates : [];
  const target = Array.isArray(targetCandidates) ? targetCandidates : [];

  const coachRef = useMemo(() => {
    const parsed = coachTodayIso ? Date.parse(coachTodayIso) : Number.NaN;
    return Number.isFinite(parsed) ? new Date(parsed) : getAppNow();
  }, [coachTodayIso]);

  // Local UI state (kept inside the card)
  const [sourceId, setSourceId] = useState<string | null>(null);
  const [targetId, setTargetId] = useState<string | null>(null);

  const canConfirm = typeof sourceId === "string" && typeof targetId === "string" && sourceId !== targetId;

  return (
    <div
      style={{
        background: "rgba(15,23,42,0.82)",
        border: "1px solid rgba(148,163,184,0.18)",
        borderRadius: 16,
        padding: "12px 12px",
        color: "#dbeafe",
        maxWidth: 620,
      }}
    >
      <div style={{ fontSize: 14, fontWeight: 900, color: "#fff" }}>Welche Einheiten meinst du?</div>
      <div style={{ marginTop: 6, fontSize: 12, color: "#94a3b8", lineHeight: 1.45 }}>
        Ich habe mehrere passende Treffer gefunden. Wähle bitte beide Einheiten aus.
      </div>

      <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr", gap: 12 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: "#7dd3fc" }}>
            Quelle (heute/nah)
          </div>
          <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>
            {source.slice(0, 5).map((s) => {
              const id = s?.id;
              if (typeof id !== "string") return null;
              const active = sourceId === id;
              return (
                <button
                  key={`swap-source-${id}`}
                  type="button"
                  onClick={() => setSourceId(id)}
                  style={{
                    textAlign: "left",
                    background: active ? "rgba(56,189,248,0.18)" : "rgba(9,13,24,0.9)",
                    border: `1px solid ${active ? "rgba(56,189,248,0.55)" : "rgba(148,163,184,0.18)"}`,
                    borderRadius: 12,
                    padding: "10px 10px",
                    color: active ? "#e0f2fe" : "#e2e8f0",
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  {labelForSession(s, coachRef)}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: "#a78bfa" }}>
            Ziel (nächste Woche)
          </div>
          <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>
            {target.slice(0, 5).map((s) => {
              const id = s?.id;
              if (typeof id !== "string") return null;
              const active = targetId === id;
              return (
                <button
                  key={`swap-target-${id}`}
                  type="button"
                  onClick={() => setTargetId(id)}
                  style={{
                    textAlign: "left",
                    background: active ? "rgba(167,139,250,0.18)" : "rgba(9,13,24,0.9)",
                    border: `1px solid ${active ? "rgba(167,139,250,0.6)" : "rgba(148,163,184,0.18)"}`,
                    borderRadius: 12,
                    padding: "10px 10px",
                    color: active ? "#f5f3ff" : "#e2e8f0",
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  {labelForSession(s, coachRef)}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={() => {
            if (!canConfirm) return;
            onConfirm(sourceId as string, targetId as string);
          }}
          disabled={!canConfirm}
          style={{
            background: canConfirm ? "linear-gradient(135deg,#10b981,#3b82f6)" : "rgba(30,41,59,0.5)",
            border: "none",
            color: canConfirm ? "#fff" : "#64748b",
            borderRadius: 12,
            padding: "10px 12px",
            fontSize: 13,
            fontWeight: 850,
            cursor: canConfirm ? "pointer" : "not-allowed",
          }}
        >
          Weiter
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

