import { useEffect, useRef, useState } from "react";

// ---------------------------------------------------------------------------
// Public constants — Onboarding.tsx times its onComplete() call against these
// so the success/checkmark animation always finishes before the screen unmounts.
// ---------------------------------------------------------------------------

/** Hard ceiling for the simulated progress — never reaches 100% before the real response arrives. */
const PROGRESS_CAP_PERCENT = 92;
/** How long the fast "cap → 100%" ring animation + checkmark pop take, combined. */
export const PLAN_GENERATION_SUCCESS_ANIMATION_MS = 1100;

const RING_SIZE = 176;
const RING_STROKE = 12;
const RING_R = (RING_SIZE - RING_STROKE) / 2;
const RING_CX = RING_SIZE / 2;
const RING_CY = RING_SIZE / 2;
const RING_CIRC = 2 * Math.PI * RING_R;

type StatusStep = { max: number; text: string };

/** Ranges are matched against the current simulated percent, in order. */
const STATUS_STEPS: StatusStep[] = [
  { max: 10, text: "Analysiere dein Profil…" },
  { max: 25, text: "Erstelle Trainingsphasen…" },
  { max: 45, text: "Baue Basis-Phase…" },
  { max: 65, text: "Baue Aufbau-Phase…" },
  { max: 85, text: "Baue Peak- & Taper-Phase…" },
  { max: PROGRESS_CAP_PERCENT, text: "Letzter Feinschliff…" },
];

function statusTextForPercent(percent: number): string {
  for (const step of STATUS_STEPS) {
    if (percent <= step.max) return step.text;
  }
  return "Fast fertig…";
}

/** `20 + weekCount * 4`, clamped to [40, 200] seconds — matches typical phased-plan durations. */
export function estimatePlanGenerationSeconds(weekCount: number): number {
  return Math.min(200, Math.max(40, 20 + weekCount * 4));
}

function easeOutProgress(elapsedMs: number, estimatedSeconds: number): number {
  const estimatedMs = Math.max(1, estimatedSeconds * 1000);
  const fraction = Math.min(1, elapsedMs / estimatedMs);
  const eased = 1 - Math.pow(1 - fraction, 2);
  return Math.min(PROGRESS_CAP_PERCENT, eased * PROGRESS_CAP_PERCENT);
}

export type PlanGenerationPhase = "loading" | "success" | "error";

export type PlanGenerationLoadingScreenProps = {
  /** Estimated week count of the plan being generated — drives the progress pacing. */
  weekCount: number;
  phase: PlanGenerationPhase;
  errorMessage?: string | null;
  onRetry: () => void;
};

export function PlanGenerationLoadingScreen({
  weekCount,
  phase,
  errorMessage,
  onRetry,
}: PlanGenerationLoadingScreenProps) {
  const estimatedSeconds = estimatePlanGenerationSeconds(weekCount);
  const [percent, setPercent] = useState(0);
  const startTsRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);

  // Drive the capped ease-out progress while phase === "loading".
  useEffect(() => {
    if (phase !== "loading") return;
    startTsRef.current = null;

    const tick = (timestamp: number) => {
      if (startTsRef.current == null) startTsRef.current = timestamp;
      const elapsedMs = timestamp - startTsRef.current;
      setPercent(easeOutProgress(elapsedMs, estimatedSeconds));
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [phase, estimatedSeconds]);

  // Fast finish: jump the displayed number from wherever it was up to 100%.
  useEffect(() => {
    if (phase !== "success") return;
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    const raf = requestAnimationFrame(() => setPercent(100));
    return () => cancelAnimationFrame(raf);
  }, [phase]);

  const displayPercent = Math.round(percent);
  const dashOffset = Math.max(0, RING_CIRC * (1 - percent / 100));
  const statusText = phase === "error" ? "" : statusTextForPercent(displayPercent);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxSizing: "border-box",
        padding: "24px 16px calc(24px + env(safe-area-inset-bottom, 0px))",
        background: "var(--bg-primary)",
        color: "var(--text-primary)",
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif",
        WebkitFontSmoothing: "antialiased",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 420,
          borderRadius: 16,
          border: "1px solid var(--border-input)",
          background: "var(--bg-card)",
          boxShadow: "0 24px 48px var(--shadow)",
          padding: "40px 24px 28px",
          boxSizing: "border-box",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          textAlign: "center",
        }}
      >
        {phase === "error" ? (
          <>
            <div
              aria-hidden
              style={{
                width: 72,
                height: 72,
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "rgba(248, 113, 113, 0.14)",
                border: "1px solid rgba(248, 113, 113, 0.35)",
                marginBottom: 20,
                fontSize: 32,
              }}
            >
              ⚠️
            </div>
            <h2
              style={{
                margin: "0 0 8px",
                fontSize: 19,
                fontWeight: 800,
                letterSpacing: "-0.02em",
                color: "var(--text-primary)",
              }}
            >
              Etwas ist schiefgelaufen
            </h2>
            <p
              style={{
                margin: "0 0 24px",
                fontSize: 13,
                color: "var(--text-secondary)",
                lineHeight: 1.5,
              }}
            >
              {errorMessage ??
                "Dein Trainingsplan konnte nicht erstellt werden. Das kann an einer instabilen Verbindung liegen."}
            </p>
            <button
              type="button"
              onClick={onRetry}
              style={{
                width: "100%",
                padding: "14px 16px",
                fontSize: 15,
                fontWeight: 700,
                border: "none",
                borderRadius: 14,
                cursor: "pointer",
                color: "#fff",
                background: "linear-gradient(135deg, #10b981, #3b82f6)",
              }}
            >
              Erneut versuchen
            </button>
          </>
        ) : (
          <>
            <svg
              width={RING_SIZE}
              height={RING_SIZE}
              viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}
              style={{ display: "block", marginBottom: 24 }}
              aria-hidden
            >
              <defs>
                <linearGradient id="planGenRingGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#10b981" />
                  <stop offset="100%" stopColor="#3b82f6" />
                </linearGradient>
              </defs>
              <circle
                cx={RING_CX}
                cy={RING_CY}
                r={RING_R}
                fill="none"
                stroke="rgba(148,163,184,0.14)"
                strokeWidth={RING_STROKE}
              />
              <circle
                cx={RING_CX}
                cy={RING_CY}
                r={RING_R}
                fill="none"
                stroke="url(#planGenRingGradient)"
                strokeWidth={RING_STROKE}
                strokeLinecap="round"
                strokeDasharray={RING_CIRC}
                strokeDashoffset={dashOffset}
                style={{
                  transformOrigin: `${RING_CX}px ${RING_CY}px`,
                  transform: "rotate(-90deg)",
                  transition:
                    phase === "success"
                      ? `stroke-dashoffset ${PLAN_GENERATION_SUCCESS_ANIMATION_MS * 0.6}ms ease-out`
                      : "none",
                }}
              />
              {phase === "success" ? (
                <g
                  style={{
                    opacity: 1,
                    animation: "planGenCheckmarkPop 0.4s ease-out",
                    animationDelay: `${PLAN_GENERATION_SUCCESS_ANIMATION_MS * 0.55}ms`,
                    animationFillMode: "both",
                  }}
                >
                  <path
                    d={`M ${RING_CX - 22} ${RING_CY + 2} L ${RING_CX - 6} ${RING_CY + 18} L ${RING_CX + 24} ${RING_CY - 16}`}
                    fill="none"
                    stroke="#10b981"
                    strokeWidth={9}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </g>
              ) : (
                <text
                  x={RING_CX}
                  y={RING_CY}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fill="var(--text-primary)"
                  fontSize={34}
                  fontWeight={900}
                  style={{ fontFamily: "system-ui,-apple-system,sans-serif" }}
                >
                  {displayPercent}%
                </text>
              )}
            </svg>
            <style>{`
              @keyframes planGenCheckmarkPop {
                0% { opacity: 0; transform: scale(0.6); }
                60% { opacity: 1; transform: scale(1.08); }
                100% { opacity: 1; transform: scale(1); }
              }
            `}</style>

            <h2
              style={{
                margin: "0 0 6px",
                fontSize: 17,
                fontWeight: 700,
                color: "var(--text-primary)",
                minHeight: 22,
              }}
            >
              {phase === "success" ? "Dein Plan ist fertig!" : statusText}
            </h2>
            <p
              style={{
                margin: "16px 0 0",
                fontSize: 12,
                color: "var(--text-muted, var(--text-secondary))",
                lineHeight: 1.4,
              }}
            >
              Das kann je nach Trainingsplan-Länge bis zu 2-3 Minuten dauern
            </p>
          </>
        )}
      </div>
    </div>
  );
}
