import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { loadDailyCheckins, saveDailyCheckin } from "../../lib/supabase/services/dailyCheckinsService";
import { type CheckInEntry, readCheckInCache, shiftYmd, writeCheckInCache } from "./checkInState";
import {
  getHealthConsentState,
  setHealthConsentStatus,
  subscribeHealthConsent,
  type HealthConsentStatus,
} from "../../health/healthConsentStore";
import { applyLoadedHealthConsent, loadHealthConsent, markHealthConsentGranted, saveHealthConsent } from "./healthConsent";

export type { HealthConsentStatus };

/** Status der Gesundheits-Zustimmung für diesen Nutzer aus dem App-Zustand (`loading`, solange nicht geladen). */
export function useHealthConsentStatus(userId: string | null | undefined): HealthConsentStatus {
  const state = useSyncExternalStore(subscribeHealthConsent, getHealthConsentState, getHealthConsentState);
  return userId && state.userId === userId ? state.status : "loading";
}

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
  const consent = useHealthConsentStatus(userId);
  const todayRef = useRef(todayYmd);
  todayRef.current = todayYmd;

  useEffect(() => {
    if (!userId) return undefined;
    let cancelled = false;
    setHealthConsentStatus(userId, "loading");
    void (async () => {
      const consentResult = await loadHealthConsent(userId);
      if (cancelled) return;
      applyLoadedHealthConsent(userId, consentResult);
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

  // Nachreichen auch beim Zurückkommen in die App und beim Wiederverbinden, nicht nur beim Laden.
  useEffect(() => {
    if (!userId || consent !== "granted" || typeof window === "undefined") return undefined;
    let running = false;
    const flush = async () => {
      if (running) return;
      const cache = readCheckInCache();
      if (!cache.pending.length) return;
      running = true;
      const done: string[] = [];
      for (const day of cache.pending) {
        const entry = cache.entries[day];
        if (entry && (await saveDailyCheckin(userId, entry))) done.push(day);
      }
      const after = readCheckInCache();
      writeCheckInCache({ entries: after.entries, pending: after.pending.filter((d) => !done.includes(d)) }, todayRef.current);
      running = false;
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") void flush();
    };
    window.addEventListener("online", flush);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("online", flush);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [userId, consent]);

  const grantConsent = useCallback(async () => {
    if (!userId) return false;
    const ok = await saveHealthConsent(userId, true);
    if (ok) markHealthConsentGranted(userId);
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
