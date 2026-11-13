// Gesundheits-Zustimmung v2: Wortlaut-Archiv, Versions-Gate, Ablehnung je Gerät und Version.
import {
  HEALTH_CONSENT_TEXT,
  HEALTH_CONSENT_TEXTS,
  HEALTH_CONSENT_VERSION,
  declineHealthConsent,
  isHealthConsentGranted,
  markHealthConsentGranted,
  readHealthConsentDeclinedOnDevice,
  statusFromHealthConsent,
} from "../healthConsent";
import { getHealthConsentStatus, resetHealthConsentStoreForTests } from "../../../health/healthConsentStore";

beforeEach(() => {
  window.localStorage.clear();
  resetHealthConsentStoreForTests();
});

describe("Wortlaut-Archiv", () => {
  it("Version 1 bleibt wortgleich erhalten (nie überschreiben)", () => {
    expect(HEALTH_CONSENT_TEXTS["1"]).toBe(
      "MyRace speichert deine Antworten in deinem Konto, um deine Tagesform zu berechnen. Sie werden nicht für Werbung genutzt und nicht verkauft. An den KI-Coach gehen sie nur, wenn du dem gesondert zugestimmt hast.",
    );
  });

  it("aktuelle Version ist 2 und ihr Text kommt aus dem Archiv", () => {
    expect(HEALTH_CONSENT_VERSION).toBe("2");
    expect(HEALTH_CONSENT_TEXT).toBe(HEALTH_CONSENT_TEXTS["2"]);
  });

  it("Text v2 nennt Check-in, Anstrengung, alle gelesenen Erholungs-Typen, Speicherort, KI-Grenze und Widerruf", () => {
    for (const term of [
      "Check-in",
      "Anstrengung",
      "Schlaf",
      "Herzfrequenzvariabilität (HRV)",
      "Ruhepuls",
      "Atemfrequenz",
      "Körper-, Basal- und Handgelenktemperatur",
      "Blutsauerstoff",
      "Pulserholung",
      "VO2max",
      "Supabase, EU",
      "liest und verarbeitet",
      "KI-Coach gesondert zugestimmt",
      "Datenschutz & Daten",
    ]) {
      expect(HEALTH_CONSENT_TEXT).toContain(term);
    }
  });
});

describe("Versions-Gate", () => {
  it("eine Zustimmung zu Version 1 gilt nicht mehr", () => {
    expect(isHealthConsentGranted({ health_consent_at: "2026-11-12T07:00:00Z", health_consent_version: "1" })).toBe(false);
    expect(isHealthConsentGranted({ health_consent_at: "2026-11-13T07:00:00Z", health_consent_version: "2" })).toBe(true);
    expect(isHealthConsentGranted({ health_consent_at: null, health_consent_version: null })).toBe(false);
  });

  it("Status: nicht ladbar → unavailable, sonst granted / declined (Gerät) / undecided", () => {
    expect(statusFromHealthConsent({ ok: false }, false)).toBe("unavailable");
    expect(statusFromHealthConsent({ ok: true, granted: true }, true)).toBe("granted");
    expect(statusFromHealthConsent({ ok: true, granted: false }, true)).toBe("declined");
    expect(statusFromHealthConsent({ ok: true, granted: false }, false)).toBe("undecided");
  });

  it("Ablehnen wird je Nutzer und Version gemerkt; eine Ablehnung von Version 1 zählt nicht", () => {
    declineHealthConsent("u1");
    expect(getHealthConsentStatus()).toBe("declined");
    expect(readHealthConsentDeclinedOnDevice("u1")).toBe(true);
    expect(readHealthConsentDeclinedOnDevice("u2")).toBe(false);
    window.localStorage.setItem("marathonHealthConsentDeclined", JSON.stringify({ u3: "1" }));
    expect(readHealthConsentDeclinedOnDevice("u3")).toBe(false);
  });

  it("Zustimmen hebt die Ablehnung auf", () => {
    declineHealthConsent("u1");
    markHealthConsentGranted("u1");
    expect(getHealthConsentStatus()).toBe("granted");
    expect(readHealthConsentDeclinedOnDevice("u1")).toBe(false);
  });
});
