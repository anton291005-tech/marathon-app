import { useEffect } from "react";
import { setUsageEventsUser, trackUsageEvent } from "./usageEvents";

/**
 * Meldet die angemeldete Person an die Nutzungsdaten (Wahl „Nutzung zählen" je Nutzer-ID) und zählt `app_open`
 * beim Start und bei jeder Rückkehr in den Vordergrund (`visibilitychange` — feuert im Browser und im iOS-WebView).
 * Die Drossel in `trackUsageEvent` begrenzt das auf höchstens ein Ereignis pro Stunde.
 */
export function useAppOpenTracking(userId: string | null | undefined): void {
  // Synchron im Render, damit Ereignisse aus Effekten derselben Runde schon die Wahl dieser Person sehen.
  setUsageEventsUser(userId ?? null);
  useEffect(() => {
    if (!userId) return undefined;
    trackUsageEvent("app_open");
    if (typeof document === "undefined") return undefined;
    const onVisibility = () => {
      if (document.visibilityState === "visible") trackUsageEvent("app_open");
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [userId]);
}
