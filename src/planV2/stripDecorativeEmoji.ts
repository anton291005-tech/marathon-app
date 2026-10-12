/**
 * Entfernt Emojis und Piktogramme aus Plan-Texten (Titel, Wochenlabel, Fokus, Beschreibung).
 * Ältere und generierte Pläne tragen Deko wie „🏁 Marathon" oder „Base W3 ⬇️" in den Daten;
 * das Design System erlaubt keine Emojis in der Oberfläche (docs/design-system/README.md).
 */
const DECORATIVE_EMOJI = /[\p{Extended_Pictographic}\u{FE0F}\u{200D}\u{20E3}\u{1F3FB}-\u{1F3FF}\u{1F1E6}-\u{1F1FF}]/gu;

export function stripDecorativeEmoji(text: string): string {
  if (!text) return text;
  const stripped = text.replace(DECORATIVE_EMOJI, "");
  if (stripped === text) return text;
  return stripped.replace(/[ \t]{2,}/g, " ").replace(/^[\s–—-]+/u, "").trim();
}
