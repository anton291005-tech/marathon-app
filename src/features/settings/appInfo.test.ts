import {
  APP_VERSION,
  loadAppVersionLabel,
  SUPPORT_EMAIL,
  buildBugReportMailto,
  buildDataExportMailto,
  buildDeviceInfo,
  buildFeedbackMailto,
  buildMailtoUrl,
  parseIosVersion,
} from "./appInfo";

const mockNative = { value: false };
const mockGetInfo = jest.fn();

jest.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => mockNative.value },
}));

jest.mock("@capacitor/app", () => ({
  App: { getInfo: () => mockGetInfo() },
}));

const IPHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148";

function parseMailto(url: string) {
  const [address, query] = url.replace(/^mailto:/, "").split("?");
  const params = new URLSearchParams(query);
  return { address, subject: params.get("subject"), body: params.get("body") };
}

describe("appInfo", () => {
  test("Version kommt aus der package.json", () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    expect(APP_VERSION).toBe(require("../../../package.json").version);
    expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });

  describe("loadAppVersionLabel", () => {
    afterEach(() => {
      mockNative.value = false;
      mockGetInfo.mockReset();
    });

    test("Web: package.json-Version, ohne das Plugin zu fragen", async () => {
      await expect(loadAppVersionLabel()).resolves.toBe(APP_VERSION);
      expect(mockGetInfo).not.toHaveBeenCalled();
    });

    test("nativ: echte App-Version mit Build", async () => {
      mockNative.value = true;
      mockGetInfo.mockResolvedValue({ version: "1.2.0", build: "34" });
      await expect(loadAppVersionLabel()).resolves.toBe("1.2.0 (34)");
    });

    test("nativ ohne Build: nur die Version", async () => {
      mockNative.value = true;
      mockGetInfo.mockResolvedValue({ version: "1.2.0", build: "" });
      await expect(loadAppVersionLabel()).resolves.toBe("1.2.0");
    });

    test("nativ, Plugin scheitert oder liefert nichts: package.json-Version", async () => {
      mockNative.value = true;
      mockGetInfo.mockRejectedValue(new Error("unimplemented"));
      await expect(loadAppVersionLabel()).resolves.toBe(APP_VERSION);
      mockGetInfo.mockResolvedValue({ version: "" });
      await expect(loadAppVersionLabel()).resolves.toBe(APP_VERSION);
    });
  });

  test("parseIosVersion liest die Version aus dem WebView-User-Agent", () => {
    expect(parseIosVersion(IPHONE_UA)).toBe("17.5.1");
    expect(parseIosVersion("Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X)")).toBe("18.0");
    expect(parseIosVersion("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/126")).toBeNull();
    expect(parseIosVersion(null)).toBeNull();
  });

  test("buildMailtoUrl kodiert Betreff und Text", () => {
    const url = buildMailtoUrl({ to: "a@b.de", subject: "Ä & Ö?", body: "Zeile 1\nZeile 2" });
    expect(url.startsWith("mailto:a@b.de?subject=")).toBe(true);
    expect(url).not.toContain(" ");
    expect(parseMailto(url)).toEqual({ address: "a@b.de", subject: "Ä & Ö?", body: "Zeile 1\r\nZeile 2" });
  });

  test("Feedback und Fehlerbericht: Betreff, Empfänger, App- und iOS-Version im Text", () => {
    const feedback = parseMailto(buildFeedbackMailto({ appVersion: "1.2.3", userAgent: IPHONE_UA }));
    expect(feedback.address).toBe(SUPPORT_EMAIL);
    expect(feedback.subject).toBe("MyRace Feedback");
    expect(feedback.body).toContain("App-Version: 1.2.3");
    expect(feedback.body).toContain("iOS-Version: 17.5.1");

    const bug = parseMailto(buildBugReportMailto({ appVersion: "1.2.3", userAgent: IPHONE_UA }));
    expect(bug.subject).toBe("MyRace Fehler");
    expect(bug.body).toContain("App-Version: 1.2.3");
    expect(bug.body).toContain("iOS-Version: 17.5.1");
  });

  test("ohne iOS-User-Agent steht die Plattform statt einer erfundenen Version", () => {
    expect(buildDeviceInfo({ appVersion: "1.2.3", userAgent: "Mozilla/5.0 (X11; Linux x86_64)" })).toBe(
      "App-Version: 1.2.3\nPlattform: Web",
    );
  });

  test("Datenexport: Betreff und Konto-E-Mail im Text", () => {
    const mail = parseMailto(buildDataExportMailto({ accountEmail: " laeufer@example.com " }));
    expect(mail.address).toBe(SUPPORT_EMAIL);
    expect(mail.subject).toBe("Datenexport (DSGVO)");
    expect(mail.body).toContain("Konto-E-Mail: laeufer@example.com");
    expect(parseMailto(buildDataExportMailto({ accountEmail: null })).body).toContain("Konto-E-Mail: (bitte eintragen)");
  });
});
