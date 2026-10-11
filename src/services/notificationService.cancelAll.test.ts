import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import { cancelAllPendingNotifications } from "./notificationService";

jest.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: jest.fn() } }));
jest.mock("@capacitor/local-notifications", () => ({
  LocalNotifications: { getPending: jest.fn(), cancel: jest.fn(), schedule: jest.fn(), requestPermissions: jest.fn() },
}));

const isNative = Capacitor.isNativePlatform as jest.Mock;
const getPending = LocalNotifications.getPending as jest.Mock;
const cancel = LocalNotifications.cancel as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  cancel.mockResolvedValue(undefined);
});

describe("cancelAllPendingNotifications", () => {
  test("bestellt jede ausstehende Notification ab, die Trainings-Erinnerung (1001) in jedem Fall", async () => {
    isNative.mockReturnValue(true);
    getPending.mockResolvedValue({ notifications: [{ id: 1001 }, { id: 7 }] });
    await cancelAllPendingNotifications();
    expect(cancel).toHaveBeenCalledWith({ notifications: [{ id: 1001 }, { id: 7 }] });
    expect(cancel).toHaveBeenLastCalledWith({ notifications: [{ id: 1001 }] });
  });

  test("kann die Liste nicht gelesen werden, wird die Trainings-Erinnerung trotzdem abbestellt", async () => {
    isNative.mockReturnValue(true);
    getPending.mockRejectedValue(new Error("plugin"));
    await expect(cancelAllPendingNotifications()).resolves.toBeUndefined();
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(cancel).toHaveBeenCalledWith({ notifications: [{ id: 1001 }] });
  });

  test("im Web passiert nichts", async () => {
    isNative.mockReturnValue(false);
    await cancelAllPendingNotifications();
    expect(getPending).not.toHaveBeenCalled();
    expect(cancel).not.toHaveBeenCalled();
  });
});
