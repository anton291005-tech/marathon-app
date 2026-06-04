import { getApiBaseUrl } from "../../api/apiBaseUrl";
import { supabase } from "../client";

export async function deleteAccountViaApi(): Promise<void> {
  const { data, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) {
    throw new Error(sessionError.message);
  }
  const token = data.session?.access_token;
  if (!token) {
    throw new Error("Nicht angemeldet");
  }

  const res = await fetch(`${getApiBaseUrl()}/api/account`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });

  // eslint-disable-next-line no-console
  console.log("[deleteAccountService] response status:", res.status);
  const responseText = await res.clone().text();
  // eslint-disable-next-line no-console
  console.log("[deleteAccountService] response body:", responseText);

  let body: { error?: string; success?: boolean } = {};
  try {
    body = (await res.json()) as { error?: string; success?: boolean };
  } catch {
    // ignore non-JSON
  }

  if (!res.ok || body.success !== true) {
    throw new Error(
      typeof body.error === "string" && body.error.trim()
        ? body.error
        : "Account konnte nicht gelöscht werden",
    );
  }
}
