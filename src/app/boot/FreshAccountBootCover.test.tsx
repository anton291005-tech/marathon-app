import { fireEvent, render, screen } from "@testing-library/react";
import { FreshAccountBootCover, shouldCoverForFreshAccount } from "./FreshAccountBootCover";
import { UsageEventsSetting } from "../../features/settings/UsageEventsSetting";
import { isUsageEventsEnabled } from "../../telemetry/usageEvents";

describe("FreshAccountBootCover (kein Demo-Plan für frische Konten)", () => {
  it("deckt nur ab, solange ein Konto ohne eigenen Plan auf Supabase wartet", () => {
    expect(shouldCoverForFreshAccount({ signedIn: true, hasUserTrainingPlan: false, hydrationReady: false })).toBe(true);
    expect(shouldCoverForFreshAccount({ signedIn: true, hasUserTrainingPlan: false, hydrationReady: true })).toBe(false);
    // Bestandsnutzer mit lokalem Plan: sofort die App, keine Abdeckung.
    expect(shouldCoverForFreshAccount({ signedIn: true, hasUserTrainingPlan: true, hydrationReady: false })).toBe(false);
    expect(shouldCoverForFreshAccount({ signedIn: false, hasUserTrainingPlan: false, hydrationReady: false })).toBe(false);
  });

  it("rendert eine ruhige Fläche oder nichts", () => {
    const { rerender } = render(<FreshAccountBootCover visible />);
    expect(screen.getByTestId("fresh-account-boot-cover")).toBeInTheDocument();
    rerender(<FreshAccountBootCover visible={false} />);
    expect(screen.queryByTestId("fresh-account-boot-cover")).toBeNull();
  });
});

describe("UsageEventsSetting (Datenschutz & Daten)", () => {
  beforeEach(() => localStorage.clear());

  it("schaltet die Nutzungsdaten aus und wieder an und merkt sich die Wahl", () => {
    render(<UsageEventsSetting />);
    const row = screen.getByRole("button", { name: /Nutzung zählen/ });
    expect(row).toHaveTextContent("An");
    fireEvent.click(row);
    expect(row).toHaveTextContent("Aus");
    expect(isUsageEventsEnabled()).toBe(false);
    fireEvent.click(row);
    expect(isUsageEventsEnabled()).toBe(true);
  });
});
