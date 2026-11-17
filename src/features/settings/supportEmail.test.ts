import { resolveSupportEmail, SUPPORT_EMAIL_PLACEHOLDER } from "./appInfo";

jest.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => false } }));
jest.mock("@capacitor/app", () => ({ App: { getInfo: jest.fn() } }));

describe("resolveSupportEmail (REACT_APP_SUPPORT_EMAIL)", () => {
  it("nimmt die Adresse aus der Build-Variable", () => {
    expect(resolveSupportEmail("hilfe@myrace.app")).toBe("hilfe@myrace.app");
    expect(resolveSupportEmail("  hilfe@myrace.app \n")).toBe("hilfe@myrace.app");
  });

  it("fällt ohne oder mit kaputter Variable auf den Platzhalter zurück", () => {
    expect(resolveSupportEmail(undefined)).toBe(SUPPORT_EMAIL_PLACEHOLDER);
    expect(resolveSupportEmail("")).toBe(SUPPORT_EMAIL_PLACEHOLDER);
    expect(resolveSupportEmail("keine-adresse")).toBe(SUPPORT_EMAIL_PLACEHOLDER);
    expect(resolveSupportEmail("a@b.de, c@d.de")).toBe(SUPPORT_EMAIL_PLACEHOLDER);
  });
});
