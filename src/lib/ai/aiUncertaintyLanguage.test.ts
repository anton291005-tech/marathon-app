import { buildMockAiResponse } from "./mockBrain";
import type { AiContext } from "./types";
import type { RecoveryDomainState } from "../../recovery/recoveryDomainState";
import { buildRecoverySummaryFromDomain } from "./recoverySummary";

function ctxWithDomain(domain: RecoveryDomainState): AiContext {
  return {
    todayIso: new Date("2026-04-06T12:00:00Z").toISOString(),
    raceDateIso: null,
    goals: {},
    plan: [],
    logs: {},
    next14Days: [],
    availableScreens: [{ key: "home", label: "Start" }],
    recoveryDomain: domain,
    recoverySummary: buildRecoverySummaryFromDomain(domain),
  };
}

describe("AI uncertainty language (recovery confidence)", () => {
  it("low-confidence recovery triggers cautious wording in fatigue advice", () => {
    const domain = {
      domainKind: "live",
      isBootConsistentSnapshot: false,
      homeRecoveryScore0_100: 45,
      homeRecoveryScoreSource: "loadOnly",
      fallback7dBreakdown: null,
      homeRecoveryWindowStartYmd: "2026-04-06",
      homeRecoveryWindowEndYmd: "2026-04-06",
      isInsufficient: false,
      sessionRecovery: { label: "Niedrig", tone: "#f87171" },
      trainingRecoveryLabel: "Niedrig",
      latent: { R_t: null, confidence: null, trend7d: "unknown", uncertaintyTier: "high", rVariance7d: null },
      series: [],
      rollups: [],
      insight: { text: "", showWarning: false, dataMode: "low", recoveryConfidence: null, semanticUncertaintyState: null, aiReasoningMode: null },
      homeRecoveryBreakdown: null,
    } as unknown as RecoveryDomainState;

    const res = buildMockAiResponse("ich will heute intervalle laufen obwohl ich muede bin", ctxWithDomain(domain));
    expect(res.message.toLowerCase()).toMatch(/confidence|gering|vorsichtig/);
  });
});

