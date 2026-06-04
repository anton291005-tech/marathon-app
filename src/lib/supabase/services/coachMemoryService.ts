import type { CoachMemory } from "../../ai/memory/coachMemory";
import { getAppNowEpochMs } from "../../../core/time/timeSystem";
import { supabase } from "../client";

function isFiniteNum(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

/** Align JSONB payloads with the same bounds as `coachMemory.ts` `sanitizeMemory`. */
function coerceCoachMemoryFromJson(raw: unknown): CoachMemory {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {
      fatigueBias: 0,
      restPreference: 0.5,
      adaptationLevel: 0.5,
      lastAdjustmentType: "none",
      consecutiveHardDays: 0,
      lastUpdated: getAppNowEpochMs(),
    };
  }
  const o = raw as Record<string, unknown>;

  const fatigueBias = isFiniteNum(o.fatigueBias) ? Math.min(1, Math.max(-1, o.fatigueBias)) : 0;
  const restPreference = isFiniteNum(o.restPreference) ? Math.min(1, Math.max(0, o.restPreference)) : 0.5;
  const adaptationLevel = isFiniteNum(o.adaptationLevel) ? Math.min(1, Math.max(0, o.adaptationLevel)) : 0.5;
  const lastAdjustmentType =
    o.lastAdjustmentType === "increase" || o.lastAdjustmentType === "decrease" || o.lastAdjustmentType === "none"
      ? o.lastAdjustmentType
      : "none";
  const consecutiveHardDays = isFiniteNum(o.consecutiveHardDays)
    ? Math.min(365, Math.max(0, Math.floor(o.consecutiveHardDays)))
    : 0;
  const lastUpdated =
    isFiniteNum(o.lastUpdated) && o.lastUpdated > 0 ? o.lastUpdated : getAppNowEpochMs();

  return {
    fatigueBias,
    restPreference,
    adaptationLevel,
    lastAdjustmentType,
    consecutiveHardDays,
    lastUpdated,
  };
}

export async function loadCoachMemory(userId: string): Promise<CoachMemory | null> {
  const { data, error } = await supabase.from("coach_memory").select("*").eq("user_id", userId).maybeSingle();

  if (error) {
    if (process.env.NODE_ENV === "development") {
      // eslint-disable-next-line no-console
      console.warn("[coachMemoryService] loadCoachMemory", error.message);
    }
    return null;
  }

  if (!data || typeof data !== "object" || !("data" in data)) return null;
  const raw = (data as { data: unknown }).data;
  if (raw == null) return null;

  return coerceCoachMemoryFromJson(raw);
}

export async function saveCoachMemory(userId: string, memory: CoachMemory): Promise<void> {
  const safe = coerceCoachMemoryFromJson(memory);
  const { error } = await supabase.from("coach_memory").upsert(
    {
      user_id: userId,
      data: safe,
    },
    { onConflict: "user_id" },
  );

  if (error) {
    if (process.env.NODE_ENV === "development") {
      // eslint-disable-next-line no-console
      console.warn("[coachMemoryService] saveCoachMemory", error.message);
    }
  }
}
