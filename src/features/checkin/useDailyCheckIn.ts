import { useCallback, useEffect, useRef, useState } from "react";
import { loadDailyCheckins, saveDailyCheckin } from "../../lib/supabase/services/dailyCheckinsService";
import { type CheckInEntry, readCheckInCache, shiftYmd, writeCheckInCache } from "./checkInState";
import { loadHealthConsent, saveHealthConsent } from "./healthConsent";

export type HealthConsentStatus = "loading" | "granted" | "undecided" | "unavailable";

export type DailyCheckInController = {
  today: CheckInEntry | null;
  yesterday: CheckInEntry | null;
  consent: HealthConsentStatus;
  grantConsent: () => Promise<boolean>;
  /** Speichert lokal sofort, dann in Supabase; scheitert das, wird beim nächsten Laden nachgereicht. */
  save: (entry: CheckInEntry) => Promise<void>;
};

/** Morgen-Check-in (Readiness Schritt 3): lokaler Cache + Supabase, offline nachreichen. */
export function useDailyCheckIn(userId: string | null | undefined, todayYmd: string): DailyCheckInController {
  const [entries, setEntries] = useState<Record<string, CheckInEntry>>(() => readCheckInCache().entries);
  const [consent, setConsent] = useState<HealthConsentStatus>("loading");
  const todayRef = useRef(todayYmd);
  todayRef.current = todayYmd;

  useEffect(() => {
    if (!userId) {
      setConsent("loading");
      return undefined;
    }
    let cancelled = false;
    void (async () => {
      const consentResult = await loadHealthConsent(userId);
      if (cancelled) return;
      setConsent(consentResult.ok ? (consentResult.granted ? "granted" : "undecided") : "unavailable");
      if (!consentResult.ok || !consentResult.granted) return;

      // Ausstehende Tage nachreichen, dann Server-Stand holen (lokal ausstehende Tage gewinnen).
      const cache = readCheckInCache();
      const stillPending: string[] = [];
      for (const day of cache.pending) {
        const entry = cache.entries[day];
        if (entry && !(await saveDailyCheckin(userId, entry))) stillPending.push(day);
      }
      const remote = await loadDailyCheckins(userId, shiftYmd(todayRef.current, -28));
      if (cancelled) return;
      const merged: Record<string, CheckInEntry> = { ...cache.entries };
      (remote ?? []).forEach((entry) => {
        if (!stillPending.includes(entry.day)) merged[entry.day] = entry;
      });
      writeCheckInCache({ entries: merged, pending: stillPending }, todayRef.current);
      setEntries(merged);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const grantConsent = useCallback(async () => {
    if (!userId) return false;
    const ok = await saveHealthConsent(userId, true);
    if (ok) setConsent("granted");
    return ok;
  }, [userId]);

  const save = useCallback(
    async (entry: CheckInEntry) => {
      const cache = readCheckInCache();
      const nextEntries = { ...cache.entries, [entry.day]: entry };
      writeCheckInCache({ entries: nextEntries, pending: [...cache.pending, entry.day] }, todayRef.current);
      setEntries(nextEntries);
      if (!userId) return;
      if (await saveDailyCheckin(userId, entry)) {
        const after = readCheckInCache();
        writeCheckInCache({ entries: after.entries, pending: after.pending.filter((d) => d !== entry.day) }, todayRef.current);
      }
    },
    [userId],
  );

  return {
    today: entries[todayYmd] ?? null,
    yesterday: entries[shiftYmd(todayYmd, -1)] ?? null,
    consent,
    grantConsent,
    save,
  };
}
