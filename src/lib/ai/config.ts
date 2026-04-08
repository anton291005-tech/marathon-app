export type AiConfig = {
  provider: "mock" | "openai";
  enabled: boolean;
  model: string;
  apiBaseUrl?: string;
  requestTimeoutMs: number;
};

/** CRA injects env at build time; in some WebViews `process` is undefined — never reference `process` unguarded. */
function readEnv(name: string): string {
  if (typeof process === "undefined" || !process.env) return "";
  const v = process.env[name];
  return typeof v === "string" ? v.trim() : "";
}

export function getAiConfig(): AiConfig {
  const providerRaw = readEnv("REACT_APP_AI_PROVIDER").toLowerCase();
  const enabledRaw = readEnv("REACT_APP_AI_ENABLED").toLowerCase();
  const timeoutRaw = Number(readEnv("REACT_APP_AI_TIMEOUT_MS"));
  const apiBaseUrl = readEnv("REACT_APP_AI_API_BASE") || readEnv("REACT_APP_AI_API_BASE_URL");
  const model = readEnv("REACT_APP_AI_MODEL") || "gpt-4.1-mini";

  const provider: AiConfig["provider"] = providerRaw === "openai" ? "openai" : "mock";
  const enabled = enabledRaw ? ["1", "true", "yes", "on"].includes(enabledRaw) : provider === "openai";
  const requestTimeoutMs = Number.isFinite(timeoutRaw) && timeoutRaw >= 1000 ? timeoutRaw : 8000;

  return {
    provider,
    enabled,
    model,
    apiBaseUrl,
    requestTimeoutMs,
  };
}
