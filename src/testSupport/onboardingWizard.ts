/**
 * Klickt die Onboarding-Tests durch den Wizard (7 Schritte seit Umbauplan Schritt 9):
 * 1 Distanz & Ziel → 2 Rennen → 3 Trainingswoche → 4 Form → 5 Präferenzen → 6 Kalender → 7 Zusammenfassung.
 * Gemeinsam genutzt, damit eine neue Frage nicht vier Testdateien einzeln bricht.
 */

import { fireEvent, screen } from "@testing-library/react";

export const RACE_DATE_LABEL = "Wann ist dein Rennen?";
export const WEEKLY_KM_LABEL = "Wie viele km läufst du pro Woche?";
export const LONGEST_RUN_LABEL = "Dein längster Lauf in den letzten 4 Wochen (optional)";

export function clickNext(): void {
  fireEvent.click(screen.getByRole("button", { name: "Weiter" }));
}

/** Schritt 1: Distanz wählen und weiter → Schritt 2 (Rennen). */
export function chooseDistance(name = "10 km"): void {
  fireEvent.click(screen.getByRole("button", { name }));
  clickNext();
}

/** Schritt 2: Renndatum eintragen (bleibt auf Schritt 2). */
export function enterRaceDate(raceDate = "01.01.2099"): void {
  fireEvent.change(screen.getByLabelText(RACE_DATE_LABEL), { target: { value: raceDate } });
}

/** Schritt 3: Lauftage wählen (alle Tage sind vorausgewählt, Long Run Sonntag) und weiter → Schritt 4. */
export function fillTrainingWeek(runDays = 4): void {
  fireEvent.click(screen.getByRole("button", { name: `${runDays} Tage` }));
  clickNext();
}

/** Schritt 4: Wochen-km eintragen und weiter → Schritt 5 (Präferenzen). */
export function fillForm(weeklyKm = "15"): void {
  fireEvent.change(screen.getByLabelText(WEEKLY_KM_LABEL), { target: { value: weeklyKm } });
  clickNext();
}

/** Schritte 1–4 mit Standardwerten, endet auf Schritt 5 (Präferenzen). */
export function goToPreferences(options: { distance?: string; raceDate?: string; runDays?: number; weeklyKm?: string } = {}): void {
  chooseDistance(options.distance);
  enterRaceDate(options.raceDate);
  clickNext();
  fillTrainingWeek(options.runDays);
  fillForm(options.weeklyKm);
}

/** Schritte 1–6 mit Standardwerten, endet auf der Zusammenfassung (Schritt 7). */
export function goToSummary(options: Parameters<typeof goToPreferences>[0] = {}): void {
  goToPreferences(options);
  clickNext();
  clickNext();
}
