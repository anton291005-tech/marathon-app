import type { FeedbackRecord } from "../../../features/feedback/feedbackModel";
import { isSupabaseConfigured, supabase } from "../client";

/**
 * `saved` = in `user_feedback` (Migration 025); `unavailable` = Tabelle fehlt (42P01/PGRST205) oder
 * Supabase nicht konfiguriert → Rückfall per Mail; `error` = alles andere (offline, RLS).
 */
export type FeedbackSubmitResult = { status: "saved" } | { status: "unavailable" } | { status: "error" };

function isMissingTable(error: { code?: string | null; message?: string | null } | null | undefined): boolean {
  const code = error?.code ?? "";
  if (code === "42P01" || code === "PGRST205") return true;
  return /relation .*user_feedback.* does not exist|could not find the table/i.test(error?.message ?? "");
}

export async function submitFeedback(userId: string | null | undefined, record: FeedbackRecord): Promise<FeedbackSubmitResult> {
  if (!isSupabaseConfigured) return { status: "unavailable" };
  if (!userId) return { status: "error" };
  try {
    const { error } = await supabase.from("user_feedback").insert({
      user_id: userId,
      category: record.category,
      message: record.message,
      app_version: record.appVersion,
      screen: record.screen,
      device: record.device,
    });
    if (!error) return { status: "saved" };
    if (isMissingTable(error)) return { status: "unavailable" };
    return { status: "error" };
  } catch {
    return { status: "error" };
  }
}
