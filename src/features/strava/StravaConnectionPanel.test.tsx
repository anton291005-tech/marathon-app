import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { StravaConnectionPanel, stravaSyncStatusText, type StravaConnectionPanelProps } from "./StravaConnectionPanel";
import { GarminAppleHealthHelp, GARMIN_APPLE_HEALTH_STEPS } from "../settings/GarminAppleHealthHelp";

function props(overrides: Partial<StravaConnectionPanelProps> = {}): StravaConnectionPanelProps {
  return {
    connected: false,
    connectBusy: false,
    feedback: null,
    onConnect: jest.fn(),
    onDisconnect: jest.fn(),
    syncBusy: false,
    lastResult: null,
    reconnectRequired: false,
    onSyncNow: jest.fn(),
    ...overrides,
  };
}

describe("StravaConnectionPanel", () => {
  test("nicht verbunden: offizieller „Connect with Strava“-Knopf startet OAuth, kein Powered-by", () => {
    const p = props();
    render(<StravaConnectionPanel {...p} />);
    fireEvent.click(screen.getByRole("button", { name: "Connect with Strava" }));
    expect(p.onConnect).toHaveBeenCalledTimes(1);
    expect(screen.getByAltText("Connect with Strava")).toHaveAttribute("height", "48");
    expect(screen.queryByTestId("powered-by-strava")).toBeNull();
    expect(screen.queryByTestId("strava-sync-now")).toBeNull();
  });

  test("verbunden: „Jetzt synchronisieren“, Trennen, Powered by Strava, Statuszeile", () => {
    const p = props({ connected: true, lastResult: { status: "ok", imported: 2, fetched: 3 } });
    render(<StravaConnectionPanel {...p} />);
    expect(screen.getByText("Mit Strava verbunden")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Jetzt synchronisieren/ }));
    expect(p.onSyncNow).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Trennen" }));
    expect(p.onDisconnect).toHaveBeenCalledTimes(1);
    expect(screen.getByAltText("Powered by Strava")).toBeInTheDocument();
    expect(screen.getByTestId("strava-sync-status")).toHaveTextContent("Abgeglichen. 2 Läufe übernommen.");
    expect(screen.queryByRole("button", { name: "Connect with Strava" })).toBeNull();
  });

  test("Zugriff abgelaufen: ruhig „Strava neu verbinden“ mit dem offiziellen Knopf", () => {
    const p = props({ connected: true, reconnectRequired: true });
    render(<StravaConnectionPanel {...p} />);
    expect(screen.getByText("Strava neu verbinden")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Connect with Strava" }));
    expect(p.onConnect).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("strava-sync-now")).toBeNull();
  });

  test("während des Abgleichs ist der Knopf gesperrt", () => {
    render(<StravaConnectionPanel {...props({ connected: true, syncBusy: true })} />);
    expect(screen.getByTestId("strava-sync-now")).toBeDisabled();
    expect(screen.getByTestId("strava-sync-now")).toHaveTextContent("Synchronisiere …");
  });

  test("Statuszeilen ohne Fehlercodes", () => {
    expect(stravaSyncStatusText({ status: "ok", imported: 0, fetched: 0 })).toBe("Abgeglichen. Keine neuen Läufe.");
    expect(stravaSyncStatusText({ status: "ok", imported: 1, fetched: 1 })).toBe("Abgeglichen. 1 Lauf übernommen.");
    expect(stravaSyncStatusText({ status: "rate_limited", retryAfter: 60 })).toMatch(/später noch einmal/);
    expect(stravaSyncStatusText({ status: "error" })).toMatch(/später noch einmal/);
    expect(stravaSyncStatusText({ status: "not_connected" })).toBeNull();
    expect(stravaSyncStatusText(null)).toBeNull();
  });
});

describe("GarminAppleHealthHelp", () => {
  test("eingeklappt, auf Tipp drei Schritte", () => {
    render(<GarminAppleHealthHelp />);
    const toggle = screen.getByRole("button", { name: /Garmin-Uhr\? So kommen deine Läufe rein/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByTestId("garmin-help-steps")).toBeNull();
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(GARMIN_APPLE_HEALTH_STEPS).toHaveLength(3);
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    expect(screen.getByText(/Verbundene Apps/)).toBeInTheDocument();
  });
});
