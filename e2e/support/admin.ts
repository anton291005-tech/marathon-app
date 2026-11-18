/**
 * Lesezugriff auf Supabase mit dem Service-Role-Schlüssel der lokalen API-Umgebung.
 * AUSSCHLIESSLICH GET — die Suite ändert Production-Daten nur über die App selbst (eigenes Testkonto).
 */
import { ENV, HAS_ADMIN_READ } from "./env";

const headers = (): Record<string, string> => ({ apikey: ENV.serviceRoleKey, Authorization: `Bearer ${ENV.serviceRoleKey}` });

async function getJson<T>(pathAndQuery: string, extra: Record<string, string> = {}): Promise<{ status: number; body: T; contentRange: string | null }> {
  if (!HAS_ADMIN_READ) throw new Error("Kein Lesezugriff (SUPABASE_SERVICE_ROLE_KEY fehlt in .env.local)");
  const res = await fetch(`${ENV.supabaseUrl}${pathAndQuery}`, { method: "GET", headers: { ...headers(), ...extra } });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: res.status, body: body as T, contentRange: res.headers.get("content-range") };
}

/** Tabellen mit `user_id`, die zu einem Konto gehören können. */
export const USER_TABLES = [
  "profiles",
  "training_plans",
  "session_logs",
  "plan_patches",
  "shift_entries",
  "usage_events",
  "user_feedback",
  "health_workouts",
  "recovery_daily",
  "coach_memory",
  "api_usage",
  "prep_recaps",
  "daily_checkins",
  "weekly_schedule_blocks",
  "strava_connections",
] as const;

export async function countRows(table: string, userId: string): Promise<number | null> {
  const r = await getJson<unknown>(`/rest/v1/${table}?user_id=eq.${userId}&select=user_id`, { Prefer: "count=exact", Range: "0-0" });
  if (r.status >= 400) return null; // Tabelle fehlt o. Ä.
  const total = r.contentRange?.split("/")[1];
  return total != null && total !== "*" ? Number(total) : 0;
}

export async function rows<T = Record<string, unknown>>(table: string, userId: string, select = "*", order = ""): Promise<T[]> {
  const r = await getJson<T[]>(`/rest/v1/${table}?user_id=eq.${userId}&select=${select}${order ? `&order=${order}` : ""}`);
  return Array.isArray(r.body) ? r.body : [];
}

export async function authUserExists(userId: string): Promise<boolean> {
  const r = await getJson<unknown>(`/auth/v1/admin/users/${userId}`);
  return r.status === 200;
}

/** Alle Auth-Konten mit dem E2E-Muster (für den Abschlussbericht „übrig gebliebene Testkonten“). */
export async function listE2eAccounts(): Promise<Array<{ id: string; email: string; created_at: string }>> {
  const r = await getJson<{ users?: Array<{ id: string; email?: string; created_at: string }> }>(`/auth/v1/admin/users?per_page=1000`);
  return (r.body?.users ?? [])
    .filter((u) => /^myrace-e2e-\d+@example\.com$/.test(u.email ?? ""))
    .map((u) => ({ id: u.id, email: u.email as string, created_at: u.created_at }));
}

export type PlanWorkout = { id: string; dateIso: string; sessionType: string; title: string; km: number };

export async function activePlanWorkouts(userId: string): Promise<PlanWorkout[]> {
  const list = await rows<{ is_active: boolean; data: { workouts?: PlanWorkout[] } }>("training_plans", userId, "is_active,data");
  const active = list.find((p) => p.is_active) ?? list[0];
  return active?.data?.workouts ?? [];
}

export async function usageEvents(userId: string): Promise<Array<{ name: string; props: Record<string, unknown>; created_at: string }>> {
  return rows("usage_events", userId, "name,props,created_at", "created_at");
}
