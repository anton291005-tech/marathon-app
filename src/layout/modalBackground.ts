/**
 * Attribute für den App-Inhalt HINTER einem bildschirmfüllenden Dialog (Onboarding-Wizard).
 *
 * Der Wizard liegt nur optisch über der App. Ohne `inert` blieb alles dahinter für VoiceOver vorlesbar und per
 * Tastatur/Wischen bedienbar — bei einem frischen Konto der eingebettete Demo-Plan samt Tab-Leiste: ein ✓ dort
 * schrieb ein Log für eine Demo-Einheit, „Rückblick ansehen“ legte einen Rückblick des Demo-Plans an.
 */
export function modalBackgroundProps(dialogOpen: boolean): { inert?: true; "aria-hidden"?: true } {
  return dialogOpen ? { inert: true, "aria-hidden": true } : {};
}
