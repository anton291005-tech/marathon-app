import { useEffect, useState } from "react";

/**
 * Ohne eigenen Plan startet AppMain mit dem eingebauten Demo-Plan (Warschau-Marathon 2026), bis Supabase
 * geantwortet hat. Ein frisches Konto sah dadurch kurz fremde Einheiten („Anreise Warschau"), bevor der
 * Wizard kam. Die Abdeckung liegt in dieser Zeit über allem — ruhige Fläche, kein Spinner.
 */
export function shouldCoverForFreshAccount(args: {
  signedIn: boolean;
  hasUserTrainingPlan: boolean;
  hydrationReady: boolean;
}): boolean {
  return args.signedIn && !args.hasUserTrainingPlan && !args.hydrationReady;
}

/** Höchstdauer der Abdeckung: hängt Supabase, bleibt die App bedienbar (lieber kurz Demo-Plan als leerer Schirm). */
export const FRESH_ACCOUNT_BOOT_COVER_MAX_MS = 10_000;

export function FreshAccountBootCover({
  visible,
  maxMs = FRESH_ACCOUNT_BOOT_COVER_MAX_MS,
}: {
  visible: boolean;
  maxMs?: number;
}) {
  const [expired, setExpired] = useState(false);
  useEffect(() => {
    if (!visible) {
      // Abmelden oder Daten da: Abdeckung weg, die Höchstdauer gilt beim nächsten Mal neu.
      setExpired(false);
      return undefined;
    }
    const timer = setTimeout(() => setExpired(true), maxMs);
    return () => clearTimeout(timer);
  }, [visible, maxMs]);

  if (!visible || expired) return null;
  return (
    <div
      data-testid="fresh-account-boot-cover"
      aria-busy="true"
      aria-label="Lädt"
      style={{ position: "fixed", inset: 0, zIndex: 950, background: "var(--surface-0)" }}
    />
  );
}
