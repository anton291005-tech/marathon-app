import { act, render, screen } from "@testing-library/react";
import { clearMarathonLocalStorage } from "../persistence/clearMarathonLocalStorage";
import { NotificationProvider, useNotifications } from "./NotificationContext";

jest.mock("../services/notificationService", () => {
  const KEY = "myrace-notification-settings";
  const fallback = { enabled: false, hour: 8, minute: 0 };
  return {
    loadNotificationSettings: () => {
      try {
        return { ...fallback, ...JSON.parse(globalThis.localStorage.getItem(KEY) ?? "{}") };
      } catch {
        return fallback;
      }
    },
    saveNotificationSettings: (s: unknown) => globalThis.localStorage.setItem(KEY, JSON.stringify(s)),
    cancelTrainingReminder: jest.fn(async () => undefined),
  };
});

let api: ReturnType<typeof useNotifications> | null = null;
function Probe() {
  api = useNotifications();
  return <span data-testid="state">{`${api.settings.enabled}:${api.settings.hour}:${api.settings.minute}`}</span>;
}

describe("NotificationProvider beim Kontowechsel", () => {
  beforeEach(() => localStorage.clear());

  it("nach dem Löschen der lokalen Kontodaten gilt die Erinnerung von Konto A nicht für Konto B weiter", async () => {
    render(
      <NotificationProvider>
        <Probe />
      </NotificationProvider>,
    );
    // Konto A schaltet die Erinnerung auf 18:30.
    await act(async () => {
      await api!.updateSettings({ enabled: true, hour: 18, minute: 30 });
    });
    expect(screen.getByTestId("state")).toHaveTextContent("true:18:30");

    // Sitzung endet / anderes Konto meldet sich an: lokale Daten werden gelöscht, die App läuft weiter.
    act(() => clearMarathonLocalStorage());
    expect(screen.getByTestId("state")).toHaveTextContent("false:8:0");

    // Eine spätere Änderung schreibt nicht die alten Werte von A zurück.
    await act(async () => {
      await api!.updateSettings({ minute: 15 });
    });
    expect(JSON.parse(localStorage.getItem("myrace-notification-settings") ?? "{}")).toEqual({ enabled: false, hour: 8, minute: 15 });
  });
});
