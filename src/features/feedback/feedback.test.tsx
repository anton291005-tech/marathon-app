import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { freezeTimeForTests } from "../../core/time/timeSystem";
import { __setUsageEventSinkForTests, type UsageEventRow } from "../../telemetry/usageEvents";
import { FeedbackSheet } from "./FeedbackSheet";
import {
  buildFeedbackFallbackMailto,
  buildFeedbackRecord,
  describeDevice,
  isFeedbackEntryVisible,
  type FeedbackRecord,
} from "./feedbackModel";

jest.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => false, getPlatform: () => "web" } }));
jest.mock("@capacitor/app", () => ({ App: { getInfo: jest.fn() } }));

const IPHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148";

describe("feedbackModel", () => {
  it("hängt nur Version, Bildschirm und Gerät an", () => {
    const record = buildFeedbackRecord({
      message: "  Der Woche-Tab springt.  ",
      category: "bug",
      appVersion: "1.0.0 (3)",
      screen: "settings",
      userAgent: IPHONE_UA,
      platform: "ios",
    });
    expect(record).toEqual({
      category: "bug",
      message: "Der Woche-Tab springt.",
      appVersion: "1.0.0 (3)",
      screen: "settings",
      device: "iOS 17.5.1",
    });
  });

  it("leere Nachricht ergibt nichts zum Senden", () => {
    expect(
      buildFeedbackRecord({ message: "   ", category: null, appVersion: "1", screen: "home", userAgent: "", platform: "web" }),
    ).toBeNull();
  });

  it("beschreibt das Gerät ohne Modell", () => {
    expect(describeDevice("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", "web")).toBe("Web");
    expect(describeDevice("Mozilla/5.0 (Linux; Android 14; Pixel 8)", "android")).toBe("Android 14");
  });

  it("Mail-Rückfall enthält Nachricht, Version, Bildschirm, Gerät und Datum", () => {
    const record: FeedbackRecord = { category: "idea", message: "Dunkler Kalender", appVersion: "1.0.0", screen: "home", device: "Web" };
    const href = buildFeedbackFallbackMailto(record, "2026-11-17", "hilfe@myrace.app");
    const body = decodeURIComponent(href.split("body=")[1]);
    expect(href.startsWith("mailto:hilfe@myrace.app?")).toBe(true);
    expect(decodeURIComponent(href)).toContain("MyRace Feedback (Idee)");
    expect(body).toContain("Dunkler Kalender");
    expect(body).toContain("Bildschirm: Heute");
    expect(body).toContain("Datum: 2026-11-17");
  });

  it("zeigt den Eintrag auf Heute nur in den ersten 14 Tagen", () => {
    const created = "2026-11-01T10:00:00Z";
    const day = 86_400_000;
    const createdMs = Date.parse(created);
    expect(isFeedbackEntryVisible({ createdAt: created, nowMs: createdMs + 2 * day, dismissed: false })).toBe(true);
    expect(isFeedbackEntryVisible({ createdAt: created, nowMs: createdMs + 13.9 * day, dismissed: false })).toBe(true);
    expect(isFeedbackEntryVisible({ createdAt: created, nowMs: createdMs + 14 * day, dismissed: false })).toBe(false);
    expect(isFeedbackEntryVisible({ createdAt: created, nowMs: createdMs + day, dismissed: true })).toBe(false);
    expect(isFeedbackEntryVisible({ createdAt: null, nowMs: createdMs, dismissed: false })).toBe(false);
  });
});

describe("FeedbackSheet", () => {
  let sent: UsageEventRow[];
  beforeEach(() => {
    localStorage.clear();
    sent = [];
    __setUsageEventSinkForTests(async (row) => {
      sent.push(row);
    });
    freezeTimeForTests(new Date("2026-11-17T09:00:00"));
  });
  afterEach(() => {
    __setUsageEventSinkForTests(null);
    freezeTimeForTests(null);
  });

  const renderSheet = (submit: jest.Mock, mailFallbackAvailable = true) =>
    render(
      <FeedbackSheet
        screen="settings"
        appVersion="1.0.0"
        userAgent={IPHONE_UA}
        platform="ios"
        submit={submit}
        onClose={() => {}}
        mailFallbackAvailable={mailFallbackAvailable}
      />,
    );

  it("speichert mit Kategorie und meldet feedback_sent", async () => {
    const submit = jest.fn().mockResolvedValue({ status: "saved" });
    renderSheet(submit);
    expect(screen.getByRole("button", { name: "Senden" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Idee" }));
    fireEvent.change(screen.getByLabelText("Deine Nachricht"), { target: { value: "Mehr Ruhetage zeigen" } });
    fireEvent.click(screen.getByRole("button", { name: "Senden" }));
    await screen.findByText("Danke. Dein Feedback ist angekommen.");
    expect(submit).toHaveBeenCalledWith({
      category: "idea",
      message: "Mehr Ruhetage zeigen",
      appVersion: "1.0.0",
      screen: "settings",
      device: "iOS 17.5.1",
    });
    await waitFor(() => expect(sent).toEqual([{ name: "feedback_sent", props: {} }]));
  });

  it("fehlt die Tabelle, bietet es den Weg per Mail an", async () => {
    const submit = jest.fn().mockResolvedValue({ status: "unavailable" });
    renderSheet(submit);
    fireEvent.change(screen.getByLabelText("Deine Nachricht"), { target: { value: "Hallo" } });
    fireEvent.click(screen.getByRole("button", { name: "Senden" }));
    const link = await screen.findByRole("link", { name: "Mail öffnen" });
    expect(link.getAttribute("href")).toMatch(/^mailto:/);
    expect(sent).toEqual([]);
  });

  it("bei Fehler bleibt der Text stehen", async () => {
    const submit = jest.fn().mockResolvedValue({ status: "error" });
    renderSheet(submit, false);
    fireEvent.change(screen.getByLabelText("Deine Nachricht"), { target: { value: "Hallo" } });
    fireEvent.click(screen.getByRole("button", { name: "Senden" }));
    await screen.findByRole("alert");
    expect(screen.getByLabelText("Deine Nachricht")).toHaveValue("Hallo");
    expect(screen.queryByRole("link", { name: "Per Mail senden" })).toBeNull();
  });
});
