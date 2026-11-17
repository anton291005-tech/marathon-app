/**
 * Nutzungsdaten für den Freundes-Test: wenige feste Ereignisse, ohne Freitext, ohne Gesundheitswerte.
 * Ziel ist die Frage „wird die App benutzt, und welche Vorschläge werden angenommen?" — nichts weiter.
 *
 * Regeln:
 * - Nur die Namen aus `USAGE_EVENT_NAMES`; Props werden je Ereignis auf eine Positivliste gekürzt
 *   (`count` als ganze Zahl, `source` aus einer festen Liste). Alles andere fällt weg.
 * - `trackUsageEvent` wirft nie und blockiert nie (Senden läuft im Hintergrund, Fehler werden geschluckt).
 * - `app_open` höchstens einmal pro Stunde (lokal gemerkt). Gemerkt wird erst, wenn das Insert geklappt hat — ein
 *   gescheitertes Senden (offline, Tabelle fehlt, keine Sitzung) sperrt den nächsten Start nicht.
 * - Abschaltbar in Einstellungen → Datenschutz & Daten; die Wahl liegt lokal auf dem Gerät.
 * - Fehlt die Tabelle `usage_events` (Migration 025 nicht angewendet), wird für den Rest der Sitzung
 *   nichts mehr gesendet.
 * - Die Daten gehen an Supabase (eigene Tabelle, RLS), an kein Sprachmodell.
 */

import { getAppNowEpochMs } from "../core/time/timeSystem";
import { isSupabaseConfigured, supabase } from "../lib/supabase/client";
import { safeReadLocalStorageItem, safeWriteLocalStorageItem } from "../persistence/safeLocalStorage";

export const USAGE_EVENT_NAMES = [
  "app_open",
  "onboarding_done",
  "shift_entries_saved",
  "shift_proposal_shown",
  "shift_proposal_accepted",
  "shift_proposal_declined",
  "session_completed",
  "feedback_sent",
] as const;

export type UsageEventName = (typeof USAGE_EVENT_NAMES)[number];

export const SESSION_COMPLETED_SOURCES = ["manual", "apple_health", "strava"] as const;
export type SessionCompletedSource = (typeof SESSION_COMPLETED_SOURCES)[number];

/** Erlaubte Props je Ereignis. Ereignisse ohne Eintrag haben keine Props. */
export type UsageEventProps = {
  app_open: undefined;
  onboarding_done: undefined;
  shift_entries_saved: { count: number };
  shift_proposal_shown: undefined;
  shift_proposal_accepted: undefined;
  shift_proposal_declined: undefined;
  session_completed: { source: SessionCompletedSource };
  feedback_sent: undefined;
};

export type UsageEventRow = { name: UsageEventName; props: Record<string, string | number> };

/**
 * Wahl „Nutzung zählen" (`"1"` an, `"0"` aus, fehlt = Standard), je Person: `marathonUsageEventsEnabled:<userId>`.
 * Steht nicht in der Löschliste beim Abmelden — wer ausschaltet, bleibt nach Ab- und Wiederanmelden aus; ein
 * anderes Konto auf demselben Gerät hat seine eigene Wahl.
 */
export const USAGE_EVENTS_ENABLED_KEY = "marathonUsageEventsEnabled";

export function usageEventsEnabledKey(userId: string | null | undefined): string {
  const id = typeof userId === "string" ? userId.trim() : "";
  return id ? `${USAGE_EVENTS_ENABLED_KEY}:${id}` : USAGE_EVENTS_ENABLED_KEY;
}

let usageUserId: string | null = null;

/** Angemeldete Person für die Wahl „Nutzung zählen" (AppMain über `useAppOpenTracking`). */
export function setUsageEventsUser(userId: string | null | undefined): void {
  usageUserId = typeof userId === "string" && userId.trim() ? userId.trim() : null;
}
/** Zeitpunkte der gedrosselten Ereignisse, `{ app_open: epochMs }`. */
export const USAGE_EVENTS_THROTTLE_KEY = "marathonUsageEventsThrottle";

// ENTSCHEIDUNG (Anton absegnen): Standard AN für den Freundes-Test. Begründung: pseudonym (nur Nutzer-ID),
// keine Inhalte, keine Gesundheitswerte, jederzeit abschaltbar; die Freunde werden im TestFlight-Text darauf
// hingewiesen. Für einen öffentlichen Start eher Standard AUS bzw. Einwilligung im Onboarding.
export const USAGE_EVENTS_DEFAULT_ENABLED = true;

export const APP_OPEN_THROTTLE_MS = 60 * 60 * 1000;

const NAME_SET = new Set<string>(USAGE_EVENT_NAMES);
const SOURCE_SET = new Set<string>(SESSION_COMPLETED_SOURCES);

export function isUsageEventName(name: unknown): name is UsageEventName {
  return typeof name === "string" && NAME_SET.has(name);
}

/** Props auf die Positivliste kürzen; `null` = Ereignis verwerfen (Pflicht-Prop fehlt/ungültig). */
export function sanitizeUsageEventProps(name: UsageEventName, props: unknown): Record<string, string | number> | null {
  const p = props != null && typeof props === "object" ? (props as Record<string, unknown>) : {};
  if (name === "shift_entries_saved") {
    const count = typeof p.count === "number" && Number.isFinite(p.count) ? Math.round(p.count) : NaN;
    if (!Number.isFinite(count) || count < 0) return null;
    return { count: Math.min(count, 10_000) };
  }
  if (name === "session_completed") {
    return typeof p.source === "string" && SOURCE_SET.has(p.source) ? { source: p.source } : null;
  }
  return {};
}

export function isUsageEventsEnabled(userId: string | null | undefined = usageUserId): boolean {
  const raw = safeReadLocalStorageItem(usageEventsEnabledKey(userId));
  if (raw === "1") return true;
  if (raw === "0") return false;
  return USAGE_EVENTS_DEFAULT_ENABLED;
}

export function setUsageEventsEnabled(enabled: boolean, userId: string | null | undefined = usageUserId): void {
  safeWriteLocalStorageItem(usageEventsEnabledKey(userId), enabled ? "1" : "0");
}

function readThrottle(): Record<string, number> {
  const raw = safeReadLocalStorageItem(USAGE_EVENTS_THROTTLE_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

/** Gedrosselte Ereignisse (höchstens eins je `APP_OPEN_THROTTLE_MS`). */
const THROTTLED_EVENTS: ReadonlySet<UsageEventName> = new Set<UsageEventName>(["app_open"]);

export function isThrottledEvent(name: UsageEventName): boolean {
  return THROTTLED_EVENTS.has(name);
}

/** `true`, wenn das Ereignis jetzt gesendet werden darf. Liest nur — gemerkt wird mit `markThrottled`. */
export function passesThrottle(name: UsageEventName, nowMs: number): boolean {
  if (!isThrottledEvent(name)) return true;
  const map = readThrottle();
  const last = typeof map[name] === "number" ? map[name] : null;
  return !(last != null && nowMs >= last && nowMs - last < APP_OPEN_THROTTLE_MS);
}

/** Zeitpunkt eines erfolgreich gesendeten gedrosselten Ereignisses merken. */
export function markThrottled(name: UsageEventName, nowMs: number): void {
  if (!isThrottledEvent(name)) return;
  safeWriteLocalStorageItem(USAGE_EVENTS_THROTTLE_KEY, JSON.stringify({ ...readThrottle(), [name]: nowMs }));
}

/** Senke: `false` (oder Fehler) = nicht gespeichert; `true`/ohne Rückgabe = gespeichert. */
type UsageEventSink = (row: UsageEventRow) => Promise<boolean | void>;

function isMissingTableError(error: { code?: string | null } | null | undefined): boolean {
  const code = error?.code ?? "";
  return code === "42P01" || code === "PGRST205";
}

let tableMissing = false;

const supabaseSink: UsageEventSink = async (row) => {
  if (!isSupabaseConfigured || tableMissing) return false;
  const { data } = await supabase.auth.getSession();
  const userId = data?.session?.user?.id;
  if (!userId) return false;
  const { error } = await supabase.from("usage_events").insert({ user_id: userId, name: row.name, props: row.props });
  if (isMissingTableError(error)) tableMissing = true;
  return !error;
};

/** Gedrosselte Ereignisse, deren Insert noch läuft (Start und `visibilitychange` gleichzeitig → nur eins). */
const inFlight = new Set<UsageEventName>();

let sink: UsageEventSink = supabaseSink;

/** Nur für Tests: Senke ersetzen (`null` = Standard) und Sitzungszustand zurücksetzen. */
export function __setUsageEventSinkForTests(next: UsageEventSink | null): void {
  sink = next ?? supabaseSink;
  tableMissing = false;
  inFlight.clear();
  usageUserId = null;
}

/**
 * Ereignis melden. Gibt sofort zurück; wirft nie. Unbekannte Namen, ungültige Props, abgeschaltete
 * Nutzungsdaten und gedrosselte Ereignisse werden still verworfen.
 */
export function trackUsageEvent<N extends UsageEventName>(
  name: N,
  ...rest: UsageEventProps[N] extends undefined ? [props?: undefined] : [props: UsageEventProps[N]]
): void {
  try {
    if (!isUsageEventName(name)) return;
    if (!isUsageEventsEnabled()) return;
    const props = sanitizeUsageEventProps(name, rest[0]);
    if (props == null) return;
    const nowMs = getAppNowEpochMs();
    if (!passesThrottle(name, nowMs)) return;
    const throttled = isThrottledEvent(name);
    if (throttled) {
      if (inFlight.has(name)) return;
      inFlight.add(name);
    }
    const row: UsageEventRow = { name, props };
    void Promise.resolve()
      .then(() => sink(row))
      .then((stored) => {
        // Drossel erst nach erfolgreichem Insert: sonst sperrt ein gescheitertes Senden den nächsten Start.
        if (throttled && stored !== false) markThrottled(name, nowMs);
      })
      .catch(() => {
        /* offline, RLS, Tabelle fehlt: Nutzungsdaten dürfen nie stören */
      })
      .finally(() => {
        if (throttled) inFlight.delete(name);
      });
  } catch {
    /* nie werfen */
  }
}

/** Wie viele Einheiten sind zwischen zwei Log-Ständen neu erledigt (`done` false → true)? */
export function countNewlyCompletedSessions(
  before: Record<string, { done?: unknown } | null | undefined> | null | undefined,
  after: Record<string, { done?: unknown } | null | undefined> | null | undefined,
): number {
  if (!after) return 0;
  let n = 0;
  for (const id of Object.keys(after)) {
    if (after[id]?.done === true && before?.[id]?.done !== true) n += 1;
  }
  return n;
}

/** `session_completed` je neu erledigter Einheit (höchstens 20 auf einmal, z. B. nach einem Health-Nachholen). */
export function trackCompletedSessions(
  before: Parameters<typeof countNewlyCompletedSessions>[0],
  after: Parameters<typeof countNewlyCompletedSessions>[1],
  source: SessionCompletedSource,
  /** `logsRemoteReady: false` = Logs aus Supabase noch nicht geladen → nichts zählen (alte Einheiten wären „neu"). */
  opts?: { logsRemoteReady?: boolean },
): void {
  try {
    if (opts && opts.logsRemoteReady === false) return;
    const n = Math.min(20, countNewlyCompletedSessions(before, after));
    for (let i = 0; i < n; i += 1) trackUsageEvent("session_completed", { source });
  } catch {
    /* nie werfen */
  }
}

/**
 * `session_completed` je Eintrag aus `applyAppleHealthTrainingSync(...).completions` – dort ist die Quelle
 * (Apple Health oder Strava-Import) je Einheit bekannt. Gleiche Grenzen wie `trackCompletedSessions`.
 */
export function trackSyncCompletions(
  completions: ReadonlyArray<{ source: "apple_health" | "strava" }> | null | undefined,
  opts?: { logsRemoteReady?: boolean },
): void {
  try {
    if (opts && opts.logsRemoteReady === false) return;
    if (!completions) return;
    const n = Math.min(20, completions.length);
    for (let i = 0; i < n; i += 1) {
      const source: SessionCompletedSource = completions[i].source === "strava" ? "strava" : "apple_health";
      trackUsageEvent("session_completed", { source });
    }
  } catch {
    /* nie werfen */
  }
}
