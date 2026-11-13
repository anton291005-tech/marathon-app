/**
 * Gesundheits-Zustimmung (v2) als kleiner App-weiter Zustand, ohne React und ohne Netz.
 *
 * Die Zustimmung selbst liegt in `profiles.health_consent_at` / `health_consent_version` (Migration 017/022);
 * geladen und geändert wird sie in `src/features/checkin/healthConsent.ts`. Hier liegt nur der zuletzt bekannte
 * Status, damit auch Services ohne React (HealthKit-Lesen, Speichern der Anstrengung) fragen können, ob sie dürfen.
 *
 * Mit Uhr-Signale-Flag (`isWatchSignalsEnabled`) gilt: ohne Zustimmung kein Lesen der zustimmungspflichtigen
 * Apple-Health-Typen und kein Speichern von Erholungswerten oder Anstrengung. Ohne Flag bleibt alles wie bisher.
 */
import { isWatchSignalsEnabled } from "../features/settings/settingsFlags";

/**
 * - `loading`: noch nicht geladen (oder kein Nutzer)
 * - `granted`: aktuelle Textversion zugestimmt
 * - `declined`: auf diesem Gerät für die aktuelle Version abgelehnt oder widerrufen → nicht erneut fragen
 * - `undecided`: noch nie (für diese Version) gefragt
 * - `unavailable`: konnte nicht geladen werden (offline) → nichts lesen/speichern, aber auch nicht fragen
 */
export type HealthConsentStatus = "loading" | "granted" | "declined" | "undecided" | "unavailable";

type State = { userId: string | null; status: HealthConsentStatus; sheetOpen: boolean };

let state: State = { userId: null, status: "loading", sheetOpen: false };
const listeners = new Set<() => void>();
let pendingDecision: ((granted: boolean) => void) | null = null;

function emit(): void {
  listeners.forEach((l) => l());
}

export function getHealthConsentState(): Readonly<State> {
  return state;
}

export function getHealthConsentStatus(): HealthConsentStatus {
  return state.status;
}

export function subscribeHealthConsent(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function setHealthConsentStatus(userId: string | null, status: HealthConsentStatus): void {
  if (state.userId === userId && state.status === status) return;
  state = { ...state, userId, status };
  emit();
}

/** Darf die App zustimmungspflichtige Gesundheitsdaten lesen und speichern? Ohne Flag immer ja (bisheriges Verhalten). */
export function isHealthDataProcessingAllowed(watchSignals: boolean = isWatchSignalsEnabled()): boolean {
  return !watchSignals || state.status === "granted";
}

/**
 * Öffnet die Zustimmungs-Abfrage und wartet auf die Entscheidung. Bereits zugestimmt → sofort `true`,
 * abgelehnt/nicht ladbar → sofort `false` (keine erneute Abfrage).
 */
export function requestHealthConsentDecision(): Promise<boolean> {
  if (state.status === "granted") return Promise.resolve(true);
  if (state.status !== "undecided") return Promise.resolve(false);
  if (pendingDecision) {
    const previous = pendingDecision;
    return new Promise((resolve) => {
      pendingDecision = (granted) => {
        previous(granted);
        resolve(granted);
      };
    });
  }
  return new Promise((resolve) => {
    pendingDecision = resolve;
    state = { ...state, sheetOpen: true };
    emit();
  });
}

/** Schließt die Abfrage und meldet die Entscheidung an alle Wartenden. */
export function settleHealthConsentDecision(granted: boolean): void {
  const resolve = pendingDecision;
  pendingDecision = null;
  if (state.sheetOpen) {
    state = { ...state, sheetOpen: false };
    emit();
  }
  resolve?.(granted);
}

/** Nur für Tests. */
export function resetHealthConsentStoreForTests(): void {
  state = { userId: null, status: "loading", sheetOpen: false };
  pendingDecision = null;
  listeners.clear();
}
