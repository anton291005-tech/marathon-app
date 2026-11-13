// Gesundheits-Zustimmung v2: Reihenfolge (App-Abfrage vor Apple-Dialog), Anstrengung nur mit Zustimmung, Widerruf.
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  afterHealthConsentGranted,
  connectAppleHealthWithConsent,
  isRpeInputAvailable,
  mayStoreRpe,
  shouldAskHealthConsentOnColdStart,
  stripRpeFromLogs,
} from "../healthConsentFlow";
import { HealthConsentSheet } from "../HealthConsentSheet";
import { HEALTH_REVOKE_DELETES, HealthConsentRevokeDialog } from "../HealthConsentRevokeDialog";
import { HEALTH_CONSENT_TEXT, declineHealthConsent, markHealthConsentGranted } from "../healthConsent";
import {
  getHealthConsentState,
  requestHealthConsentDecision,
  resetHealthConsentStoreForTests,
  setHealthConsentStatus,
} from "../../../health/healthConsentStore";
import { SessionEntrySheet } from "../../session/SessionEntrySheet";

beforeEach(() => {
  window.localStorage.clear();
  resetHealthConsentStoreForTests();
});

describe("Reihenfolge", () => {
  it("Verbinden: erst die Zustimmung in der App, dann der Apple-Dialog", async () => {
    const calls: string[] = [];
    await connectAppleHealthWithConsent({
      watchSignals: true,
      askConsent: async () => {
        calls.push("consent");
        return true;
      },
      requestHealthKit: async () => {
        calls.push("healthkit");
      },
    });
    expect(calls).toEqual(["consent", "healthkit"]);
  });

  it("Verbinden ohne Flag: keine Abfrage, Apple-Dialog wie bisher", async () => {
    const calls: string[] = [];
    await connectAppleHealthWithConsent({
      watchSignals: false,
      askConsent: async () => {
        calls.push("consent");
        return true;
      },
      requestHealthKit: async () => {
        calls.push("healthkit");
      },
    });
    expect(calls).toEqual(["healthkit"]);
  });

  it("der Apple-Dialog wartet, bis die Abfrage entschieden ist", async () => {
    setHealthConsentStatus("u1", "undecided");
    const calls: string[] = [];
    const done = connectAppleHealthWithConsent({
      watchSignals: true,
      askConsent: requestHealthConsentDecision,
      requestHealthKit: async () => {
        calls.push("healthkit");
      },
    });
    await Promise.resolve();
    expect(getHealthConsentState().sheetOpen).toBe(true);
    expect(calls).toEqual([]);
    markHealthConsentGranted("u1");
    await done;
    expect(calls).toEqual(["healthkit"]);
  });

  it("nach der Zustimmung: erst Apple-Dialog, dann Erholungswerte laden; unverbunden: nichts", async () => {
    const calls: string[] = [];
    const deps = {
      requestHealthKit: async () => {
        calls.push("healthkit");
      },
      hydrateRecovery: async () => {
        calls.push("recovery");
      },
    };
    await afterHealthConsentGranted({ connected: false, ...deps });
    expect(calls).toEqual([]);
    await afterHealthConsentGranted({ connected: true, ...deps });
    expect(calls).toEqual(["healthkit", "recovery"]);
  });

  it("Kaltstart: einmal fragen, nur verbunden, nur unentschieden, nur mit Flag", () => {
    const base = { watchSignals: true, userId: "u1", connected: true, status: "undecided" as const, alreadyAsked: false };
    expect(shouldAskHealthConsentOnColdStart(base)).toBe(true);
    expect(shouldAskHealthConsentOnColdStart({ ...base, alreadyAsked: true })).toBe(false);
    expect(shouldAskHealthConsentOnColdStart({ ...base, connected: false })).toBe(false);
    expect(shouldAskHealthConsentOnColdStart({ ...base, watchSignals: false })).toBe(false);
    expect(shouldAskHealthConsentOnColdStart({ ...base, userId: null })).toBe(false);
    for (const status of ["granted", "declined", "loading", "unavailable"] as const) {
      expect(shouldAskHealthConsentOnColdStart({ ...base, status })).toBe(false);
    }
  });

  it("„Nicht jetzt“ beim Kaltstart: diese Version wird nicht erneut abgefragt", async () => {
    setHealthConsentStatus("u1", "undecided");
    const decision = requestHealthConsentDecision();
    declineHealthConsent("u1");
    await expect(decision).resolves.toBe(false);
    await expect(requestHealthConsentDecision()).resolves.toBe(false);
    expect(getHealthConsentState().sheetOpen).toBe(false);
  });
});

describe("Anstrengung nur mit Zustimmung", () => {
  it("Abfrage sichtbar: ohne Flag immer, mit Flag bei Zustimmung oder unentschieden", () => {
    expect(isRpeInputAvailable(false, "declined")).toBe(true);
    expect(isRpeInputAvailable(true, "granted")).toBe(true);
    expect(isRpeInputAvailable(true, "undecided")).toBe(true);
    for (const status of ["declined", "loading", "unavailable"] as const) expect(isRpeInputAvailable(true, status)).toBe(false);
  });

  it("zugestimmt: speichern ohne Abfrage; unentschieden: erst fragen; abgelehnt: verwerfen ohne Abfrage", async () => {
    const ask = jest.fn(async () => true);
    await expect(mayStoreRpe({ watchSignals: true, status: "granted", askConsent: ask })).resolves.toBe(true);
    expect(ask).not.toHaveBeenCalled();
    await expect(mayStoreRpe({ watchSignals: true, status: "declined", askConsent: ask })).resolves.toBe(false);
    await expect(mayStoreRpe({ watchSignals: true, status: "loading", askConsent: ask })).resolves.toBe(false);
    expect(ask).not.toHaveBeenCalled();
    await expect(mayStoreRpe({ watchSignals: true, status: "undecided", askConsent: ask })).resolves.toBe(true);
    await expect(mayStoreRpe({ watchSignals: true, status: "undecided", askConsent: async () => false })).resolves.toBe(false);
    await expect(mayStoreRpe({ watchSignals: false, status: "declined", askConsent: ask })).resolves.toBe(true);
  });

  it("Eintragen-Sheet ohne Zustimmung: keine Anstrengungsfrage, gespeichert wird keine", () => {
    const onSave = jest.fn();
    render(
      <SessionEntrySheet
        mode="create"
        subtitle="Lauf"
        initialKm={null}
        initialFeeling={null}
        initialRpe={6}
        initialNotes=""
        suggestion={null}
        onSave={onSave}
        onClose={() => {}}
        rpeEnabled={false}
      />,
    );
    expect(screen.queryByTestId("entry-rpe")).toBeNull();
    expect(screen.queryByText("Anstrengung doch angeben")).toBeNull();
    fireEvent.click(screen.getByText("Speichern"));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ rpe: null }));
  });

  it("Eintragen-Sheet mit Zustimmung fragt wie bisher", () => {
    render(
      <SessionEntrySheet
        mode="create"
        subtitle="Lauf"
        initialKm={null}
        initialFeeling={null}
        initialNotes=""
        suggestion={null}
        onSave={() => {}}
        onClose={() => {}}
      />,
    );
    expect(screen.getByTestId("entry-rpe")).toBeInTheDocument();
  });
});

describe("Zustimmungs-Sheet", () => {
  it("zeigt Text v2; Zustimmen ruft onGrant, Fehler bleibt sichtbar; Nicht jetzt ruft onDecline", async () => {
    const onGrant = jest.fn(async () => false);
    const onDecline = jest.fn();
    render(<HealthConsentSheet onGrant={onGrant} onDecline={onDecline} />);
    expect(screen.getByTestId("health-consent-text").textContent).toBe(HEALTH_CONSENT_TEXT);
    expect(screen.getByText("Gesundheitsdaten speichern?")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Zustimmen"));
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(onGrant).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByText("Nicht jetzt"));
    expect(onDecline).toHaveBeenCalledTimes(1);
  });
});

describe("Widerruf", () => {
  it("löscht erst nach Bestätigung und nennt, was gelöscht wird", () => {
    const onConfirm = jest.fn();
    const onCancel = jest.fn();
    render(<HealthConsentRevokeDialog onConfirm={onConfirm} onCancel={onCancel} />);
    for (const item of HEALTH_REVOKE_DELETES) expect(screen.getByText(item)).toBeInTheDocument();
    expect(screen.getByText(/Deine Trainings bleiben/)).toBeInTheDocument();
    expect(onConfirm).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("Abbrechen"));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("Widerrufen und löschen"));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("Fehler: Meldung und „Erneut versuchen“", () => {
    render(<HealthConsentRevokeDialog error="Es wurde nichts gelöscht." onConfirm={() => {}} onCancel={() => {}} />);
    expect(screen.getByRole("alert").textContent).toContain("nichts gelöscht");
    expect(screen.getByText("Erneut versuchen")).toBeInTheDocument();
  });

  it("entfernt Anstrengung und Herkunft aus allen lokalen Logs, alles andere bleibt", () => {
    const logs = {
      a: { done: true, rpe: 6, feeling: 4 },
      b: { done: true, feeling: 3 },
      c: { done: true, rpe: 0, rpeSource: "manual" as const },
    };
    const out = stripRpeFromLogs(logs as never);
    expect(out.changedIds.sort()).toEqual(["a", "c"]);
    expect(out.logs.a).toEqual({ done: true, feeling: 4 });
    expect(out.logs.b).toBe(logs.b);
    expect(out.logs.c).toEqual({ done: true });
  });
});
