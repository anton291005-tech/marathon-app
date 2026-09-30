import { Capacitor } from "@capacitor/core";
import { Haptics, ImpactStyle, NotificationType } from "@capacitor/haptics";
import { hapticImpactLight, hapticSuccess } from "./haptics";

jest.mock("@capacitor/haptics", () => ({
  Haptics: { impact: jest.fn(), notification: jest.fn() },
  ImpactStyle: { Light: "LIGHT" },
  NotificationType: { Success: "SUCCESS" },
}));

describe("haptics", () => {
  const nativeSpy = jest.spyOn(Capacitor, "isNativePlatform");

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(() => {
    nativeSpy.mockRestore();
  });

  it("ist auf Web ein No-op", async () => {
    nativeSpy.mockReturnValue(false);
    await hapticImpactLight();
    await hapticSuccess();
    expect(Haptics.impact).not.toHaveBeenCalled();
    expect(Haptics.notification).not.toHaveBeenCalled();
  });

  it("ruft nativ das Plugin auf", async () => {
    nativeSpy.mockReturnValue(true);
    await hapticImpactLight();
    await hapticSuccess();
    expect(Haptics.impact).toHaveBeenCalledWith({ style: ImpactStyle.Light });
    expect(Haptics.notification).toHaveBeenCalledWith({ type: NotificationType.Success });
  });

  it("schluckt Plugin-Fehler", async () => {
    nativeSpy.mockReturnValue(true);
    (Haptics.impact as jest.Mock).mockRejectedValueOnce(new Error("not implemented"));
    (Haptics.notification as jest.Mock).mockRejectedValueOnce(new Error("not implemented"));
    await expect(hapticImpactLight()).resolves.toBeUndefined();
    await expect(hapticSuccess()).resolves.toBeUndefined();
  });
});
