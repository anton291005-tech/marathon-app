import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { deleteShiftEntries, loadShiftEntries, upsertShiftEntries } from "../../../lib/supabase/services/shiftEntriesService";
import { loadShiftProfile, saveShiftProfile } from "../../../lib/supabase/services/shiftProfileService";
import { getShiftState, loadShiftData, resetShiftStateForTests } from "../../../shift/shiftStore";
import { setShiftUsageListener } from "../../../shift/shiftUsage";
import { ShiftPlanPage } from "../ShiftPlanPage";
import { ShiftIntroCard, ShiftSettingsRows, ShiftWizardQuestion } from "../ShiftCards";

jest.mock("../../../lib/supabase/services/shiftEntriesService", () => {
  const actual = jest.requireActual("../../../lib/supabase/services/shiftEntriesService");
  return {
    ...actual,
    loadShiftEntries: jest.fn(),
    upsertShiftEntries: jest.fn(),
    deleteShiftEntries: jest.fn(),
  };
});
jest.mock("../../../lib/supabase/services/shiftProfileService", () => {
  const actual = jest.requireActual("../../../lib/supabase/services/shiftProfileService");
  return { ...actual, loadShiftProfile: jest.fn(), saveShiftProfile: jest.fn() };
});

const TODAY = "2026-11-16";
const loadEntries = loadShiftEntries as jest.Mock;
const upsert = upsertShiftEntries as jest.Mock;
const del = deleteShiftEntries as jest.Mock;
const loadProfile = loadShiftProfile as jest.Mock;
const saveProfile = saveShiftProfile as jest.Mock;

async function boot(opts: { entries?: "ok" | "unavailable"; worksShifts?: boolean | null } = {}) {
  loadEntries.mockResolvedValue(opts.entries === "unavailable" ? { status: "unavailable" } : { status: "ok", value: [] });
  loadProfile.mockResolvedValue({ status: "ok", value: { worksShifts: opts.worksShifts ?? null, defaults: null } });
  await act(async () => {
    await loadShiftData("user-1", TODAY);
  });
}

beforeEach(() => {
  localStorage.clear();
  resetShiftStateForTests();
  jest.clearAllMocks();
  upsert.mockResolvedValue({ status: "ok", value: 0 });
  del.mockResolvedValue({ status: "ok", value: 0 });
  saveProfile.mockResolvedValue("ok");
});

afterEach(() => setShiftUsageListener(null));

describe("ShiftPlanPage", () => {
  it("zeigt 28 Tage ab heute mit den fünf Chips", async () => {
    await boot({ worksShifts: true });
    render(<ShiftPlanPage todayYmd={TODAY} onClose={jest.fn()} />);
    expect(screen.getByRole("dialog", { name: "Dienstplan" })).toBeInTheDocument();
    expect(screen.getAllByTestId(/^shift-day-/)).toHaveLength(28);
    const first = within(screen.getByTestId(`shift-day-${TODAY}`));
    ["Früh", "Spät", "Nacht", "Frei", "Eigene Zeit"].forEach((label) => expect(first.getByRole("button", { name: label })).toBeInTheDocument());
    expect(screen.getByTestId("shift-day-2026-12-13")).toBeInTheDocument();
    expect(screen.queryByTestId("shift-day-2026-12-14")).toBeNull();
  });

  it("ein Tipp je Tag, Speichern in einem Bulk-Upsert, Nutzungs-Hook meldet das Speichern", async () => {
    await boot({ worksShifts: true });
    const events: string[] = [];
    setShiftUsageListener((event) => events.push(event));
    const onSaved = jest.fn(() => ({ handled: false, message: "Diese und nächste Woche passen zu deinem Dienstplan." }));
    render(<ShiftPlanPage todayYmd={TODAY} onClose={jest.fn()} onSaved={onSaved} />);
    fireEvent.click(within(screen.getByTestId("shift-day-2026-11-16")).getByRole("button", { name: "Nacht" }));
    fireEvent.click(within(screen.getByTestId("shift-day-2026-11-17")).getByRole("button", { name: "Nacht" }));
    fireEvent.click(within(screen.getByTestId("shift-day-2026-11-18")).getByRole("button", { name: "Frei" }));
    expect(within(screen.getByTestId("shift-day-2026-11-16")).getByText("Nacht · 22–6 Uhr")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Speichern (3)" }));
    await waitFor(() => expect(upsert).toHaveBeenCalledTimes(1));
    const rows = upsert.mock.calls[0][1];
    expect(rows.map((r: { dateYmd: string; kind: string }) => `${r.dateYmd}:${r.kind}`)).toEqual(["2026-11-16:night", "2026-11-17:night", "2026-11-18:off"]);
    await screen.findByText("Gespeichert. Diese und nächste Woche passen zu deinem Dienstplan.");
    expect(onSaved).toHaveBeenCalledWith({ remote: "ok", count: 3 });
    expect(events).toEqual(["shift_entries_saved"]);
    expect(Object.keys(getShiftState().entriesByDate)).toHaveLength(3);
  });

  it("Eigene Zeit: Zeiten änderbar, endet sie vor dem Beginn, endet sie am Folgetag", async () => {
    await boot({ worksShifts: true });
    render(<ShiftPlanPage todayYmd={TODAY} onClose={jest.fn()} />);
    const day = within(screen.getByTestId("shift-day-2026-11-19"));
    fireEvent.click(day.getByRole("button", { name: "Eigene Zeit" }));
    fireEvent.change(day.getByLabelText(/Beginn am/), { target: { value: "17:00" } });
    fireEvent.change(day.getByLabelText(/Ende am/), { target: { value: "00:30" } });
    expect(day.getByText("Eigene Zeit · 17:00–0:30 Uhr")).toBeInTheDocument();
  });

  it("Rotationsmuster F F S S N N – – – füllt vier Wochen in wenigen Tipps", async () => {
    await boot({ worksShifts: true });
    render(<ShiftPlanPage todayYmd={TODAY} onClose={jest.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Rotation oder Woche übernehmen/ }));
    fireEvent.change(screen.getByLabelText(/Rotationsmuster/), { target: { value: "F F S S N N – – –" } });
    fireEvent.click(screen.getByRole("button", { name: "Muster eintragen" }));
    expect(screen.getByText("28 Tage eingetragen – noch nicht gespeichert.")).toBeInTheDocument();
    expect(within(screen.getByTestId("shift-day-2026-11-16")).getByText("Früh · 6–14 Uhr")).toBeInTheDocument();
    expect(within(screen.getByTestId("shift-day-2026-11-20")).getByText("Nacht · 22–6 Uhr")).toBeInTheDocument();
    expect(within(screen.getByTestId("shift-day-2026-11-22")).getAllByText("Frei")).toHaveLength(2);
    // 9-Tage-Zyklus: Tag 10 beginnt wieder mit Früh.
    expect(within(screen.getByTestId("shift-day-2026-11-25")).getByText("Früh · 6–14 Uhr")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Speichern (28)" }));
    await waitFor(() => expect(upsert).toHaveBeenCalledTimes(1));
    expect(upsert.mock.calls[0][1]).toHaveLength(28);
  });

  it("Musterknöpfe statt Tastatur; unbekannte Zeichen werden gemeldet", async () => {
    await boot({ worksShifts: true });
    render(<ShiftPlanPage todayYmd={TODAY} onClose={jest.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Rotation oder Woche übernehmen/ }));
    fireEvent.click(screen.getByRole("button", { name: "Nacht anhängen" }));
    fireEvent.click(screen.getByRole("button", { name: "Frei anhängen" }));
    expect(screen.getByLabelText(/Rotationsmuster/)).toHaveValue("N –");
    fireEvent.change(screen.getByLabelText(/Rotationsmuster/), { target: { value: "F Q" } });
    expect(screen.getByRole("alert")).toHaveTextContent("Unbekannt: q");
    expect(screen.getByRole("button", { name: "Muster eintragen" })).toBeDisabled();
  });

  it("Woche kopieren überträgt die erste Woche auf die folgenden", async () => {
    await boot({ worksShifts: true });
    render(<ShiftPlanPage todayYmd={TODAY} onClose={jest.fn()} />);
    fireEvent.click(within(screen.getByTestId("shift-day-2026-11-16")).getByRole("button", { name: "Spät" }));
    fireEvent.click(screen.getByRole("button", { name: /Rotation oder Woche übernehmen/ }));
    fireEvent.click(screen.getByRole("button", { name: /Auf die folgenden Wochen übertragen/ }));
    expect(within(screen.getByTestId("shift-day-2026-11-23")).getByText("Spät · 14–22 Uhr")).toBeInTheDocument();
    expect(within(screen.getByTestId("shift-day-2026-12-07")).getByText("Spät · 14–22 Uhr")).toBeInTheDocument();
  });

  it("fehlende Tabelle: ruhiger Hinweis statt Fehler, Einträge bleiben auf dem Gerät", async () => {
    await boot({ entries: "unavailable", worksShifts: true });
    upsert.mockResolvedValue({ status: "unavailable" });
    render(<ShiftPlanPage todayYmd={TODAY} onClose={jest.fn()} />);
    expect(screen.getByRole("status")).toHaveTextContent("Deine Einträge bleiben vorerst auf diesem Gerät");
    fireEvent.click(within(screen.getByTestId("shift-day-2026-11-16")).getByRole("button", { name: "Früh" }));
    fireEvent.click(screen.getByRole("button", { name: "Speichern (1)" }));
    await screen.findByText("Auf diesem Gerät gespeichert.");
    expect(screen.queryByText(/Fehler/)).toBeNull();
    expect(getShiftState().entriesByDate["2026-11-16"]?.kind).toBe("early");
  });

  it("Schließen mit ungespeicherten Änderungen fragt einmal nach", async () => {
    await boot({ worksShifts: true });
    const onClose = jest.fn();
    render(<ShiftPlanPage todayYmd={TODAY} onClose={onClose} />);
    fireEvent.click(within(screen.getByTestId("shift-day-2026-11-16")).getByRole("button", { name: "Früh" }));
    fireEvent.click(screen.getByRole("button", { name: "Schließen" }));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText(/Noch nicht gespeichert/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Schließen" }));
    expect(onClose).toHaveBeenCalled();
  });
});

describe("Wizard-Frage und Karten", () => {
  it("Wizard: Ja → Nutzen-Satz und „Dienstplan jetzt eintragen“ / „Später“; Antwort wird gespeichert", async () => {
    await boot({ worksShifts: null });
    render(<ShiftWizardQuestion todayYmd={TODAY} />);
    expect(screen.getByText("Arbeitest du in Schichten oder mit wechselnden Zeiten?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Ja" }));
    expect(saveProfile).toHaveBeenCalledWith("user-1", { worksShifts: true });
    expect(screen.getByText(/MyRace erkennt Tage nach Nacht- und Spätdiensten/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Dienstplan jetzt eintragen" }));
    expect(screen.getByTestId("shift-plan-page")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Schließen" }));
    fireEvent.click(screen.getByRole("button", { name: "Später" }));
    expect(screen.getByText(/später im Woche-Tab/)).toBeInTheDocument();
  });

  it("Wizard: Nein speichert false und zeigt keinen Nutzen-Satz", async () => {
    await boot({ worksShifts: null });
    render(<ShiftWizardQuestion todayYmd={TODAY} />);
    fireEvent.click(screen.getByRole("button", { name: "Nein" }));
    expect(saveProfile).toHaveBeenCalledWith("user-1", { worksShifts: false });
    expect(screen.queryByText("Dienstplan jetzt eintragen")).toBeNull();
    expect(screen.getByRole("button", { name: "Nein" })).toHaveAttribute("aria-pressed", "true");
  });

  it("Spalte fehlt: Antwort bleibt lokal und wird beim nächsten Laden nachgereicht", async () => {
    loadEntries.mockResolvedValue({ status: "ok", value: [] });
    loadProfile.mockResolvedValue({ status: "unavailable" });
    await act(async () => {
      await loadShiftData("user-1", TODAY);
    });
    saveProfile.mockResolvedValueOnce("unavailable");
    render(<ShiftWizardQuestion todayYmd={TODAY} />);
    fireEvent.click(screen.getByRole("button", { name: "Ja" }));
    await waitFor(() => expect(getShiftState().worksShifts).toBe(true));
    loadProfile.mockResolvedValue({ status: "ok", value: { worksShifts: null, defaults: null } });
    saveProfile.mockResolvedValue("ok");
    await act(async () => {
      await loadShiftData("user-1", TODAY);
    });
    expect(saveProfile).toHaveBeenLastCalledWith("user-1", { worksShifts: true, defaults: null });
    expect(getShiftState().worksShifts).toBe(true);
  });

  it("Karte auf „Heute“: Ja öffnet den Dienstplan, X blendet sie dauerhaft aus", async () => {
    await boot({ worksShifts: null });
    const onYes = jest.fn();
    render(<ShiftIntroCard onYes={onYes} />);
    fireEvent.click(screen.getByRole("button", { name: "Ja, Dienstplan eintragen" }));
    expect(onYes).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Karte ausblenden" }));
    expect(getShiftState().introDismissed).toBe(true);
  });

  it("Einstellungen: Schalter und Zeile „Dienstplan“", async () => {
    await boot({ worksShifts: false });
    const onOpen = jest.fn();
    render(<ShiftSettingsRows onOpenPlan={onOpen} />);
    const toggle = screen.getByRole("switch", { name: "Ich arbeite in Schichten" });
    expect(toggle).toHaveAttribute("aria-checked", "false");
    expect(screen.queryByRole("button", { name: /^Dienstplan/ })).toBeNull();
    fireEvent.click(toggle);
    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "true");
    fireEvent.click(screen.getByRole("button", { name: /^Dienstplan/ }));
    expect(onOpen).toHaveBeenCalled();
  });
});
