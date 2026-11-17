import { act, fireEvent, render, screen } from "@testing-library/react";
import { FRESH_ACCOUNT_BOOT_COVER_MAX_MS, FreshAccountBootCover, shouldCoverForFreshAccount } from "./FreshAccountBootCover";
import { UsageEventsSetting } from "../../features/settings/UsageEventsSetting";
import { isUsageEventsEnabled } from "../../telemetry/usageEvents";

describe("FreshAccountBootCover (kein Demo-Plan für frische Konten)", () => {
  afterEach(() => jest.useRealTimers());

  it("deckt nur ab, solange ein Konto ohne eigenen Plan auf Supabase wartet", () => {
    expect(shouldCoverForFreshAccount({ signedIn: true, hasUserTrainingPlan: false, hydrationReady: false })).toBe(true);
    expect(shouldCoverForFreshAccount({ signedIn: true, hasUserTrainingPlan: false, hydrationReady: true })).toBe(false);
    // Bestandsnutzer mit lokalem Plan: sofort die App, keine Abdeckung.
    expect(shouldCoverForFreshAccount({ signedIn: true, hasUserTrainingPlan: true, hydrationReady: false })).toBe(false);
    // Abgemeldet: nie abdecken.
    expect(shouldCoverForFreshAccount({ signedIn: false, hasUserTrainingPlan: false, hydrationReady: false })).toBe(false);
  });

  it("rendert eine ruhige Fläche oder nichts", () => {
    const { rerender } = render(<FreshAccountBootCover visible />);
    expect(screen.getByTestId("fresh-account-boot-cover")).toBeInTheDocument();
    rerender(<FreshAccountBootCover visible={false} />);
    expect(screen.queryByTestId("fresh-account-boot-cover")).toBeNull();
  });

  it("blendet sich nach höchstens 10 s aus, auch wenn Supabase nicht antwortet", () => {
    jest.useFakeTimers();
    expect(FRESH_ACCOUNT_BOOT_COVER_MAX_MS).toBeLessThanOrEqual(10_000);
    render(<FreshAccountBootCover visible />);
    act(() => {
      jest.advanceTimersByTime(FRESH_ACCOUNT_BOOT_COVER_MAX_MS - 1);
    });
    expect(screen.getByTestId("fresh-account-boot-cover")).toBeInTheDocument();
    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(screen.queryByTestId("fresh-account-boot-cover")).toBeNull();
  });

  it("nach Abmelden und neuem Anmelden gilt die Höchstdauer neu", () => {
    jest.useFakeTimers();
    const { rerender } = render(<FreshAccountBootCover visible />);
    act(() => {
      jest.advanceTimersByTime(FRESH_ACCOUNT_BOOT_COVER_MAX_MS);
    });
    expect(screen.queryByTestId("fresh-account-boot-cover")).toBeNull();
    rerender(<FreshAccountBootCover visible={false} />);
    rerender(<FreshAccountBootCover visible />);
    expect(screen.getByTestId("fresh-account-boot-cover")).toBeInTheDocument();
  });
});

describe("UsageEventsSetting (Datenschutz & Daten)", () => {
  beforeEach(() => localStorage.clear());

  it("schaltet die Nutzungsdaten der Person aus und wieder an und merkt sich die Wahl", () => {
    render(<UsageEventsSetting userId="user-a" />);
    const row = screen.getByRole("button", { name: /Nutzung zählen/ });
    expect(row).toHaveTextContent("An");
    fireEvent.click(row);
    expect(row).toHaveTextContent("Aus");
    expect(isUsageEventsEnabled("user-a")).toBe(false);
    expect(isUsageEventsEnabled("user-b")).toBe(true);
    fireEvent.click(row);
    expect(isUsageEventsEnabled("user-a")).toBe(true);
  });
});
