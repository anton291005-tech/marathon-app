// useAiConsent: Laden, Zustimmen, Ablehnen, Widerrufen und Neuversuch bei nicht lesbarer Einwilligung.
import { act, renderHook, waitFor } from "@testing-library/react";

jest.mock("../../lib/supabase/services/aiConsentService", () => ({
  loadAiConsentRow: jest.fn(),
  saveAiConsent: jest.fn(),
}));

import { loadAiConsentRow, saveAiConsent } from "../../lib/supabase/services/aiConsentService";
import { readDeclinedOnDevice, writeDeclinedOnDevice } from "./aiConsentState";
import { useAiConsent } from "./useAiConsent";

const load = loadAiConsentRow as jest.Mock;
const save = saveAiConsent as jest.Mock;
const GRANTED_ROW = { ai_consent_at: "2026-11-11T21:00:00.000Z", ai_consent_version: 2 };

beforeEach(() => {
  window.localStorage.clear();
  load.mockReset();
  save.mockReset();
  save.mockResolvedValue(true);
});

test("ohne Profil-Zustimmung und ohne Ablehnung: undecided", async () => {
  load.mockResolvedValue({ ok: true, row: null });
  const { result } = renderHook(() => useAiConsent("u1"));
  expect(result.current.status).toBe("loading");
  await waitFor(() => expect(result.current.status).toBe("undecided"));
});

test("Zustimmung: erst gespeichert, dann granted", async () => {
  load.mockResolvedValue({ ok: true, row: null });
  const { result } = renderHook(() => useAiConsent("u1"));
  await waitFor(() => expect(result.current.status).toBe("undecided"));
  await act(async () => {
    expect(await result.current.grant()).toBe(true);
  });
  expect(save).toHaveBeenCalledWith("u1", true);
  expect(result.current.status).toBe("granted");
});

test("Speichern der Zustimmung scheitert: Status bleibt", async () => {
  load.mockResolvedValue({ ok: true, row: null });
  save.mockResolvedValue(false);
  const { result } = renderHook(() => useAiConsent("u1"));
  await waitFor(() => expect(result.current.status).toBe("undecided"));
  await act(async () => {
    expect(await result.current.grant()).toBe(false);
  });
  expect(result.current.status).toBe("undecided");
});

test("Ablehnen: declined, auf dem Gerät gemerkt und eine evtl. gespeicherte Zustimmung gelöscht", async () => {
  load.mockResolvedValue({ ok: false });
  const { result } = renderHook(() => useAiConsent("u1"));
  await waitFor(() => expect(result.current.status).toBe("unavailable"));
  act(() => result.current.decline());
  expect(result.current.status).toBe("declined");
  expect(readDeclinedOnDevice("u1")).toBe(true);
  expect(save).toHaveBeenCalledWith("u1", false);
});

test("Widerruf scheitert: bleibt granted; gelingt er: declined", async () => {
  load.mockResolvedValue({ ok: true, row: GRANTED_ROW });
  const { result } = renderHook(() => useAiConsent("u1"));
  await waitFor(() => expect(result.current.status).toBe("granted"));
  save.mockResolvedValueOnce(false);
  await act(async () => {
    expect(await result.current.revoke()).toBe(false);
  });
  expect(result.current.status).toBe("granted");
  await act(async () => {
    expect(await result.current.revoke()).toBe(true);
  });
  expect(result.current.status).toBe("declined");
});

test("vorher auf dem Gerät abgelehnt: declined, kein erneutes Fragen", async () => {
  writeDeclinedOnDevice("u1", true);
  load.mockResolvedValue({ ok: true, row: null });
  const { result } = renderHook(() => useAiConsent("u1"));
  await waitFor(() => expect(result.current.status).toBe("declined"));
});

test("nicht lesbar: lädt bei Rückkehr in die App bzw. wieder online neu", async () => {
  load.mockResolvedValueOnce({ ok: false }).mockResolvedValue({ ok: true, row: GRANTED_ROW });
  const { result } = renderHook(() => useAiConsent("u1"));
  await waitFor(() => expect(result.current.status).toBe("unavailable"));
  act(() => {
    window.dispatchEvent(new Event("online"));
  });
  await waitFor(() => expect(result.current.status).toBe("granted"));
  expect(load).toHaveBeenCalledTimes(2);
});
