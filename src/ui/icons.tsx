/**
 * Ikonografie laut docs/design-system/README.md: ausschließlich Lucide, Strichstärke 1,75,
 * Farbe über `currentColor`. Keine Emojis, keine Unicode-Zeichen als Icons.
 */
import {
  Bike,
  Dumbbell,
  Flag,
  Footprints,
  Moon,
  Waves,
  type LucideIcon,
} from "lucide-react";

export const ICON_STROKE = 1.75;
/** `size-icon`: Tab-Bar und Listen. */
export const ICON_SIZE = 22;
/** `size-icon-s`: Chips und Buttons. */
export const ICON_SIZE_S = 16;

const SESSION_TYPE_ICONS: Record<string, LucideIcon> = {
  bike: Bike,
  strength: Dumbbell,
  rest: Moon,
  race: Flag,
  swim: Waves,
};

/** Sportart einer Einheit: Laufen `footprints`, Rad `bike`, Kraft `dumbbell`, Ruhetag `moon`. */
export function SessionTypeIcon({ type, size = ICON_SIZE }: { type?: string | null; size?: number }) {
  const Icon = (type && SESSION_TYPE_ICONS[type]) || Footprints;
  return <Icon aria-hidden size={size} strokeWidth={ICON_STROKE} style={{ flex: "none" }} />;
}

export type SessionSport = "run" | "bike" | "strength" | "rest";

/** Sportart für Farbe (`sport-*`) und Wort; alle Laufarten inkl. Rennen zählen als Lauf. */
export function getSessionSport(type?: string | null): SessionSport {
  if (type === "bike" || type === "strength" || type === "rest") return type;
  return "run";
}

const SESSION_SPORT_WORDS: Record<SessionSport, string> = {
  run: "Lauf",
  bike: "Rad",
  strength: "Kraft",
  rest: "Ruhetag",
};

export function getSessionSportWord(type?: string | null): string {
  return type === "race" ? "Rennen" : SESSION_SPORT_WORDS[getSessionSport(type)];
}
