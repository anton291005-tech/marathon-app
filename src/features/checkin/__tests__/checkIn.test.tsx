// Readiness Schritt 3: Morgen-Check-in (Spec §6.1) — Sheet, Zustand, Offline-Speichern, Flag, Konto-Löschung.
import { act, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";

import { CheckInSheet } from "../CheckInSheet";
import {
  CHECKIN_QUESTIONS,
  canEditCheckIn,
  carryOverIllness,
  carryOverPain,
  emptyCheckIn,
  isCheckInComplete,
  readCheckInCache,
  shouldOfferCheckIn,
  type CheckInEntry,
} from "../checkInState";
import { useDailyCheckIn } from "../useDailyCheckIn";
import { checkInToRow, dbRowToCheckIn } from "../../../lib/supabase/services/dailyCheckinsService";
import { isCheckInEnabled } from "../../settings/settingsFlags";
import { CHECKIN_DATA_ITEMS } from "../../settings/dataUsage";

const mockLoad = jest.fn();
const mockSave = jest.fn();
const mockLoadConsent = jest.fn();
const mockSaveConsent = jest.fn();
jest.mock("../../../lib/supabase/services/dailyCheckinsService", () => {
  const actual = jest.requireActual("../../../lib/supabase/services/dailyCheckinsService");
  return { ...actual, loadDailyCheckins: (...a: unknown[]) => mockLoad(...a), saveDailyCheckin: (...a: unknown[]) => mockSave(...a) };
});
jest.mock("../healthConsent", () => {
  const actual = jest.requireActual("../healthConsent");
  return { ...actual, loadHealthConsent: (...a: unknown[]) => mockLoadConsent(...a), saveHealthConsent: (...a: unknown[]) => mockSaveConsent(...a) };
});

const { USER_DATA_TABLES } = require("../../../../api/_lib/deleteAccount");

const DAY = "2026-11-12";
const FULL: CheckInEntry = { ...emptyCheckIn(DAY), sleepQuality: 4, energy: 3, legs: 2, mind: 5 };

function renderSheet(overrides: Partial<React.ComponentProps<typeof CheckInSheet>> = {}) {
  const onSave = jest.fn();
  const onClose = jest.fn();
  const onGrantConsent = jest.fn().mockResolvedValue(true);
  render(
    <CheckInSheet
      day={DAY}
      initial={null}
      carriedPain={null}
      needsConsent={false}
      onGrantConsent={onGrantConsent}
      onSave={onSave}
      onClose={onClose}
      {...overrides}
    />,
  );
  return { onSave, onClose, onGrantConsent };
}

function answerAll(values = [4, 3, 2, 5]) {
  values.forEach((v, i) => {
    fireEvent.click(screen.getByRole("button", { name: CHECKIN_QUESTIONS[i].labels[v - 1] }));
  });
}

beforeEach(() => {
  window.localStorage.clear();
  mockLoad.mockReset();
  mockSave.mockReset();
  mockLoadConsent.mockReset();
  mockSaveConsent.mockReset();
});

describe("CheckInSheet", () => {
  test("vier Tipps speichern den Check-in (unter 5 Interaktionen), keine Schlafdauer-Eingabe", () => {
    const { onSave } = renderSheet();
    answerAll();
    expect(screen.queryByText("Wie lange hast du geschlafen?")).toBeNull();
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][0]).toMatchObject({ day: DAY, sleepQuality: 4, energy: 3, legs: 2, mind: 5, pain: null, illness: null });
    expect(screen.getByText("Danke!")).toBeInTheDocument();
  });

  test("Zurück erlaubt eine Antwort zu ändern", () => {
    const { onSave } = renderSheet();
    fireEvent.click(screen.getByRole("button", { name: CHECKIN_QUESTIONS[0].labels[0] }));
    fireEvent.click(screen.getByRole("button", { name: "Zurück" }));
    answerAll([2, 3, 3, 3]);
    expect(onSave.mock.calls[0][0].sleepQuality).toBe(2);
  });

  test("Chip „Etwas zwickt“ fragt Stelle, Stärke und Gangbild und speichert nach", () => {
    const { onSave } = renderSheet();
    answerAll();
    fireEvent.click(screen.getByRole("button", { name: "Etwas zwickt" }));
    expect(screen.getByRole("button", { name: "Schmerz 4 von 10" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Knie" }));
    fireEvent.click(screen.getByRole("button", { name: "Schmerz 4 von 10" }));
    fireEvent.click(screen.getByRole("button", { name: "Ja" }));
    const last = onSave.mock.calls[onSave.mock.calls.length - 1][0];
    expect(last.pain).toEqual({ area: "knee", severity: 4, alteredGait: true });
  });

  test("Brust-Symptom öffnet die Warnfrage, Ja zeigt den Notruf-Hinweis", () => {
    renderSheet();
    answerAll();
    fireEvent.click(screen.getByRole("button", { name: "Fühle mich krank" }));
    const chest = screen.getAllByRole("button").find((b) => /Brust/i.test(b.textContent ?? ""));
    expect(chest).toBeDefined();
    fireEvent.click(chest as HTMLElement);
    expect(screen.getByText("Hast du Brustschmerz, Atemnot oder Herzrasen?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Ja" }));
    expect(screen.getByRole("alert")).toHaveTextContent("112");
  });

  test("Schmerz von gestern ist vorausgewählt („Zwickt es noch?“)", () => {
    const { onSave } = renderSheet({ carriedPain: { area: "knee", severity: 3, alteredGait: false } });
    expect(screen.queryByText("Zwickt es noch?")).toBeNull();
    answerAll();
    expect(screen.getByRole("button", { name: "Zwickt es noch?" })).toHaveAttribute("aria-pressed", "true");
    expect(onSave.mock.calls[0][0].pain).toEqual({ area: "knee", severity: 3, alteredGait: false });
  });

  test("nach dem Speichern lassen sich die Antworten ändern", () => {
    const { onSave } = renderSheet();
    answerAll();
    fireEvent.click(screen.getByRole("button", { name: "Antworten ändern" }));
    answerAll([4, 3, 2, 1]);
    expect(onSave).toHaveBeenCalledTimes(2);
    expect(onSave.mock.calls[1][0].mind).toBe(1);
  });

  test("Krankheits-Chip von gestern ist vorausgewählt", () => {
    const { onSave } = renderSheet({ carriedIllness: { symptoms: ["fever"] } });
    answerAll();
    expect(screen.getByRole("button", { name: "Fühle mich krank" })).toHaveAttribute("aria-pressed", "true");
    expect(onSave.mock.calls[0][0].illness).toEqual({ symptoms: ["fever"] });
  });

  test("abgewählter Chip bleibt beim erneuten Öffnen abgewählt", () => {
    const { onSave } = renderSheet({
      initial: { ...FULL, pain: null, illness: null },
      carriedPain: { area: "knee", severity: 3, alteredGait: false },
      carriedIllness: { symptoms: ["fever"] },
    });
    expect(screen.getByRole("button", { name: "Etwas zwickt" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Fühle mich krank" })).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(screen.getByRole("button", { name: "Antworten ändern" }));
    answerAll();
    expect(onSave.mock.calls[0][0]).toMatchObject({ pain: null, illness: null });
  });

  test("ohne Zustimmung erst der Zustimmungs-Screen, ohne Speichern", async () => {
    const { onSave, onGrantConsent, onClose } = renderSheet({ needsConsent: true });
    expect(screen.getByText("Deine Angaben speichern?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Nicht jetzt" }));
    expect(onClose).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Zustimmen und starten" }));
    expect(await screen.findByText(CHECKIN_QUESTIONS[0].text)).toBeInTheDocument();
    expect(onGrantConsent).toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
  });

});

describe("checkInState", () => {
  test("Karte nur vor 14 Uhr, ohne erledigte Einheit, ohne vollständigen Check-in", () => {
    expect(shouldOfferCheckIn({ today: null, hour: 7, sessionDoneToday: false })).toBe(true);
    expect(shouldOfferCheckIn({ today: null, hour: 14, sessionDoneToday: false })).toBe(false);
    expect(shouldOfferCheckIn({ today: null, hour: 7, sessionDoneToday: true })).toBe(false);
    expect(shouldOfferCheckIn({ today: FULL, hour: 7, sessionDoneToday: false })).toBe(false);
    expect(isCheckInComplete({ ...FULL, mind: null })).toBe(false);
  });

  test("Ändern nur bis 14 Uhr und vor der ersten Einheit", () => {
    expect(canEditCheckIn({ today: FULL, hour: 9, sessionDoneToday: false })).toBe(true);
    expect(canEditCheckIn({ today: FULL, hour: 14, sessionDoneToday: false })).toBe(false);
    expect(canEditCheckIn({ today: FULL, hour: 9, sessionDoneToday: true })).toBe(false);
    expect(canEditCheckIn({ today: null, hour: 9, sessionDoneToday: false })).toBe(false);
  });

  test("Krankheit wird ohne Warnantwort übernommen", () => {
    expect(carryOverIllness({ ...FULL, illness: { symptoms: ["chest"], redFlag: true } })).toEqual({ symptoms: ["chest"] });
    expect(carryOverIllness({ ...FULL, illness: null })).toBeNull();
  });

  test("carryOverPain übernimmt nur vorhandenen Schmerz", () => {
    expect(carryOverPain(null)).toBeNull();
    expect(carryOverPain({ ...FULL, pain: { area: "calf", severity: 2, alteredGait: false } })).toEqual({ area: "calf", severity: 2, alteredGait: false });
  });

  test("Zeilen-Mapping schneidet ungültige Werte ab", () => {
    const row = checkInToRow("u1", { ...FULL, sleepQuality: 9, sleepHoursSelf: 20 });
    expect(row).toMatchObject({ user_id: "u1", calendar_day: DAY, sleep_quality: null, energy: 3, sleep_hours_self: null });
    expect(dbRowToCheckIn({ ...row, sleep_quality: 4, sleep_hours_self: "6.5" })).toMatchObject({ sleepQuality: 4, sleepHoursSelf: 6.5 });
  });
});

describe("useDailyCheckIn", () => {
  test("offline gespeichert, beim nächsten Laden nachgereicht", async () => {
    mockLoadConsent.mockResolvedValue({ ok: true, granted: true });
    mockLoad.mockResolvedValue([]);
    mockSave.mockResolvedValueOnce(false);
    let view = renderHook(() => useDailyCheckIn("u1", DAY));
    await waitFor(() => expect(view.result.current.consent).toBe("granted"));
    await act(async () => {
      await view.result.current.save(FULL);
    });
    expect(view.result.current.today).toMatchObject({ sleepQuality: 4 });
    expect(readCheckInCache().pending).toEqual([DAY]);
    view.unmount();

    mockSave.mockResolvedValue(true);
    view = renderHook(() => useDailyCheckIn("u1", DAY));
    await waitFor(() => expect(readCheckInCache().pending).toEqual([]));
    expect(mockSave).toHaveBeenLastCalledWith("u1", expect.objectContaining({ day: DAY }));
    expect(view.result.current.today).toMatchObject({ mind: 5 });
  });

  test("ohne Zustimmung wird nichts synchronisiert", async () => {
    mockLoadConsent.mockResolvedValue({ ok: true, granted: false });
    const { result } = renderHook(() => useDailyCheckIn("u1", DAY));
    await waitFor(() => expect(result.current.consent).toBe("undecided"));
    expect(mockLoad).not.toHaveBeenCalled();
  });
});

describe("Rahmen", () => {
  test("Flag: an für localhost, Vercel-Previews und per Env; aus in Produktion und App", () => {
    const loc = (hostname: string, protocol = "https:") => ({ hostname, protocol }) as Location;
    expect(isCheckInEnabled(undefined, loc("localhost", "http:"))).toBe(true);
    expect(isCheckInEnabled(undefined, loc("marathon-git-feat-daily-checkin-anton291005-techs-projects.vercel.app"))).toBe(true);
    expect(isCheckInEnabled("1", loc("myrace.app"))).toBe(true);
    expect(isCheckInEnabled(undefined, loc("marathon-app.vercel.app"))).toBe(false);
    expect(isCheckInEnabled(undefined, loc("marathon-git-main-anton291005-techs-projects.vercel.app"))).toBe(false);
    expect(isCheckInEnabled(undefined, loc("localhost", "capacitor:"))).toBe(false);
  });

  test("Konto löschen entfernt auch die Check-ins; Datennutzung nennt sie", () => {
    expect(USER_DATA_TABLES).toContain("daily_checkins");
    expect(CHECKIN_DATA_ITEMS.length).toBeGreaterThan(0);
  });
});
