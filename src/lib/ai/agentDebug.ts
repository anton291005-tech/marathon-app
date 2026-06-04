/** Minimal dev-only logging for the AI agent layer — no console noise in production. */
export function aiAgentDevWarn(tag: string, detail?: unknown): void {
  if (typeof process === "undefined" || process.env.NODE_ENV !== "development") return;
  // eslint-disable-next-line no-console
  console.warn(`[ai-agent] ${tag}`, detail);
}
