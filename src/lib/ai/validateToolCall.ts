type ToolActionName = "adjustTrainingPlan" | "addRestDay" | "swapTrainingDays";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateAdjustTrainingPlanParams(params: unknown): boolean {
  if (!isPlainObject(params)) return false;
  if (params.intensity === "extreme") return false;
  return true;
}

function validateAddRestDayParams(params: unknown): boolean {
  return isPlainObject(params);
}

function validateSwapTrainingDaysParams(params: unknown): boolean {
  return isPlainObject(params) && typeof params.dayA === "string" && typeof params.dayB === "string";
}

/**
 * Server/agent tool whitelist — rejects unknown actions and malformed params.
 */
export function validateToolCall(action: unknown, params: unknown): boolean {
  if (typeof action !== "string" || !action.trim()) return false;

  const trimmed = action.trim() as ToolActionName;

  if (trimmed === "adjustTrainingPlan") return validateAdjustTrainingPlanParams(params);
  if (trimmed === "addRestDay") return validateAddRestDayParams(params);
  if (trimmed === "swapTrainingDays") return validateSwapTrainingDaysParams(params);

  return false;
}
