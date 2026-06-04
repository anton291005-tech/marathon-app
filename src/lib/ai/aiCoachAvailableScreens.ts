import type { AiContext } from "./types";

/**
 * Canonical screen catalog passed into `getAiContext` / remote coach payload.
 * Order is stable and product-facing (do not alphabetical-sort downstream).
 */
export const AI_COACH_AVAILABLE_SCREENS: AiContext["availableScreens"] = [
  { key: "home", label: "Start" },
  { key: "week", label: "Wochenplan", sections: ["current_week"] },
  { key: "performance", label: "Leistung" },
  { key: "overview", label: "Uebersicht" },
  { key: "coach", label: "AI Coach" },
  { key: "settings", label: "Einstellungen", sections: ["race_goal"] },
];
