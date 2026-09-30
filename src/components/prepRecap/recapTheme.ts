import type { RecapSlideId } from "./buildRecapSlides";

/**
 * Farbwelt pro Slide. Alle Verläufe laufen unten in den App-Hintergrund (#070912) aus, damit die
 * Story wie ein Teil der App wirkt; der Akzent oben greift die bestehenden App-Farben auf
 * (Lauf-Blau, Erfolgs-Grün, Phasenfarben aus trainingPhase.ts).
 */
export type RecapTheme = {
  background: string;
  /** Eyebrow, Einheiten, Fortschrittsbalken. */
  accent: string;
  /** Konfetti-Farben (nur Renn-Slide). */
  confetti?: string[];
};

const APP_BG = "#070912";

function gradient(glow: string, mid: string, glowAt = "50% -10%"): string {
  return [
    `radial-gradient(120% 70% at ${glowAt}, ${glow} 0%, rgba(7,9,18,0) 70%)`,
    `linear-gradient(180deg, ${mid} 0%, ${APP_BG} 78%)`,
  ].join(", ");
}

const THEMES: Record<RecapSlideId, RecapTheme> = {
  intro: { background: gradient("rgba(99,102,241,0.55)", "#15173a"), accent: "#a5b4fc" },
  volume: { background: gradient("rgba(59,130,246,0.6)", "#0c1f45"), accent: "#93c5fd" },
  sessions: { background: gradient("rgba(16,185,129,0.5)", "#062a26"), accent: "#6ee7b7" },
  streak: { background: gradient("rgba(249,115,22,0.55)", "#2a130a", "80% -5%"), accent: "#fdba74" },
  longRuns: { background: gradient("rgba(14,165,233,0.55)", "#082637", "20% -5%"), accent: "#7dd3fc" },
  quality: { background: gradient("rgba(168,85,247,0.55)", "#1f0f3a"), accent: "#d8b4fe" },
  strongestWeek: { background: gradient("rgba(244,63,94,0.5)", "#2d0b1a", "70% -5%"), accent: "#fda4af" },
  phases: { background: gradient("rgba(59,130,246,0.35)", "#101631"), accent: "#c7d2fe" },
  body: { background: gradient("rgba(20,184,166,0.45)", "#07262a", "30% -5%"), accent: "#5eead4" },
  race: {
    background: [
      "radial-gradient(90% 55% at 50% 0%, rgba(250,204,21,0.42) 0%, rgba(7,9,18,0) 70%)",
      "radial-gradient(80% 50% at 50% 100%, rgba(34,197,94,0.28) 0%, rgba(7,9,18,0) 70%)",
      `linear-gradient(180deg, #1c2a12 0%, #0a1a12 45%, ${APP_BG} 100%)`,
    ].join(", "),
    accent: "#fde68a",
    confetti: ["#fde68a", "#facc15", "#86efac", "#22c55e", "#ffffff", "#93c5fd"],
  },
  outro: { background: gradient("rgba(99,102,241,0.4)", "#121633"), accent: "#c7d2fe" },
};

export function recapThemeFor(id: RecapSlideId): RecapTheme {
  return THEMES[id];
}

/** Hintergrund der Zeit-Eingabe (vor Slide 1) — gleiche Welt wie die Renn-Slide, ruhiger. */
export const FINISH_INPUT_BACKGROUND = gradient("rgba(250,204,21,0.26)", "#141a2e");
