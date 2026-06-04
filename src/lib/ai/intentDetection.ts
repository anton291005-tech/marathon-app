/**
 * Grobe Intent-Klassifikation für Coach-Steuerung (lokal, regelbasiert).
 * Dient Prompt-Steering und Mock-Routing — keine finale Entscheidung über Planänderungen.
 */

export type Intent =
  | "adjust_plan"
  | "swap_training_day"
  | "nutrition_question"
  | "general_question"
  | "injury_or_health"
  | "unknown";

function normalizeText(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[!?.,;:()[\]{}"']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function detectIntent(input: string): Intent {
  const text = normalizeText(input);
  if (!text) return "unknown";

  if (
    /\b(verletz|schmerz|krank|erkaelt|grippe|fieber|infekt|achilles|knie|huefte|hüfte|muskelfaser|reha|arzt|doc)\b/.test(text) ||
    /\b(ich bin krank|fuhle mich krank|fuehle mich krank)\b/.test(text)
  ) {
    return "injury_or_health";
  }

  if (
    /\b(tausch|swap|vertausch)\b/.test(text) ||
    /\b(verschieb\w*\s+(den\s+)?(tag|trainingstag|einheit))\b/.test(text) ||
    /\b(training\s+(auf|nach)\s+(montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag))\b/.test(text)
  ) {
    return "swap_training_day";
  }

  if (
    /\b(essen|ernahr|nahrung|kohlenhydrat|protein|flussigkeit|trinken|mahlzeit|snack|orange|orangen|banane|rice|reis)\b/.test(
      text,
    )
  ) {
    return "nutrition_question";
  }

  if (/\b(plan\s+anpass|plan\s+ander|trainingsplan|zu\s+viel\s+training|last\s+reduz)\b/.test(text)) {
    return "adjust_plan";
  }

  if (/\b(plan|woche|einheit|tempo|intervall|marathon|lauf)\b/.test(text)) {
    return "general_question";
  }

  if (text.length < 4) return "unknown";

  return "general_question";
}
