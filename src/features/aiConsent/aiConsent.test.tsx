// KI-Einwilligung im Client: Zustand, Zustimmungs-Screen und Sperre des Coach-Panels.
import "../../i18n";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

jest.mock("../../lib/ai/coachAgent", () => ({ runCoachAgent: jest.fn() }));
jest.mock("../../lib/ai/getAiContext", () => ({ toRemoteCoachPayload: (context: unknown) => context }));

import { runCoachAgent } from "../../lib/ai/coachAgent";
import AiCoachPanel from "../../components/ai/AiCoachPanel";
import { AiConsentSheet } from "./AiConsentSheet";
import {
  AI_CONSENT_VERSION,
  isConsentRowGranted,
  readDeclinedOnDevice,
  statusFromConsentRow,
  writeDeclinedOnDevice,
} from "./aiConsentState";
import { AI_COACH_DATA_ITEMS } from "../settings/dataUsage";

const GRANTED = { ai_consent_at: "2026-11-11T21:00:00.000Z", ai_consent_version: AI_CONSENT_VERSION };

describe("aiConsentState", () => {
  beforeEach(() => window.localStorage.clear());

  test("Zustimmung nur mit Zeitpunkt und aktueller Version", () => {
    expect(isConsentRowGranted(GRANTED)).toBe(true);
    expect(isConsentRowGranted(null)).toBe(false);
    expect(isConsentRowGranted({ ai_consent_at: null, ai_consent_version: null })).toBe(false);
    expect(isConsentRowGranted({ ...GRANTED, ai_consent_version: AI_CONSENT_VERSION - 1 })).toBe(false);
  });

  test("Version 2: Zustimmung und Ablehnung aus Version 1 gelten nicht mehr – es wird neu gefragt", () => {
    expect(AI_CONSENT_VERSION).toBe(2);
    const v1 = { ai_consent_at: "2026-11-11T21:00:00.000Z", ai_consent_version: 1 };
    expect(isConsentRowGranted(v1)).toBe(false);
    expect(statusFromConsentRow(v1, false)).toBe("undecided");
    window.localStorage.setItem("marathonAiConsentDeclined", JSON.stringify({ u1: 1 }));
    expect(readDeclinedOnDevice("u1")).toBe(false);
    window.localStorage.removeItem("marathonAiConsentDeclined");
  });

  test("ohne Zustimmung: undecided, nach Ablehnen auf dem Gerät: declined", () => {
    expect(statusFromConsentRow(null, false)).toBe("undecided");
    expect(statusFromConsentRow(null, true)).toBe("declined");
    expect(statusFromConsentRow(GRANTED, true)).toBe("granted");
  });

  test("Ablehnen wird je Nutzer gemerkt und lässt sich zurücknehmen", () => {
    writeDeclinedOnDevice("u1", true);
    expect(readDeclinedOnDevice("u1")).toBe(true);
    expect(readDeclinedOnDevice("u2")).toBe(false);
    writeDeclinedOnDevice("u1", false);
    expect(readDeclinedOnDevice("u1")).toBe(false);
  });
});

describe("AiConsentSheet", () => {
  test("nennt Anthropic und alle mitgeschickten Daten", () => {
    render(<AiConsentSheet onGrant={jest.fn()} onDecline={jest.fn()} />);
    expect(screen.getByRole("dialog")).toHaveTextContent("Anthropic (Claude)");
    for (const item of AI_COACH_DATA_ITEMS) expect(screen.getByText(item)).toBeInTheDocument();
  });

  test("Ablehnen ruft onDecline", () => {
    const onDecline = jest.fn();
    render(<AiConsentSheet onGrant={jest.fn()} onDecline={onDecline} />);
    fireEvent.click(screen.getByRole("button", { name: "Ohne Coach fortfahren" }));
    expect(onDecline).toHaveBeenCalledTimes(1);
  });

  test("scheitert das Speichern, bleibt der Screen mit Hinweis offen", async () => {
    const onGrant = jest.fn().mockResolvedValue(false);
    render(<AiConsentSheet onGrant={onGrant} onDecline={jest.fn()} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Zustimmen und Coach nutzen" }));
    });
    expect(onGrant).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole("alert")).toHaveTextContent("Speichern hat nicht geklappt");
  });
});

describe("AiCoachPanel ohne Einwilligung", () => {
  const props = {
    getContext: () => ({}) as never,
    onApplyPlanPatches: jest.fn(),
    onNavigate: jest.fn(),
  };

  beforeEach(() => {
    (runCoachAgent as jest.Mock).mockReset();
    (runCoachAgent as jest.Mock).mockResolvedValue({ message: "Hallo", action: null });
  });

  test("zeigt nur den Hinweis, kein Eingabefeld, keine Schnellaktionen, kein Request", () => {
    const onActivate = jest.fn();
    render(<AiCoachPanel {...props} aiConsent={{ granted: false, onActivate }} />);
    expect(screen.getByTestId("coach-consent-off")).toHaveTextContent("Anthropic (Claude)");
    expect(screen.queryByLabelText("Nachricht an den Coach")).toBeNull();
    expect(screen.queryByRole("button", { name: "Plan anpassen" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Coach aktivieren" }));
    expect(onActivate).toHaveBeenCalledTimes(1);
    expect(runCoachAgent).not.toHaveBeenCalled();
  });

  test("mit Einwilligung: normaler Chat, Nachricht geht raus", async () => {
    render(<AiCoachPanel {...props} aiConsent={{ granted: true, onActivate: jest.fn() }} />);
    fireEvent.change(screen.getByLabelText("Nachricht an den Coach"), { target: { value: "Wie geht's?" } });
    await act(async () => {
      fireEvent.keyDown(screen.getByLabelText("Nachricht an den Coach"), { key: "Enter" });
    });
    await waitFor(() => expect(runCoachAgent).toHaveBeenCalledTimes(1));
  });
});
