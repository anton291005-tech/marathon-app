export type AiConfig = {
  provider: "mock" | "openai";
  enabled: boolean;
  model: string;
  apiBaseUrl?: string;
  requestTimeoutMs: number;
};

/**
 * CRA ersetzt zur Build-Zeit nur statische Ausdrücke der Form `process.env.REACT_APP_X` (DefinePlugin).
 * Ein globales `process` gibt es im Browser/WebView nicht (Webpack 5 ohne Node-Polyfill). Darum hier
 * weder `typeof process` prüfen (wäre zur Laufzeit immer "undefined" → alle Werte leer) noch dynamisch
 * `process.env[name]` lesen — jede Variable muss als statischer Zugriff im Code stehen.
 */
function clean(value: string | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

export function getAiConfig(): AiConfig {
  const providerRaw = clean(process.env.REACT_APP_AI_PROVIDER).toLowerCase();
  const enabledRaw = clean(process.env.REACT_APP_AI_ENABLED).toLowerCase();
  const timeoutRaw = Number(clean(process.env.REACT_APP_AI_TIMEOUT_MS));
  const apiBaseUrl = clean(process.env.REACT_APP_AI_API_BASE) || clean(process.env.REACT_APP_AI_API_BASE_URL);
  const model = clean(process.env.REACT_APP_AI_MODEL) || "gpt-4.1-mini";

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
