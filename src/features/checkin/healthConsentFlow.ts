/**
 * Abläufe rund um die Gesundheits-Zustimmung v2 – rein und testbar; AppMain verdrahtet nur.
 * Ohne Uhr-Signale-Flag (`watchSignals = false`) ändern sie nichts am bisherigen Verhalten.
 */
import type { HealthConsentStatus } from "../../health/healthConsentStore";
import type { SessionLog } from "../../marathonPrediction";

/** Apple Health verbinden: erst die Zustimmung in der App, dann der Apple-Dialog (Umfang richtet sich nach der Antwort). */
export async function connectAppleHealthWithConsent(deps: {
  watchSignals: boolean;
  askConsent: () => Promise<boolean>;
  requestHealthKit: () => Promise<void>;
}): Promise<void> {
  if (deps.watchSignals) await deps.askConsent();
  await deps.requestHealthKit();
}

/** Einmal pro Textversion beim Start fragen: nur verbundene Nutzer ohne Entscheidung. */
export function shouldAskHealthConsentOnColdStart(args: {
  watchSignals: boolean;
  userId: string | null | undefined;
  connected: boolean;
  status: HealthConsentStatus;
  alreadyAsked: boolean;
}): boolean {
  return args.watchSignals && !!args.userId && args.connected && args.status === "undecided" && !args.alreadyAsked;
}

/** Nach der Zustimmung: erst den Apple-Dialog für die neuen Typen, dann die Erholungswerte laden. */
export async function afterHealthConsentGranted(deps: {
  connected: boolean;
  requestHealthKit: () => Promise<void>;
  hydrateRecovery: () => Promise<void>;
}): Promise<void> {
  if (!deps.connected) return;
  await deps.requestHealthKit();
  await deps.hydrateRecovery();
}

/** Anstrengung abfragen? Ohne Flag immer; mit Flag bei Zustimmung oder solange noch nicht entschieden. */
export function isRpeInputAvailable(watchSignals: boolean, status: HealthConsentStatus): boolean {
  return !watchSignals || status === "granted" || status === "undecided";
}

/**
 * Darf eine eben eingegebene Anstrengung gespeichert werden? Noch nicht entschieden → erst fragen.
 * Abgelehnt, lädt oder nicht ladbar → nein: die Eingabe wird verworfen (kein zweiter Datenweg, auch nicht lokal).
 */
export async function mayStoreRpe(deps: {
  watchSignals: boolean;
  status: HealthConsentStatus;
  askConsent: () => Promise<boolean>;
}): Promise<boolean> {
  if (!deps.watchSignals || deps.status === "granted") return true;
  if (deps.status !== "undecided") return false;
  return deps.askConsent();
}

/** Nach dem Widerruf: Anstrengung und Herkunft aus allen lokalen Logs entfernen. */
export function stripRpeFromLogs(logs: Readonly<Record<string, SessionLog>>): {
  logs: Record<string, SessionLog>;
  changedIds: string[];
} {
  const out: Record<string, SessionLog> = {};
  const changedIds: string[] = [];
  for (const id of Object.keys(logs)) {
    const log = logs[id] as SessionLog & { rpeSource?: unknown };
    if (log && (log.rpe !== undefined || log.rpeSource !== undefined)) {
      const { rpe: _rpe, rpeSource: _source, ...rest } = log;
      void _rpe;
      void _source;
      out[id] = rest;
      changedIds.push(id);
    } else {
      out[id] = log;
    }
  }
  return { logs: changedIds.length ? out : (logs as Record<string, SessionLog>), changedIds };
}
