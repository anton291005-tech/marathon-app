/**
 * Schicht-Modus an/aus (Arbeitsplan Freundes-Test W1). Standard an; `REACT_APP_SHIFT_MODE=0` oder `=false` schaltet
 * ihn ab (dann verhält sich die App wie vor dem Schicht-Modus: keine Frage, keine Seite, keine Wirkung).
 * Muster wie `src/features/settings/settingsFlags.ts`.
 */
export function isShiftModeEnabled(env: string | undefined = process.env.REACT_APP_SHIFT_MODE): boolean {
  if (env == null) return true;
  const value = env.trim().toLowerCase();
  return !(value === "0" || value === "false" || value === "off");
}
