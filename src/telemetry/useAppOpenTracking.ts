import { useEffect } from "react";
import { trackUsageEvent } from "./usageEvents";

/**
 * `app_open` beim Start mit angemeldetem Nutzer und bei jeder Rückkehr in den Vordergrund
 * (`visibilitychange` — feuert im Browser und im iOS-WebView). Die Drossel in `trackUsageEvent`
 * begrenzt das auf höchstens ein Ereignis pro Stunde.
 */
export function useAppOpenTracking(userId: string | null | undefined): void {
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
