import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import { requestNotificationPermission, supportsLocalReminders } from "./notificationService";

jest.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: jest.fn() } }));
jest.mock("@capacitor/local-notifications", () => ({
  LocalNotifications: { getPending: jest.fn(), cancel: jest.fn(), schedule: jest.fn(), requestPermissions: jest.fn() },
}));

const isNative = Capacitor.isNativePlatform as jest.Mock;

describe("Web-Fallback Trainings-Erinnerung", () => {
  test("im Browser keine lokalen Erinnerungen und kein Plugin-Aufruf", async () => {
    isNative.mockReturnValue(false);
    expect(supportsLocalReminders()).toBe(false);
    await expect(requestNotificationPermission()).resolves.toBe(false);
    expect(LocalNotifications.requestPermissions).not.toHaveBeenCalled();
  });

  test("in der App verfügbar", () => {
    isNative.mockReturnValue(true);
    expect(supportsLocalReminders()).toBe(true);
  });
});
