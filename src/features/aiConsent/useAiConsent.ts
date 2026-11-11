import { useCallback, useEffect, useState } from "react";
import { loadAiConsentRow, saveAiConsent } from "../../lib/supabase/services/aiConsentService";
import { readDeclinedOnDevice, statusFromConsentRow, writeDeclinedOnDevice, type AiConsentStatus } from "./aiConsentState";

export type AiConsentController = {
  status: AiConsentStatus;
  /** Zustimmen: erst gespeichert (Supabase), dann `granted`. `false`, wenn das Speichern scheitert. */
  grant: () => Promise<boolean>;
  /**
   * Ablehnen: sofort `declined` und auf dem Gerät gemerkt. Zusätzlich wird eine evtl. schon gespeicherte Zustimmung
   * in Supabase gelöscht (z. B. Zustimmung von einem anderen Gerät, Status hier `unavailable`) — sonst gewänne sie
   * beim nächsten Start und der Server nähme weiter an.
   */
  decline: () => void;
  /** Widerrufen: Zustimmung in Supabase löschen. `false`, wenn das scheitert — dann bleibt der Status. */
  revoke: () => Promise<boolean>;
};

export function useAiConsent(userId: string | null | undefined): AiConsentController {
  const [status, setStatus] = useState<AiConsentStatus>("loading");
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (!userId) {
      setStatus("loading");
      return undefined;
    }
    let cancelled = false;
    void loadAiConsentRow(userId).then((result) => {
      if (cancelled) return;
      if (!result.ok) {
        setStatus("unavailable");
        return;
      }
      const declinedOnDevice = readDeclinedOnDevice(userId);
      setStatus(statusFromConsentRow(result.row, declinedOnDevice));
    });
    return () => {
      cancelled = true;
    };
  }, [userId, reloadToken]);

  // Nicht lesbar (offline, Fehler): beim Zurückkehren in die App neu versuchen, statt bis zum Neustart gesperrt zu bleiben.
  useEffect(() => {
    if (status !== "unavailable" || typeof document === "undefined") return undefined;
    const retry = () => {
      if (document.visibilityState === "visible") setReloadToken((n) => n + 1);
    };
    document.addEventListener("visibilitychange", retry);
    window.addEventListener("online", retry);
    return () => {
      document.removeEventListener("visibilitychange", retry);
      window.removeEventListener("online", retry);
    };
  }, [status]);

  const grant = useCallback(async () => {
    if (!userId) return false;
    const ok = await saveAiConsent(userId, true);
    if (ok) {
      writeDeclinedOnDevice(userId, false);
      setStatus("granted");
    }
    return ok;
  }, [userId]);

  const decline = useCallback(() => {
    if (!userId) return;
    writeDeclinedOnDevice(userId, true);
    setStatus("declined");
    void saveAiConsent(userId, false);
  }, [userId]);

  const revoke = useCallback(async () => {
    if (!userId) return false;
    const ok = await saveAiConsent(userId, false);
    if (ok) {
      writeDeclinedOnDevice(userId, true);
      setStatus("declined");
    }
    return ok;
  }, [userId]);

  return { status, grant, decline, revoke };
}
