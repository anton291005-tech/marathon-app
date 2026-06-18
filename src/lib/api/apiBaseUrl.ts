import { Capacitor } from "@capacitor/core";

/** Vercel production host — Capacitor has no same-origin `/api` proxy. */
const NATIVE_DEFAULT_API_BASE = "https://marathon-appfinal.vercel.app";

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
