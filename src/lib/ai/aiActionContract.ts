import type { AiActionType, AiAssistantAction } from "./types";

/** Single allow-list for remote / agent-emitted action kinds (keeps server + client aligned). */
export const ALLOWED_AI_ACTION_TYPES: readonly AiActionType[] = [
  "adjust_plan_for_illness",
  "replace_bike_with_run",
  "convert_workout_to_run",
  "replace_workout",
  "shift_race_date",
  "shift_plan_start_date",
  "navigate_to_screen",
  "explain_feature",
  "adapt_plan_injury_no_run",
  "remove_all_bike_sessions",
  "boost_next_week_volume",
  "taper_before_race",
  "integrate_missed_workout",
  "replace_training_plan_generated",
  "update_user_preferences",
] as const;

const ALLOWED_SET = new Set<string>(ALLOWED_AI_ACTION_TYPES);

export function isAllowedAiActionType(value: unknown): value is AiActionType {
  return typeof value === "string" && ALLOWED_SET.has(value);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Coerces an untrusted wire `action` object into `AiAssistantAction` or returns null (drop action, keep message).
 */
export function coerceAiAssistantActionFromWire(action: unknown): AiAssistantAction | null {
  if (!isPlainRecord(action)) return null;
  if (!isAllowedAiActionType(action.type)) return null;
  const payload = isPlainRecord(action.payload) ? action.payload : {};
  let preview: AiAssistantAction["preview"];
  if (isPlainRecord(action.preview)) {
    const p = action.preview;
    const itemsRaw = p.items;
    const items =
      Array.isArray(itemsRaw) ? itemsRaw.filter((item): item is string => typeof item === "string") : [];
    preview = {
      title: typeof p.title === "string" ? p.title : "Vorgeschlagene Anpassung",
      items,
      confirmLabel: typeof p.confirmLabel === "string" ? p.confirmLabel : undefined,
      cancelLabel: typeof p.cancelLabel === "string" ? p.cancelLabel : undefined,
      secondaryLabel: typeof p.secondaryLabel === "string" ? p.secondaryLabel : undefined,
      openLabel: typeof p.openLabel === "string" ? p.openLabel : undefined,
    };
  }
  return {
    type: action.type,
    payload,
    preview,
  };
}
