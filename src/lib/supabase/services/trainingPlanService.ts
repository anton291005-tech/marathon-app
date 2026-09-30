import { validateTrainingPlanV2Integrity } from "../../../ai/validation/validateTrainingPlanV2Integrity";
import { getAppNow } from "../../../core/time/timeSystem";
import { normalizeTrainingPlan } from "../../../planV2/normalizeTrainingPlan";
import type { TrainingPlanV2 } from "../../../planV2/types";
import { supabase } from "../client";

/** Strip stray persistence fields before writing the jsonb `data` column. */
export function sanitizeTrainingPlanRemoteData(plan: TrainingPlanV2): TrainingPlanV2 {
  return normalizeTrainingPlan(plan);
}

export type TrainingPlanListItem = {
  id: string;
  /** null nur bei archivierten Plänen (Migration 012). */
  plan_slot: number | null;
  plan_name: string;
  is_active: boolean;
  created_at: string;
  archived_at: string | null;
};

/** Nicht archivierte Pläne pro Nutzer; archivierte zählen nicht dagegen (sie geben ihren Slot frei). */
export const MAX_ACTIVE_PLANS = 5;

const PLAN_SLOTS: number[] = Array.from({ length: MAX_ACTIVE_PLANS }, (_, i) => i + 1);

const PLAN_LIST_COLUMNS = "id, plan_slot, plan_name, is_active, created_at, archived_at";
const LEGACY_PLAN_LIST_COLUMNS = "id, plan_slot, plan_name, is_active, created_at";

/** Postgres „undefined_column" — Migration 012 (archived_at) ist noch nicht angewendet. */
function isMissingArchiveColumn(error: { code?: string; message?: string } | null): boolean {
  return error?.code === "42703" || /archived_at/.test(error?.message ?? "");
}

function coerceSchemaVersion(version: unknown): number {
  const n = typeof version === "number" ? version : Number(version);
  if (!Number.isFinite(n)) return 2;
  return Math.max(1, Math.floor(n));
}

export async function loadTrainingPlan(userId: string): Promise<TrainingPlanV2 | null> {
  const { data, error } = await supabase
    .from("training_plans")
    .select("data")
    .eq("user_id", userId)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    if (process.env.NODE_ENV === "development") {
      // eslint-disable-next-line no-console
      console.warn("[trainingPlanService] loadTrainingPlan", error.message);
    }
    return null;
  }

  if (!data || typeof data !== "object" || !("data" in data)) return null;

  const raw = (data as { data: unknown }).data;
  const normalized = normalizeTrainingPlan(raw);
  if (!validateTrainingPlanV2Integrity(normalized)) return null;
  if (normalized.workouts.length === 0) return null;

  return normalized;
}

/** Nicht archivierte Pläne (die Slots 1–MAX_ACTIVE_PLANS), nach Slot sortiert. */
export async function loadAllTrainingPlans(userId: string): Promise<TrainingPlanListItem[]> {
  const { data, error } = await supabase
    .from("training_plans")
    .select(PLAN_LIST_COLUMNS)
    .eq("user_id", userId)
    .is("archived_at", null)
    .order("plan_slot", { ascending: true });

  if (error && isMissingArchiveColumn(error)) {
    // Vor Migration 012: alte Abfrage — es gibt dann noch keine archivierten Pläne.
    const legacy = await supabase
      .from("training_plans")
      .select(LEGACY_PLAN_LIST_COLUMNS)
      .eq("user_id", userId)
      .order("plan_slot", { ascending: true });
    if (!legacy.error) {
      return ((legacy.data ?? []) as Omit<TrainingPlanListItem, "archived_at">[]).map((row) => ({
        ...row,
        archived_at: null,
      }));
    }
  }

  if (error) {
    if (process.env.NODE_ENV === "development") {
      // eslint-disable-next-line no-console
      console.warn("[trainingPlanService] loadAllTrainingPlans", error.message);
    }
    return [];
  }

  return (data ?? []) as TrainingPlanListItem[];
}

/** Abgeschlossene Vorbereitungen, neueste zuerst. */
export async function loadArchivedTrainingPlans(userId: string): Promise<TrainingPlanListItem[]> {
  const { data, error } = await supabase
    .from("training_plans")
    .select(PLAN_LIST_COLUMNS)
    .eq("user_id", userId)
    .not("archived_at", "is", null)
    .order("archived_at", { ascending: false });

  if (error) {
    if (process.env.NODE_ENV === "development") {
      // eslint-disable-next-line no-console
      console.warn("[trainingPlanService] loadArchivedTrainingPlans", error.message);
    }
    return [];
  }

  return (data ?? []) as TrainingPlanListItem[];
}

async function deactivateAllPlans(userId: string): Promise<void> {
  const { error } = await supabase
    .from("training_plans")
    .update({ is_active: false })
    .eq("user_id", userId);
  if (error) throw error;
}

async function findFreePlanSlot(userId: string): Promise<number | null> {
  const { data: existing, error } = await supabase
    .from("training_plans")
    .select("plan_slot")
    .eq("user_id", userId)
    // Archivierte Pläne haben keinen Slot (CHECK aus 012); der Filter funktioniert auch vor 012.
    .not("plan_slot", "is", null)
    .order("plan_slot", { ascending: true });

  if (error) throw error;

  const usedSlots = (existing ?? []).map((r) => r.plan_slot as number | null);
  return PLAN_SLOTS.find((s) => !usedSlots.includes(s)) ?? null;
}

export async function insertNewTrainingPlan(
  userId: string,
  plan: TrainingPlanV2,
  planName: string,
): Promise<void> {
  const freeSlot = await findFreePlanSlot(userId);
  if (freeSlot == null) {
    throw new Error(`Maximale Anzahl Trainingspläne (${MAX_ACTIVE_PLANS}) erreicht`);
  }

  await deactivateAllPlans(userId);

  const { error } = await supabase.from("training_plans").insert({
    user_id: userId,
    plan_slot: freeSlot,
    schema_version: coerceSchemaVersion(plan.version),
    plan_name: planName,
    is_active: true,
    data: sanitizeTrainingPlanRemoteData(plan),
  });

  if (error) throw error;
}

async function updateActiveTrainingPlan(userId: string, plan: TrainingPlanV2): Promise<void> {
  const data = sanitizeTrainingPlanRemoteData(plan);
  const { data: activeRow, error: loadError } = await supabase
    .from("training_plans")
    .select("id")
    .eq("user_id", userId)
    .eq("is_active", true)
    .maybeSingle();

  if (loadError) throw loadError;

  if (activeRow?.id) {
    const { error } = await supabase
      .from("training_plans")
      .update({ data, schema_version: coerceSchemaVersion(plan.version) })
      .eq("id", activeRow.id);
    if (error) throw error;
    return;
  }

  const freeSlot = await findFreePlanSlot(userId);
  if (freeSlot == null) {
    throw new Error(`Maximale Anzahl Trainingspläne (${MAX_ACTIVE_PLANS}) erreicht`);
  }

  const { error } = await supabase.from("training_plans").insert({
    user_id: userId,
    plan_slot: freeSlot,
    schema_version: coerceSchemaVersion(plan.version),
    plan_name: `Trainingsplan ${freeSlot}`,
    is_active: true,
    data,
  });
  if (error) throw error;
}

/**
 * Saves plan data. With `planName`, creates a new plan in the next free slot (1–MAX_ACTIVE_PLANS) and activates it.
 * Without `planName`, updates the currently active plan (or creates slot 1 if none exists).
 */
export async function saveTrainingPlan(
  userId: string,
  plan: TrainingPlanV2,
  planName?: string,
): Promise<void> {
  if (planName != null && planName.trim()) {
    await insertNewTrainingPlan(userId, plan, planName.trim());
    return;
  }
  await updateActiveTrainingPlan(userId, plan);
}

export async function setActivePlan(userId: string, planId: string): Promise<void> {
  await deactivateAllPlans(userId);

  const { error } = await supabase
    .from("training_plans")
    .update({ is_active: true })
    .eq("id", planId)
    .eq("user_id", userId);

  if (error) throw error;
}

export async function deletePlan(
  userId: string,
  planId: string,
): Promise<{ activatedPlanId: string | null }> {
  const { data: target, error: loadError } = await supabase
    .from("training_plans")
    .select("id, is_active")
    .eq("id", planId)
    .eq("user_id", userId)
    .maybeSingle();

  if (loadError) throw loadError;
  if (!target) return { activatedPlanId: null };

  const wasActive = target.is_active === true;

  const { error: deleteError } = await supabase
    .from("training_plans")
    .delete()
    .eq("id", planId)
    .eq("user_id", userId);

  if (deleteError) throw deleteError;

  if (!wasActive) return { activatedPlanId: null };

  const { data: remaining, error: listError } = await supabase
    .from("training_plans")
    .select("id")
    .eq("user_id", userId)
    .not("plan_slot", "is", null)
    .order("plan_slot", { ascending: true })
    .limit(1);

  if (listError) throw listError;

  const nextId = remaining?.[0]?.id ?? null;
  if (nextId) {
    await setActivePlan(userId, nextId);
  }

  return { activatedPlanId: nextId };
}

/** Zustand vor dem Archivieren — genug, um ihn bei einem Fehler danach exakt wiederherzustellen. */
export type ArchivedPlanPrevious = { slot: number; wasActive: boolean };

/**
 * Archiviert einen Plan (nicht löschen): archived_at setzen, Slot freigeben, deaktivieren.
 * Ist der Plan bereits archiviert (z. B. Wiederholung nach fehlgeschlagener Wiederherstellung),
 * passiert nichts und es gibt `null` zurück — dann gibt es auch nichts wiederherzustellen.
 */
export async function archiveTrainingPlan(userId: string, planId: string): Promise<ArchivedPlanPrevious | null> {
  const { data: target, error: loadError } = await supabase
    .from("training_plans")
    .select("id, plan_slot, is_active, archived_at")
    .eq("id", planId)
    .eq("user_id", userId)
    .maybeSingle();

  if (loadError) throw loadError;
  if (!target) throw new Error("Trainingsplan zum Archivieren nicht gefunden");
  if (target.archived_at != null) return null;

  const { error } = await supabase
    .from("training_plans")
    .update({ archived_at: getAppNow().toISOString(), plan_slot: null, is_active: false })
    .eq("id", planId)
    .eq("user_id", userId)
    .is("archived_at", null);

  if (error) throw error;
  return { slot: target.plan_slot as number, wasActive: target.is_active === true };
}

/** Macht `archiveTrainingPlan` rückgängig (nur für den Fehlerpfad beim Anlegen des neuen Plans). */
export async function restoreArchivedTrainingPlan(
  userId: string,
  planId: string,
  previous: ArchivedPlanPrevious,
): Promise<void> {
  if (previous.wasActive) await deactivateAllPlans(userId);
  const { error } = await supabase
    .from("training_plans")
    .update({ archived_at: null, plan_slot: previous.slot, is_active: previous.wasActive })
    .eq("id", planId)
    .eq("user_id", userId);
  if (error) throw error;
}
