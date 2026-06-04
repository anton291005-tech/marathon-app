/** CRA-inlined API host for Vercel / Capacitor; empty string → same-origin relative `/api/...`. */
export function getApiBaseUrl(): string {
  if (typeof process === "undefined" || !process.env) return "";
  const raw = process.env.REACT_APP_AI_API_BASE;
  return (typeof raw === "string" ? raw : "").replace(/\/$/, "");
}
