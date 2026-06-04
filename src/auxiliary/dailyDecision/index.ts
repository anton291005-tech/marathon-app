/**
 * AUXILIARY daily-decision package — isolated from recovery SSOT.
 *
 * - Not imported by `src/recovery/*`, AI coach wiring, or remote coach handlers.
 * - Safe for offline experiments, tests, or future devtools — not for primary user-facing
 *   recovery intelligence (use RecoveryDomainState + presentation layer).
 */

export * from "./ruleEngine";
export * from "./coachRuleEngine";
export { default as AuxiliaryDailyDecisionCard } from "./AuxiliaryDailyDecisionCard";
