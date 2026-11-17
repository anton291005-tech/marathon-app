/**
 * Feedback aus der App (Freundes-Test): ein Textfeld, optional eine Kategorie, automatisch angehängt
 * App-Version, Bildschirm, Gerät/OS und Datum. Bewusst ohne Plan-, Lauf- oder Gesundheitsdaten.
 * Feedback geht an Supabase (`user_feedback`) bzw. per Mail an den Support — an kein Sprachmodell.
 */

import { buildMailtoUrl, parseIosVersion, SUPPORT_EMAIL } from "../settings/appInfo";

export type FeedbackCategory = "bug" | "idea" | "praise";

export const FEEDBACK_CATEGORIES: ReadonlyArray<{ value: FeedbackCategory; label: string }> = [
  { value: "bug", label: "Fehler" },
  { value: "idea", label: "Idee" },
  { value: "praise", label: "Lob" },
];

export const FEEDBACK_MESSAGE_MAX = 4000;

/** So lange nach der Registrierung steht der Feedback-Eintrag auf „Heute". */
export const FEEDBACK_ENTRY_DAYS = 14;

/** Wo das Feedback geöffnet wurde (Spalte `screen`). */
export type FeedbackScreen = "home" | "settings";

export type FeedbackRecord = {
  category: FeedbackCategory | null;
  message: string;
  appVersion: string;
  screen: FeedbackScreen;
  device: string;
};

/** „iOS 17.5.1", „Android 14" oder „Web" — ohne Gerätemodell, ohne weitere Kennungen. */
export function describeDevice(userAgent: string | null | undefined, platform: string | null | undefined): string {
  const ios = parseIosVersion(userAgent);
  if (ios) return `iOS ${ios}`;
  const android = /\bAndroid (\d+(?:\.\d+){0,2})/.exec(userAgent ?? "");
  if (android) return `Android ${android[1]}`;
  if (platform === "ios") return "iOS";
  if (platform === "android") return "Android";
  return "Web";
}

export function buildFeedbackRecord(args: {
  message: string;
  category: FeedbackCategory | null;
  appVersion: string;
  screen: FeedbackScreen;
  userAgent: string | null | undefined;
  platform: string | null | undefined;
}): FeedbackRecord | null {
  const message = args.message.trim().slice(0, FEEDBACK_MESSAGE_MAX);
  if (!message) return null;
  return {
    category: args.category,
    message,
    appVersion: String(args.appVersion || "").slice(0, 64),
    screen: args.screen,
    device: describeDevice(args.userAgent, args.platform).slice(0, 128),
  };
}

const SCREEN_LABEL: Record<FeedbackScreen, string> = { home: "Heute", settings: "Einstellungen" };

/** Rückfall ohne Tabelle: dieselben Angaben als Mail an den Support. */
export function buildFeedbackFallbackMailto(record: FeedbackRecord, todayYmd: string, to: string = SUPPORT_EMAIL): string {
  const category = FEEDBACK_CATEGORIES.find((c) => c.value === record.category)?.label ?? "ohne Kategorie";
  return buildMailtoUrl({
    to,
    subject: `MyRace Feedback (${category})`,
    body: [
      record.message,
      "",
      "—",
      `App-Version: ${record.appVersion}`,
      `Bildschirm: ${SCREEN_LABEL[record.screen]}`,
      `Gerät: ${record.device}`,
      `Datum: ${todayYmd}`,
    ].join("\n"),
  });
}

/**
 * Feedback-Eintrag auf „Heute": in den ersten 14 Tagen nach der Registrierung (`user.created_at`),
 * bis er weggeklickt wurde. Ohne lesbares Registrierungsdatum kein Eintrag.
 */
export function isFeedbackEntryVisible(args: {
  createdAt: string | null | undefined;
  nowMs: number;
  dismissed: boolean;
}): boolean {
  if (args.dismissed) return false;
  const created = typeof args.createdAt === "string" ? Date.parse(args.createdAt) : NaN;
  if (!Number.isFinite(created)) return false;
  const age = args.nowMs - created;
  return age >= -60_000 && age < FEEDBACK_ENTRY_DAYS * 86_400_000;
}

export const FEEDBACK_ENTRY_DISMISSED_KEY = "marathonFeedbackEntryDismissed";
