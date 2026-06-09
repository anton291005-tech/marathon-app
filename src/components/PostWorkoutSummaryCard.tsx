import React, { useEffect, useState } from "react";
import type { PostWorkoutHrPresentation, PostWorkoutSummary } from "../hooks/usePostWorkoutSummary";
import { normalizePostWorkoutSummary } from "../hooks/usePostWorkoutSummary";
import { ZONE_BPM } from "../trainingIntelligence/zoneBpmDisplay";
import { shouldUseIntervalScoring } from "../utils/workoutEvaluationGuards";
import { compareHR, comparePace } from "../lib/training/compareActualToPlanned";
import { fmtBikePlannedDuration } from "../utils/bikeDurationParser";

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function scoreColor(score: number): string {
  if (score >= 80) return "#10b981";
  if (score >= 60) return "#f59e0b";
  return "#ef4444";
}

function statusColor(status: "green" | "yellow" | "red" | "na"): string {
  if (status === "green") return "#10b981";
  if (status === "yellow") return "#f59e0b";
  if (status === "red") return "#ef4444";
  return "rgba(148,163,184,0.45)";
}

function fmtKm(v: number | null): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${(Math.round(v * 10) / 10).toFixed(1)} km`;
}

function fmtPaceSec(secPerKm: number | null): string {
  if (secPerKm == null || !Number.isFinite(secPerKm) || secPerKm <= 1) return "—";
  const s = Math.round(secPerKm);
  const mm = Math.floor(s / 60);
  const ss = String(s % 60).padStart(2, "0");
  return `${mm}:${ss}/km`;
}

function fmtDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function fmtHrActual(bpm: number | null): string {
  if (bpm == null || !Number.isFinite(bpm) || bpm <= 0) return "Keine Daten";
  return `${Math.round(bpm)} bpm`;
}

function renderHrActualNode(
  presentation: PostWorkoutHrPresentation | undefined,
  fallbackBpm: number | null,
): React.ReactNode {
  if (presentation) {
    if (presentation.kind === "bpm") return `${presentation.value} bpm`;
    if (presentation.kind === "loading") return "Wird geladen...";
    if (presentation.kind === "no_data") return "Keine Daten";
    return (
      <button
        type="button"
        onClick={presentation.onPress}
        style={{
          margin: 0,
          padding: "6px 10px",
          borderRadius: 10,
          border: "1px solid rgba(59,130,246,0.45)",
          background: "rgba(59,130,246,0.12)",
          color: "#93c5fd",
          fontSize: 12,
          fontWeight: 800,
          cursor: "pointer",
          maxWidth: "100%",
        }}
      >
        Puls-Zugriff erlauben
      </button>
    );
  }
  return fmtHrActual(fallbackBpm);
}

function fmtPaceRange(range: { min: number; max: number } | null): string {
  if (!range) return "—";
  return `${fmtPaceSec(range.min)}–${fmtPaceSec(range.max)}`;
}

function paceCompareExtra(
  actual: number | null,
  planned: { min: number; max: number } | null,
): { text: string; color: string } | null {
  const res = comparePace(actual ?? null, planned?.min ?? null, planned?.max ?? null);
  if (res.status === "unknown") return null;
  if (res.status === "in_range") return { text: res.label, color: "#10b981" };
  if (res.status === "faster") return { text: res.label, color: "#f59e0b" };
  return { text: res.label, color: "#ef4444" };
}

function hrCompareExtra(actual: number | null, planned: { min: number; max: number } | null): { text: string; color: string } | null {
  const res = compareHR(actual ?? null, planned?.min ?? null, planned?.max ?? null);
  if (res.status === "unknown") return null;
  if (res.status === "in_range") return { text: res.label, color: "#10b981" };
  if (res.status === "above") return { text: res.label, color: res.deltaBpm <= 2 ? "#f59e0b" : "#ef4444" };
  return { text: res.label, color: "#f59e0b" };
}

function intervalPaceDeltaVersusTarget(
  intervalAvgSec: number | null,
  targetSec: number | null,
): { text: string; color: string } | null {
  if (
    intervalAvgSec == null ||
    targetSec == null ||
    !Number.isFinite(intervalAvgSec) ||
    !Number.isFinite(targetSec) ||
    intervalAvgSec <= 0 ||
    targetSec <= 0
  ) {
    return null;
  }
  const d = Math.round(intervalAvgSec - targetSec);
  const abs = Math.abs(d);
  if (abs <= 10) return { text: "Tempo im Plan (Intervalle)", color: "#10b981" };
  const sign = d > 0 ? "+" : "−";
  const color = abs <= 20 ? "#f59e0b" : "#ef4444";
  return { text: `${sign}${abs}s/km vs Ziel`, color };
}

const RING_R = 50;
const RING_CX = 62;
const RING_CY = 62;
const RING_SIZE = 124;
const RING_STROKE = 9;
const RING_CIRC = 2 * Math.PI * RING_R;

function ScoreRing({
  score,
  color,
  animate,
}: {
  score: number;
  color: string;
  animate: boolean;
}) {
  const clamped = clamp(Math.round(score), 0, 100);
  const targetOffset = Math.max(0, RING_CIRC * (1 - clamped / 100));

  return (
    <svg
      width={RING_SIZE}
      height={RING_SIZE}
      viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}
      style={{ display: "block" }}
      aria-hidden
    >
      {/* muted background track */}
      <circle
        cx={RING_CX}
        cy={RING_CY}
        r={RING_R}
        fill="none"
        stroke="rgba(148,163,184,0.14)"
        strokeWidth={RING_STROKE}
      />
      {/* animated foreground arc */}
      <circle
        cx={RING_CX}
        cy={RING_CY}
        r={RING_R}
        fill="none"
        stroke={color}
        strokeWidth={RING_STROKE}
        strokeLinecap="round"
        strokeDasharray={RING_CIRC}
        strokeDashoffset={animate ? targetOffset : RING_CIRC}
        style={{
          transformOrigin: `${RING_CX}px ${RING_CY}px`,
          transform: "rotate(-90deg)",
          transition: animate ? "stroke-dashoffset 1.2s ease-out" : "none",
        }}
      />
      {/* score number */}
      <text
        x={RING_CX}
        y={RING_CY - 3}
        textAnchor="middle"
        dominantBaseline="central"
        fill="#f8fafc"
        fontSize={30}
        fontWeight={900}
        style={{ fontFamily: "system-ui,-apple-system,sans-serif" }}
      >
        {clamped}
      </text>
      {/* /100 label */}
      <text
        x={RING_CX}
        y={RING_CY + 19}
        textAnchor="middle"
        dominantBaseline="central"
        fill="rgba(148,163,184,0.7)"
        fontSize={12}
        fontWeight={700}
        style={{ fontFamily: "system-ui,-apple-system,sans-serif" }}
      >
        /100
      </text>
    </svg>
  );
}

function StatusDot({ status }: { status: "green" | "yellow" | "red" | "na" }) {
  return (
    <span
      aria-hidden
      style={{
        display: "inline-block",
        width: 8,
        height: 8,
        borderRadius: "50%",
        background: statusColor(status),
        flexShrink: 0,
      }}
    />
  );
}

function MetricTile({
  label,
  planned,
  actual,
  status,
  extra,
  compactActual,
  hidePlanned,
}: {
  label: string;
  planned: string;
  actual: React.ReactNode;
  status: "green" | "yellow" | "red" | "na";
  extra?: { text: string; color: string } | null;
  compactActual?: boolean;
  hidePlanned?: boolean;
}) {
  return (
    <div
      style={{
        borderRadius: 14,
        background: "rgba(15,23,42,0.65)",
        border: "1px solid rgba(148,163,184,0.1)",
        padding: "10px 9px 11px",
        minWidth: 0,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 4,
          marginBottom: 7,
        }}
      >
        <span
          style={{
            fontSize: 10,
            fontWeight: 900,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: "rgba(148,163,184,0.7)",
          }}
        >
          {label}
        </span>
        <StatusDot status={status} />
      </div>
      {!hidePlanned && (
        <>
          <div
            style={{
              fontSize: 10,
              color: "rgba(148,163,184,0.55)",
              marginBottom: 2,
            }}
          >
            Geplant
          </div>
          <div
            style={{
              fontSize: 11,
              color: "#94a3b8",
              fontWeight: 700,
              marginBottom: 7,
              lineHeight: 1.35,
              wordBreak: "break-word",
              overflowWrap: "break-word",
            }}
          >
            {planned}
          </div>
        </>
      )}
      <div
        style={{
          fontSize: 10,
          color: "rgba(148,163,184,0.55)",
          marginBottom: 2,
        }}
      >
        Ist
      </div>
      <div
        style={{
          fontSize: compactActual ? 14 : 17,
          color: "#f8fafc",
          fontWeight: 900,
          lineHeight: 1.25,
          minWidth: 0,
          maxWidth: "100%",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {actual}
      </div>
      {extra && (
        <div
          style={{
            fontSize: 11,
            color: extra.color,
            fontWeight: 800,
            marginTop: 5,
          }}
        >
          {extra.text}
        </div>
      )}
    </div>
  );
}

export function PostWorkoutSummaryCard(props: {
  open: boolean;
  summary: PostWorkoutSummary;
  onDone: () => void;
}) {
  const [ringFilled, setRingFilled] = useState(false);

  useEffect(() => {
    if (!props.open) {
      setRingFilled(false);
      return;
    }
    const t = setTimeout(() => setRingFilled(true), 80);
    return () => clearTimeout(t);
  }, [props.open]);

  useEffect(() => {
    if (!props.open) return;
    const { summary } = props;
    // eslint-disable-next-line no-console
    console.log("[PWS-DIAG:PACE] PostWorkoutSummaryCard — props.summary on mount", summary);
    // eslint-disable-next-line no-console
    console.log("[PWS-DIAG:PACE] PostWorkoutSummaryCard — pace fields", {
      "summary.actual.intervalPaceSec (alias)": summary.intervalDisplay?.avgPaceSecPerKm ?? null,
      "summary.intervalDisplay?.avgPaceSecPerKm": summary.intervalDisplay?.avgPaceSecPerKm ?? null,
      "summary.planned.pace (alias)": summary.planned.paceSecPerKm ?? null,
      "summary.planned.paceSecPerKm": summary.planned.paceSecPerKm ?? null,
      "summary.actual.pace (alias)": summary.actual.paceSecPerKm ?? null,
      "summary.actual.paceSecPerKm": summary.actual.paceSecPerKm ?? null,
      intervalDisplay: summary.intervalDisplay ?? null,
    });
    // eslint-disable-next-line no-console
    console.log("[PWS-DIAG:HR] PostWorkoutSummaryCard — planned HR received", {
      hrZoneLabel: summary.planned.hrZoneLabel ?? null,
      hrBpm: summary.planned.hrBpm ?? null,
      maxHeartRateBpm: summary.maxHeartRateBpm ?? null,
    });
  }, [props.open, props.summary]);

  if (!props.open) return null;

  const summary = normalizePostWorkoutSummary(props.summary);
  if (!summary) return null;

  const adherenceScore = summary.adherence.score;
  const sessionInterval = shouldUseIntervalScoring({
    sessionType: summary.session.type,
    sessionTitle: summary.session.title,
    planDescription:
      [summary.session.desc, summary.session.paceLabel].filter(Boolean).join(" · ") || null,
  });
  const summaryIsInterval = !!summary.intervalDisplay && sessionInterval;

  // Umsetzung ring uses weighted adherence (pace + distance + HR), not raw interval intensity alone.
  const score = adherenceScore;
  const sc = scoreColor(score);
  const statuses = summary.adherence.statuses;

  const isBikeSession = summary.session?.type === "bike";

  const paceTilePlannedRaw = summaryIsInterval
    ? fmtPaceSec(summary.intervalDisplay?.targetPaceSecPerKm ?? null)
    : fmtPaceRange(summary.planned.paceSecPerKm);
  const paceTileActualRaw = summaryIsInterval
    ? fmtPaceSec(summary.intervalDisplay?.avgPaceSecPerKm ?? null)
    : fmtPaceSec(summary.actual.paceSecPerKm);

  const paceTilePlanned = isBikeSession
    ? fmtBikePlannedDuration(summary.session.desc ?? undefined)
    : summaryIsInterval
      ? paceTilePlannedRaw === "—"
        ? "—"
        : `Ziel: ${paceTilePlannedRaw}/km`
      : paceTilePlannedRaw;

  const paceTileActual = isBikeSession
    ? (summary.actual.durationSec != null
        ? fmtDuration(summary.actual.durationSec)
        : "—")
    : summaryIsInterval
      ? paceTileActualRaw
      : fmtPaceSec(summary.actual.paceSecPerKm);

  const paceTileLabel = isBikeSession ? "ZEIT" : summaryIsInterval ? "Intervall-Pace" : "Pace";

  const deltaExtra = isBikeSession
    ? null
    : summaryIsInterval
      ? intervalPaceDeltaVersusTarget(
          summary.intervalDisplay?.avgPaceSecPerKm ?? null,
          summary.intervalDisplay?.targetPaceSecPerKm ?? null,
        )
      : paceCompareExtra(summary.actual.paceSecPerKm, summary.planned.paceSecPerKm);

  const hrPresentationBpm =
    summary.hrPresentation?.kind === "bpm" ? summary.hrPresentation.value : null;
  const hrCompareActual =
    hrPresentationBpm ??
    (summary.actual.hrBpm != null &&
    Number.isFinite(summary.actual.hrBpm) &&
    summary.actual.hrBpm > 0
      ? summary.actual.hrBpm
      : null);
  const plannedHrDisplay =
    ZONE_BPM[summary.planned.hrZoneLabel as string] ??
    summary.planned.hrZoneLabel ??
    "–";

  const hrDeltaExtra =
    summary.hrPresentation?.kind === "loading" ||
    summary.hrPresentation?.kind === "open_settings" ||
    summary.hrPresentation?.kind === "no_data"
      ? null
      : hrCompareExtra(hrCompareActual, summary.planned.hrBpm ?? null);

  const rawCoachMsg =
    summary.ai?.coach?.message ??
    summary.fallbackIntervalCoachMessage ??
    null;
  const isInsufficientMsg =
    !rawCoachMsg ||
    rawCoachMsg.toLowerCase().includes("insufficient data") ||
    rawCoachMsg.toLowerCase().includes("insufficient");
  const coachMessage = isInsufficientMsg ? null : rawCoachMsg;

  const scoreLabel =
    score >= 80 ? "Stark umgesetzt" : score >= 60 ? "Solide" : "Deutlich off-plan";

  return (
    <>
      <style>{`
        @keyframes pws-slide-up {
          0%   { opacity: 0; transform: translateY(52px) scale(0.98); }
          100% { opacity: 1; transform: translateY(0)    scale(1); }
        }
        @keyframes pws-check {
          0%   { stroke-dashoffset: 1; opacity: 0; }
          25%  { opacity: 1; }
          100% { stroke-dashoffset: 0; opacity: 1; }
        }
      `}</style>

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Workout-Zusammenfassung"
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 1200,
          background: "rgba(2,6,23,0.72)",
          backdropFilter: "blur(8px)",
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "center",
          boxSizing: "border-box",
          paddingBottom: "calc(100px + env(safe-area-inset-bottom, 0px))",
        }}
      >
        <div
          style={{
            width: "min(680px, 100%)",
            maxHeight: `calc(100dvh - env(safe-area-inset-top, 24px) - 16px)`,
            borderRadius: "22px 22px 0 0",
            background: "linear-gradient(180deg, #0d1526 0%, #080c17 100%)",
            border: "1px solid rgba(148,163,184,0.13)",
            borderBottom: "none",
            overflow: "hidden",
            animation: "pws-slide-up 360ms cubic-bezier(0.34,1.56,0.64,1) both",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {/* ── Header ── */}
          <div
            style={{
              padding: "20px 20px 14px",
              display: "flex",
              alignItems: "flex-start",
              gap: 12,
            }}
          >
            <div style={{ flexShrink: 0, marginTop: 1 }}>
              <svg width="36" height="36" viewBox="0 0 36 36" aria-hidden>
                <circle
                  cx="18"
                  cy="18"
                  r="16"
                  fill="rgba(16,185,129,0.13)"
                  stroke="rgba(16,185,129,0.38)"
                  strokeWidth="1.5"
                />
                <path
                  d="M9.5 18.5 L15.5 24 L26.5 12"
                  fill="none"
                  stroke="#10b981"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  pathLength={1}
                  style={{
                    strokeDasharray: 1,
                    strokeDashoffset: 1,
                    animation:
                      "pws-check 600ms 120ms cubic-bezier(0.22,1,0.36,1) forwards",
                  }}
                />
              </svg>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 10,
                  textTransform: "uppercase",
                  letterSpacing: "0.12em",
                  color: "rgba(148,163,184,0.7)",
                  fontWeight: 800,
                }}
              >
                Workout abgeschlossen
              </div>
              <div
                style={{
                  fontSize: 17,
                  fontWeight: 850,
                  color: "#f8fafc",
                  marginTop: 4,
                  lineHeight: 1.2,
                  overflowWrap: "break-word",
                  wordBreak: "break-word",
                }}
              >
                {summary.session.title}
              </div>
              <div
                style={{
                  fontSize: 13,
                  color: "rgba(148,163,184,0.75)",
                  marginTop: 3,
                }}
              >
                {summary.session.dateLabel}
              </div>
            </div>
          </div>

          {/* ── Scrollable body ── */}
          <div
            style={{
              flex: 1,
              minHeight: 0,
              overflowY: "auto",
              padding: "0 18px",
            }}
          >
            {/* Score ring */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                paddingTop: 4,
                paddingBottom: 20,
              }}
            >
              <div
                style={{
                  fontSize: 10,
                  textTransform: "uppercase",
                  letterSpacing: "0.12em",
                  color: "rgba(148,163,184,0.6)",
                  fontWeight: 800,
                  marginBottom: 10,
                }}
              >
                Umsetzung
              </div>
              <ScoreRing score={score} color={sc} animate={ringFilled} />
              <div
                style={{
                  fontSize: 13,
                  color: "rgba(148,163,184,0.75)",
                  marginTop: 8,
                  fontWeight: 600,
                }}
              >
                {scoreLabel}
              </div>
            </div>

            {/* Metric tiles */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                gap: 8,
                marginBottom: 14,
              }}
            >
              <MetricTile
                label={paceTileLabel}
                planned={paceTilePlanned}
                actual={paceTileActual}
                status={statuses.pace}
                extra={deltaExtra}
                compactActual={summaryIsInterval && !isBikeSession}
              />
              <MetricTile
                label={isBikeSession ? "Gefahren" : "Distanz"}
                planned={fmtKm(summary.planned.distanceKm)}
                actual={fmtKm(summary.actual.distanceKm)}
                status={statuses.distance}
                hidePlanned={isBikeSession}
              />
              <MetricTile
                label="Puls"
                planned={plannedHrDisplay}
                actual={renderHrActualNode(summary.hrPresentation, summary.actual.hrBpm)}
                status={statuses.hr}
                extra={hrDeltaExtra}
              />
            </div>

            {/* AI Coach */}
            <div
              style={{
                marginBottom: 18,
                padding: "12px 14px",
                borderRadius: 14,
                background: "rgba(59,130,246,0.06)",
                border: "1px solid rgba(59,130,246,0.14)",
              }}
            >
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 900,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  color: "rgba(147,197,253,0.75)",
                  marginBottom: 7,
                }}
              >
                AI Coach
              </div>
              {coachMessage ? (
                <div
                  style={{
                    fontSize: 13,
                    color: "#e2e8f0",
                    lineHeight: 1.5,
                    fontWeight: 500,
                  }}
                >
                  {coachMessage}
                </div>
              ) : (
                <div
                  style={{
                    fontSize: 13,
                    color: "rgba(148,163,184,0.55)",
                    lineHeight: 1.5,
                    fontWeight: 400,
                  }}
                >
                  Zu wenig Daten für Analyse
                </div>
              )}
            </div>
          </div>

          {/* ── Footer ── */}
          <div
            style={{
              padding: `12px 18px calc(18px + env(safe-area-inset-bottom, 0px))`,
              borderTop: "1px solid rgba(148,163,184,0.1)",
              background: "rgba(2,6,23,0.18)",
            }}
          >
            <button
              type="button"
              onClick={props.onDone}
              style={{
                width: "100%",
                border: "none",
                background: "linear-gradient(180deg,#10b981,#059669)",
                color: "#fff",
                borderRadius: 14,
                padding: "14px",
                fontSize: 15,
                fontWeight: 900,
                cursor: "pointer",
                letterSpacing: "0.02em",
              }}
            >
              Fertig
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
