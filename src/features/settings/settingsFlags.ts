/**
 * Sprachwahl: bis zum i18n-Schritt des Settings-Umbaus ausgeblendet, die App läuft fest auf Deutsch.
 * Die gespeicherte Wahl (`myrace-language`) bleibt unangetastet und gilt wieder, sobald das hier `true` ist.
 */
export const LANGUAGE_SELECTION_ENABLED: boolean = false;

/**
 * Morgen-Check-in (Readiness Plan Schritt 3): in Production aus bis Schritt 14 (Cutover), weil ein Check-in ohne
 * sichtbare Wirkung Nutzer verliert (Spec §6.4). An auf Vercel-Previews und dem lokalen Dev-Server sowie in
 * Builds mit `REACT_APP_CHECKIN_ENABLED=1` (Antons iPhone). Die iOS-App läuft unter `capacitor://localhost` und
 * ist damit ohne die Variable aus.
 */
export function isCheckInEnabled(
  env: string | undefined = process.env.REACT_APP_CHECKIN_ENABLED,
  location: { protocol: string; hostname: string } | undefined = typeof window !== "undefined" ? window.location : undefined,
): boolean {
  if (env === "1" || env === "true") return true;
  if (!location) return false;
  const { protocol, hostname } = location;
  if ((protocol === "http:" || protocol === "https:") && (hostname === "localhost" || hostname === "127.0.0.1")) return true;
  return /^marathon-[a-z0-9-]+-anton291005-techs-projects\.vercel\.app$/.test(hostname);
}

