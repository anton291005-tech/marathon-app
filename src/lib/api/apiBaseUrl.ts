import { Capacitor } from "@capacitor/core";

/**
 * Vercel production host — Capacitor has no same-origin `/api` proxy.
 * Must match the actively monitored/maintained Production deployment
 * (see .env.production REACT_APP_AI_API_BASE). Previously pointed at
 * "https://marathon-appfinal.vercel.app" — a different, unmonitored Vercel
 * project — which silently swallowed native requests for weeks whenever a
 * native build shipped without REACT_APP_AI_API_BASE baked in.
 *
 * TODO(discuss before changing): a hardcoded fallback here means a missing
 * REACT_APP_AI_API_BASE at native build time fails *silently* into
 * whatever domain is hardcoded — exactly how the appfinal mismatch went
 * unnoticed. An alternative is to make that condition loud instead:
 * throw or console.error/warn when Capacitor.isNativePlatform() is true
 * and fromEnv is empty, rather than falling back to a hardcoded domain at
 * all. Left as-is intentionally — decide deliberately, not as a drive-by
 * change alongside the domain fix.
 */
const NATIVE_DEFAULT_API_BASE = "https://marathon-app-alpha.vercel.app";

/** CRA-inlined API host for Vercel / Capacitor; empty string → same-origin relative `/api/...`. */
export function getApiBaseUrl(): string {
  const raw =
    typeof process !== "undefined" && process.env
      ? process.env.REACT_APP_AI_API_BASE
      : undefined;
  const fromEnv = (typeof raw === "string" ? raw : "").replace(/\/$/, "");

  if (Capacitor.isNativePlatform()) {
    return fromEnv || NATIVE_DEFAULT_API_BASE;
  }

  return fromEnv;
}
