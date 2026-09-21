/**
 * Produktions-Gate für Debug-Logs.
 *
 * Die App enthält ~150 getaggte `console.log`-Aufrufe ([RECOVERY_PIPELINE], [PWS-DIAG:PACE],
 * [MIGRATION-DEBUG], …), die beim Laden die Konsole fluten. CRA strippt `console` nicht und
 * `no-console` ist in der eslintConfig nicht aktiv, also gibt es kein Gate — dieses Modul ist es.
 *
 * `console.warn` und `console.error` bleiben unangetastet: das sind echte Fehlerpfade und
 * Sentry-Breadcrumbs.
 *
 * WICHTIG: Dieses Modul muss als ALLERERSTER Import in `src/index.tsx` stehen, insbesondere vor
 * `@sentry/react`. ES-Import-Reihenfolge ist Ausführungsreihenfolge; so wrappt Sentry unseren
 * No-op statt umgekehrt, und die warn/error-Breadcrumbs bleiben intakt.
 *
 * Wieder einschalten (auch im Release-Build, z. B. für On-Device-Diagnose):
 *   localStorage.MYRACE_DEBUG_LOGS = "1"   → Reload
 *   oder ?debugLogs=1 an die URL hängen
 */

export const DEBUG_LOGS_FLAG_KEY = "MYRACE_DEBUG_LOGS";

/**
 * Reiner Entscheider — ohne Seiteneffekt und ohne globale Zugriffe, damit er testbar ist.
 *
 * @param env         Wert von `process.env.NODE_ENV`.
 * @param flagValue   Wert von `localStorage[DEBUG_LOGS_FLAG_KEY]`; `null` wenn nicht gesetzt oder
 *                    nicht lesbar (WKWebView kann localStorage blockieren).
 * @param search      `window.location.search`, z. B. `"?debugLogs=1"`.
 */
export function shouldSilenceDebugLogs(
  env: string | undefined,
  flagValue: string | null | undefined,
  search: string | null | undefined,
): boolean {
  if (env !== "production") return false;
  if (flagValue === "1") return false;
  try {
    if (new URLSearchParams(search || "").get("debugLogs") === "1") return false;
  } catch {
    // Kaputter Query-String darf das Gate nicht aufhebeln.
  }
  return true;
}

function readFlag(): string | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage.getItem(DEBUG_LOGS_FLAG_KEY) : null;
  } catch {
    return null;
  }
}

function readSearch(): string {
  try {
    return globalThis.location?.search || "";
  } catch {
    return "";
  }
}

function currentEnv(): string | undefined {
  try {
    // CRA ersetzt genau das Muster "process.env.NODE_ENV" zur Build-Zeit textuell durch einen
    // String-Literal (DefinePlugin) — das ist unabhängig davon, ob zur Laufzeit ein globales
    // `process`-Objekt existiert. Im Browser existiert keins (kein Node-Polyfill seit Webpack 5),
    // darum NICHT über `typeof process !== "undefined"` gaten — das macht die Bedingung im
    // Production-Build im echten Browser immer false und der Shim greift nie.
    return process.env.NODE_ENV;
  } catch {
    return undefined;
  }
}

if (shouldSilenceDebugLogs(currentEnv(), readFlag(), readSearch())) {
  try {
    const noop = (): void => {};
    // eslint-disable-next-line no-console
    console.log = noop;
    // eslint-disable-next-line no-console
    console.debug = noop;
    // eslint-disable-next-line no-console
    console.info = noop;
  } catch {
    // Wenn console nicht beschreibbar ist (exotische Runtime), einfach weiterlaufen.
  }
}
