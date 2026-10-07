import { supabase } from "../supabase/client";

/**
 * `Authorization`-Header mit dem Supabase-Session-Token für die eigenen `/api/*`-Endpunkte — der Server
 * lehnt Requests ohne gültiges Token mit 401 ab (`api/_lib/requireUser.js`). Ohne Session (oder wenn
 * Supabase nicht erreichbar ist) kommt ein leeres Objekt zurück; der Aufrufer läuft dann in den 401 und
 * damit in seinen bestehenden Fallback.
 */
export async function getApiAuthHeaders(): Promise<Record<string, string>> {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}
