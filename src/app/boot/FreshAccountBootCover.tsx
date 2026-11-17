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

export function FreshAccountBootCover({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <div
      data-testid="fresh-account-boot-cover"
      aria-busy="true"
      aria-label="Lädt"
      style={{ position: "fixed", inset: 0, zIndex: 950, background: "var(--surface-0)" }}
    />
  );
}
