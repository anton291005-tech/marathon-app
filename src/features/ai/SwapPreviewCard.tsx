import { useMemo } from "react";
import { parseSessionDateLabel } from "../../appSmartFeatures";
import { getAppNow } from "../../core/time/timeSystem";

type Props = {
  source: any;
  target: any;
  /** Coach wall-clock (e.g. context.todayIso) — used for «Heute»/«Morgen» row labels and summary line. */
  coachTodayIso?: string;
  confidence?: "high" | "low";
  /** Hinweise (Belastung/Reihenfolge); blockieren den Tausch nie. */
  coachHints?: string[];
  validation?: {
    status: "allow" | "warn" | "block";
    axes?: {
      structural?: { score: number; reason?: string };
      load?: { score: number; reason?: string };
      recovery?: { score: number; reason?: string };
      micro?: { score: number; reason?: string };
    };
  } | null;
  sourcePhaseLabel?: string | null;
  targetPhaseLabel?: string | null;
  onConfirm: () => void;
  onConfirmWithOverride?: (overrideAccepted: boolean) => void;
  onCancel: () => void;
};

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function rowHeadingForSessionDateLabel(dateLabel: string | undefined, coachRef: Date): string {
  if (!dateLabel) return "Einheit";
  const d = parseSessionDateLabel(dateLabel);
  if (!d) return "Einheit";
  const sd = startOfLocalDay(d);
  const rd = startOfLocalDay(coachRef);
  const diff = Math.round((sd.getTime() - rd.getTime()) / 86400000);
  if (diff === 0) return "Heute";
  if (diff === 1) return "Morgen";
  if (diff === 2) return "Übermorgen";
  if (diff === -1) return "Gestern";
  const short = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"][sd.getDay()] ?? "";
  return `${short} ${dateLabel}`.trim();
}

function summarizeSessionLine(session: any): string {
  if (!session) return "—";
  if (session.type === "rest") return "Ruhetag";
  const km = typeof session.km === "number" && session.km > 0 ? `${session.km} km` : "";
  const title = typeof session.title === "string" ? session.title : "Training";
  return `${km} ${title}`.replace(/\s+/g, " ").trim();
}

/** Distance / duration line; Ruhetag is explicit. */
function metricsLine(session: any): string {
  if (!session) return "—";
  if (session.type === "rest") return "Ruhetag";
  const parts: string[] = [];
  if (typeof session.km === "number" && session.km > 0) parts.push(`${session.km} km`);
  if (typeof session.pace === "string" && session.pace.trim()) parts.push(session.pace.trim());
  if (typeof session.desc === "string" && session.desc.trim().length > 0 && parts.length === 0) {
    parts.push(session.desc.trim().slice(0, 80));
  }
  return parts.length ? parts.join(" · ") : "—";
}

function clamp01_100(score: number): number {
  const n = Number(score);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function RiskBar({
  label,
  color,
  score,
  reason,
}: {
  label: string;
  color: string;
  score: number;
  reason?: string;
}) {
  const s = clamp01_100(score);
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <div style={{ fontSize: 11, fontWeight: 850, letterSpacing: "0.08em", textTransform: "uppercase", color: "#94a3b8" }}>
          {label}
        </div>
        <div style={{ fontSize: 12, fontWeight: 850, color }}>{s}/100</div>
      </div>
      <div
        style={{
          marginTop: 6,
          height: 10,
          borderRadius: 999,
          background: "rgba(148,163,184,0.16)",
          border: "1px solid rgba(148,163,184,0.18)",
          overflow: "hidden",
        }}
        title={reason || ""}
      >
        <div
          style={{
            height: "100%",
            width: `${s}%`,
            background: `linear-gradient(90deg, ${color}, rgba(59,130,246,0.75))`,
          }}
        />
      </div>
      {reason ? (
        <div style={{ marginTop: 6, fontSize: 12, lineHeight: 1.45, color: "#cbd5e1", opacity: 0.9 }}>
          {reason}
        </div>
      ) : null}
    </div>
  );
}

export function SwapPreviewCard({
  source,
  target,
  coachTodayIso,
  confidence,
  coachHints,
  validation,
  sourcePhaseLabel,
  targetPhaseLabel,
  onConfirm,
  onConfirmWithOverride,
  onCancel,
}: Props) {
  const rawStatus = validation?.status ?? "allow";
  /** Legacy/nested validation may still pass "block" — UI behandelt das wie eine Warnung, ohne Sperre. */
  const status = rawStatus === "block" ? "warn" : rawStatus;
  const axes = validation?.axes || {};
  const lowConfidenceHint =
    confidence === "low"
      ? [
          "⚠️ Hinweis: Die Zuordnung der beiden Einheiten ist weniger sicher — bitte die Tage kurz gegenprüfen. Du kannst den Tausch trotzdem durchführen.",
        ]
      : [];
  const hintsAbove = Array.from(new Set([...(coachHints || []), ...lowConfidenceHint]));
  const confirmLabel = "Bestätigen";
  const onConfirmClick = () => {
    if (onConfirmWithOverride) onConfirmWithOverride(true);
    else onConfirm();
  };
  const phaseBadge = useMemo(() => {
    const a = sourcePhaseLabel || "—";
    const b = targetPhaseLabel || "—";
    return `${a} → ${b}`;
  }, [sourcePhaseLabel, targetPhaseLabel]);

  const coachRef = useMemo(() => {
    const parsed = coachTodayIso ? Date.parse(coachTodayIso) : Number.NaN;
    return Number.isFinite(parsed) ? new Date(parsed) : getAppNow();
  }, [coachTodayIso]);

  const rowSourceHeading = useMemo(
    () => rowHeadingForSessionDateLabel(source?.date, coachRef),
    [source?.date, coachRef],
  );
  const rowTargetHeading = useMemo(
    () => rowHeadingForSessionDateLabel(target?.date, coachRef),
    [target?.date, coachRef],
  );
  const relativeSummaryLine = useMemo(() => {
    const a = summarizeSessionLine(source);
    const b = summarizeSessionLine(target);
    return `${rowSourceHeading} (${a}) ↔ ${rowTargetHeading} (${b})`;
  }, [source, target, rowSourceHeading, rowTargetHeading]);
  const statusBadge =
    status === "warn"
      ? { text: "WARN", bg: "rgba(251,191,36,0.12)", border: "rgba(251,191,36,0.28)", color: "#fbbf24" }
      : { text: "ALLOW", bg: "rgba(52,211,153,0.10)", border: "rgba(52,211,153,0.22)", color: "#34d399" };

  const loadScore = axes.load?.score;
  const microScore = axes.micro?.score;
  const intensityConflict =
    status === "warn" ||
    (typeof loadScore === "number" && loadScore < 60) ||
    (typeof microScore === "number" && microScore < 60);

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
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <div style={{ fontSize: 14, fontWeight: 900, color: "#fff" }}>Training tauschen?</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 850,
              padding: "4px 8px",
              borderRadius: 999,
              background: "rgba(148,163,184,0.12)",
              border: "1px solid rgba(148,163,184,0.22)",
              color: "#cbd5e1",
              whiteSpace: "nowrap",
            }}
            title="Phasenwechsel (periodization)"
          >
            {phaseBadge}
          </div>
          {confidence === "low" ? (
          <div
            style={{
              fontSize: 11,
              fontWeight: 800,
              padding: "4px 8px",
              borderRadius: 999,
              background: "rgba(251,191,36,0.16)",
              border: "1px solid rgba(251,191,36,0.35)",
              color: "#fbbf24",
              whiteSpace: "nowrap",
            }}
            title="Tausch beinhaltet evtl. Ruhetag oder niedrige Sicherheit."
          >
            niedrige Sicherheit
          </div>
        ) : null}
        </div>
      </div>
      <div
        style={{
          marginTop: 8,
          fontSize: 12,
          lineHeight: 1.45,
          color: "#e2e8f0",
          fontWeight: 750,
          padding: "8px 10px",
          borderRadius: 10,
          background: "rgba(30,41,59,0.65)",
          border: "1px solid rgba(148,163,184,0.14)",
        }}
      >
        {relativeSummaryLine}
      </div>
      <div
        style={{
          marginTop: 12,
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 12,
          fontSize: 13,
          alignItems: "stretch",
        }}
      >
        <div
          style={{
            borderRadius: 12,
            padding: "10px 10px",
            border: "1px solid rgba(56,189,248,0.28)",
            background: "rgba(56,189,248,0.06)",
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.06em", color: "#7dd3fc", textTransform: "uppercase" }}>
            {rowSourceHeading}
          </div>
          <div style={{ marginTop: 6, fontWeight: 880, color: "#f8fafc" }}>{source?.type === "rest" ? "Ruhetag" : source?.title || "—"}</div>
          <div style={{ marginTop: 6, fontSize: 12, color: "#cbd5e1", lineHeight: 1.45 }}>{metricsLine(source)}</div>
          {source?.date ? <div style={{ marginTop: 6, fontSize: 11, color: "#64748b" }}>{source.date}</div> : null}
        </div>
        <div
          style={{
            borderRadius: 12,
            padding: "10px 10px",
            border: "1px solid rgba(167,139,250,0.35)",
            background: "rgba(167,139,250,0.07)",
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.06em", color: "#e9d5ff", textTransform: "uppercase" }}>
            {rowTargetHeading}
          </div>
          <div style={{ marginTop: 6, fontWeight: 880, color: "#f8fafc" }}>{target?.type === "rest" ? "Ruhetag" : target?.title || "—"}</div>
          <div style={{ marginTop: 6, fontSize: 12, color: "#cbd5e1", lineHeight: 1.45 }}>{metricsLine(target)}</div>
          {target?.date ? <div style={{ marginTop: 6, fontSize: 11, color: "#64748b" }}>{target.date}</div> : null}
        </div>
      </div>

      <div style={{ marginTop: 10, display: "flex", justifyContent: "flex-end" }}>
        <div
          style={{
            fontSize: 11,
            fontWeight: 900,
            padding: "4px 10px",
            borderRadius: 999,
            background: statusBadge.bg,
            border: `1px solid ${statusBadge.border}`,
            color: statusBadge.color,
            letterSpacing: "0.08em",
          }}
          title="Finale Entscheidung"
        >
          {statusBadge.text}
        </div>
      </div>

      <div style={{ marginTop: 2 }}>
        {axes.structural ? (
          <RiskBar label="Structural risk" color="#60a5fa" score={axes.structural.score} reason={axes.structural.reason} />
        ) : null}
        {axes.load ? <RiskBar label="Load risk" color="#fb923c" score={axes.load.score} reason={axes.load.reason} /> : null}
        {axes.recovery ? (
          <RiskBar label="Recovery risk" color="#a78bfa" score={axes.recovery.score} reason={axes.recovery.reason} />
        ) : null}
        {axes.micro ? <RiskBar label="Micro risk" color="#f87171" score={axes.micro.score} reason={axes.micro.reason} /> : null}
      </div>

      {intensityConflict ? (
        <div
          style={{
            marginTop: 12,
            padding: "10px 11px",
            borderRadius: 12,
            background: "rgba(251,191,36,0.14)",
            border: "1px solid rgba(251,191,36,0.4)",
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 850, color: "#fcd34d", lineHeight: 1.55 }}>
            Hinweis: Mögliche Intensitäts- oder Belastungskonsequenzen — du kannst den Tausch trotzdem bestätigen.
          </div>
        </div>
      ) : null}

      {hintsAbove.length ? (
        <div
          style={{
            marginTop: 12,
            padding: "10px 11px",
            borderRadius: 12,
            background: "rgba(251,191,36,0.10)",
            border: "1px solid rgba(251,191,36,0.32)",
          }}
        >
          {hintsAbove.map((line) => (
            <div
              key={line}
              style={{
                fontSize: 12,
                lineHeight: 1.5,
                color: "#fcd34d",
                fontWeight: 650,
                marginTop: line === hintsAbove[0] ? 0 : 8,
              }}
            >
              {line}
            </div>
          ))}
        </div>
      ) : null}

      <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={onConfirmClick}
          style={{
            background: "linear-gradient(135deg,#10b981,#3b82f6)",
            border: "none",
            color: "#fff",
            borderRadius: 12,
            padding: "10px 12px",
            fontSize: 13,
            fontWeight: 850,
            cursor: "pointer",
          }}
        >
          {confirmLabel}
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

