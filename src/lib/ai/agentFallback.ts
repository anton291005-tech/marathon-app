/** Single source of truth for weak/invalid AI output normalization (coachAgent + handleAgentResponse). */
export const AGENT_WEAK_MESSAGE =
  "I recommend keeping your next run easy and monitoring how you feel. Are you fatigued or fresh today?";

/** Dev-only: surface silent degradation + rough quality rates without production noise */
let devCoachCycles = 0;
let devFallbacks = 0;
let devWeakChecks = 0;
let devWeakHits = 0;

/** Module-level anti-spam: identical thin fallback repetition */
let antiSpamLast = "";
let spamStreak = 0;

export type AgentFallbackReason = "invalid_json" | "invalid_shape" | "weak_message" | "tool_rejected";

export function onAgentFallback(reason: string): void {
  if (typeof process === "undefined" || process.env.NODE_ENV !== "development") return;
  devFallbacks += 1;
  const approxFallbackPct = devCoachCycles > 0 ? ((devFallbacks / devCoachCycles) * 100).toFixed(1) : "n/a";
  const weakRateAmongChecksPct = devWeakChecks > 0 ? ((devWeakHits / devWeakChecks) * 100).toFixed(1) : "n/a";
  // eslint-disable-next-line no-console
  console.warn("[AI FALLBACK]", reason, {
    approxFallbackPctOfCoachCycles: approxFallbackPct,
    weakDetectedPctOfMessageChecks: weakRateAmongChecksPct,
  });
}

export function recordCoachAgentCycleDev(): void {
  if (typeof process === "undefined" || process.env.NODE_ENV !== "development") return;
  devCoachCycles += 1;
}

export function recordThinMessageWeakCheckStartedDev(): void {
  if (typeof process === "undefined" || process.env.NODE_ENV !== "development") return;
  devWeakChecks += 1;
}

export function recordWeakMessageDetectedDev(): void {
  if (typeof process === "undefined" || process.env.NODE_ENV !== "development") return;
  devWeakHits += 1;
}

export function clamp(n: number, min: number, max: number): number {
  const x = Number.isFinite(n) ? n : min;
  return Math.min(max, Math.max(min, x));
}

export function isWeakMessage(msg: string): boolean {
  const lower = msg.toLowerCase();
  return (
    msg.length < 40 ||
    lower.includes("i need more data") ||
    lower.includes("cannot determine") ||
    lower.includes("not enough information")
  );
}

export function hasActionableContent(msg: string): boolean {
  return /recommend|reduce|increase|run|rest|adjust/i.test(msg);
}

/** Final thin envelope returned to callers (non-legacy agent path). */
export function normalizeThinEnvelope(
  message: unknown,
  confidence: unknown,
  followUp?: unknown,
): { message: string; confidence: number; followUp: string | null } {
  let m = typeof message === "string" ? message.trim() : String(message ?? "").trim();
  m = spiceAntiSpam(m);
  let c = typeof confidence === "number" && Number.isFinite(confidence) ? confidence : 0.3;
  c = clamp(c, 0, 1);
  const fu = typeof followUp === "string" && followUp.trim() ? followUp.trim() : null;
  return { message: m, confidence: c, followUp: fu };
}

function spiceAntiSpam(fullMessage: string): string {
  if (typeof process !== "undefined" && process.env.NODE_ENV !== "production") {
    if (fullMessage && fullMessage === antiSpamLast) {
      spamStreak += 1;
    } else {
      spamStreak = 1;
      antiSpamLast = fullMessage;
    }
    if (spamStreak > 2 && fullMessage) {
      return `${fullMessage} If this persists, retry with one concrete detail (recent run, ache, weekly volume).`;
    }
  }
  return fullMessage;
}

export function weakAgentMessagePayload(): { type: "message"; message: string; confidence: number } {
  return {
    type: "message",
    message: AGENT_WEAK_MESSAGE,
    confidence: 0.3,
  };
}

/** Return shape for callers that bypass `handleAgentResponse` inner branches (thin agent envelope). */
export function agentThinFallback(): { message: string; confidence: number } {
  return {
    message: AGENT_WEAK_MESSAGE,
    confidence: 0.3,
  };
}

/** Logged observable fallback outcome with canonical messaging + normalization. */
export function agentFallbackOutcome(reason: AgentFallbackReason | string): {
  message: string;
  confidence: number;
  followUp: string | null;
} {
  onAgentFallback(reason);
  const { message } = agentThinFallback();
  return normalizeThinEnvelope(message, 0.3, null);
}
