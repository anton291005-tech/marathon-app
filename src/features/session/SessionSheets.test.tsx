import { fireEvent, render, screen } from "@testing-library/react";
import { SessionDetailSheet, type SessionDetailResult } from "./SessionDetailSheet";
import { SessionEntrySheet } from "./SessionEntrySheet";
import { buildSessionFlow } from "./sessionDetailModel";

const noop = () => {};

function detail(overrides: Partial<React.ComponentProps<typeof SessionDetailSheet>> = {}) {
  return (
    <SessionDetailSheet
      meta="Mi, 14. Okt · Woche 1 · Grundlage"
      title="Steady-State Lauf"
      status="open"
      plan={{ distanceKm: 10, durationMin: null, pace: null, paceUnit: null, zone: "Zone 2", hrRange: { min: 120, max: 150 } }}
      purpose={null}
      flow={null}
      fuelingHints={[]}
      result={null}
      onClose={noop}
      onDiscussWithCoach={noop}
      onEnter={noop}
      onToggleSkip={noop}
      {...overrides}
    />
  );
}

const RESULT: SessionDetailResult = {
  actualKm: 10.4,
  plannedKm: 10,
  durationSec: 3130,
  paceSecPerKm: 301,
  hrBpm: 141,
  verdict: "Im Zielkorridor",
  verdictGood: true,
  source: "Apple Health",
  feeling: 4,
  notes: "Lief rund.",
};

describe("SessionDetailSheet — geplant", () => {
  test("X statt Schließen/Abbrechen-Text, kein Label EINHEIT, unten Eintragen + Auslassen", () => {
    const onClose = jest.fn();
    const onEnter = jest.fn();
    const onToggleSkip = jest.fn();
    render(detail({ onClose, onEnter, onToggleSkip }));
    expect(screen.queryByText("Einheit")).toBeNull();
    expect(screen.queryByText("Schließen")).toBeNull();
    expect(screen.queryByText("Abbrechen")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Schließen" }));
    fireEvent.click(screen.getByRole("button", { name: "Eintragen" }));
    fireEvent.click(screen.getByRole("button", { name: "Auslassen" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onEnter).toHaveBeenCalledTimes(1);
    expect(onToggleSkip).toHaveBeenCalledTimes(1);
  });

  test("Tempo-Kachel nur mit Wert", () => {
    const { rerender } = render(detail());
    expect(screen.queryByText("Tempo")).toBeNull();
    expect(screen.getByText("Zone 2")).toBeInTheDocument();
    expect(screen.getByText("120–150 bpm")).toBeInTheDocument();
    rerender(detail({ plan: { distanceKm: 10, durationMin: 55, pace: "5:15–5:45", paceUnit: "min/km", zone: "Zone 2", hrRange: null } }));
    expect(screen.getByText("Tempo")).toBeInTheDocument();
    expect(screen.getByText("5:15–5:45")).toBeInTheDocument();
    expect(screen.getByText("ca. 55 min")).toBeInTheDocument();
  });

  test("Abschnitte ohne Daten entfallen: kein Zweck, kein Ablauf, keine Kalender-Zeile", () => {
    render(detail());
    expect(screen.queryByText("Worum es geht")).toBeNull();
    expect(screen.queryByText("Ablauf")).toBeNull();
    expect(screen.queryByText("An Kalender anpassen")).toBeNull();
    expect(screen.getByRole("button", { name: "Mit Coach besprechen" })).toBeInTheDocument();
  });

  test("Zweck, Ablauf mit km und Kalender-Zeile erscheinen, wenn vorhanden", () => {
    const onAdjustToCalendar = jest.fn();
    render(
      detail({
        purpose: "2 km WU · 6×1000m · 2 km CD",
        flow: buildSessionFlow({ type: "interval", km: 10, desc: "2 km WU · 6×1000m · 2 km CD" }),
        onAdjustToCalendar,
      }),
    );
    expect(screen.getByText("Worum es geht")).toBeInTheDocument();
    expect(screen.getByText("Ablauf")).toBeInTheDocument();
    expect(screen.getByText("Einlaufen")).toBeInTheDocument();
    expect(screen.getByText("6,0 km")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "An Kalender anpassen" }));
    expect(onAdjustToCalendar).toHaveBeenCalledTimes(1);
  });

  test("ausgelassen: Plan-Ansicht mit Rückgängig", () => {
    render(detail({ status: "skipped" }));
    expect(screen.getByText("Ausgelassen")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Rückgängig" })).toBeInTheDocument();
  });
});

describe("SessionDetailSheet — erledigt", () => {
  test("Ist gegen Plan, Zeit/Pace/Puls, Eintrag und Eintrag bearbeiten; keine Eintragen-Leiste", () => {
    const onEnter = jest.fn();
    render(detail({ status: "done", result: RESULT, onEnter }));
    expect(screen.getByText("Erledigt")).toBeInTheDocument();
    expect(screen.getByText("10,4")).toBeInTheDocument();
    expect(screen.getByText("Plan 10,0 km")).toBeInTheDocument();
    expect(screen.getByText("52:10")).toBeInTheDocument();
    expect(screen.getByText("5:01")).toBeInTheDocument();
    expect(screen.getByText("141")).toBeInTheDocument();
    expect(screen.getByText("Im Zielkorridor")).toBeInTheDocument();
    expect(screen.getByText("Apple Health")).toBeInTheDocument();
    expect(screen.getByTestId("session-entry")).toHaveTextContent("4 / 5 · leicht");
    expect(screen.getByText("Lief rund.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Eintragen" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Auslassen" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Eintrag bearbeiten" }));
    expect(onEnter).toHaveBeenCalledTimes(1);
  });

  test("Zeit/Pace/Puls nur wenn vorhanden; ohne Gefühl und Notiz kein Eintrag-Block", () => {
    render(
      detail({
        status: "done",
        result: { ...RESULT, durationSec: null, paceSecPerKm: null, hrBpm: null, verdict: null, source: null, feeling: 0, notes: null },
      }),
    );
    expect(screen.getByText("10,4")).toBeInTheDocument();
    expect(screen.queryByText("Zeit")).toBeNull();
    expect(screen.queryByText("Ø Pace")).toBeNull();
    expect(screen.queryByText("Ø Puls")).toBeNull();
    expect(screen.queryByText("Apple Health")).toBeNull();
    expect(screen.queryByText("Dein Eintrag")).toBeNull();
  });

  test("erledigt ohne jeden Wert: Hinweis statt Platzhalter-Zahlen", () => {
    render(
      detail({
        status: "done",
        result: { ...RESULT, actualKm: null, durationSec: null, paceSecPerKm: null, hrBpm: null, verdict: null, source: null },
      }),
    );
    expect(screen.getByText("Als erledigt markiert, ohne aufgezeichnete Werte.")).toBeInTheDocument();
    expect(screen.queryByTestId("session-result")).toBeNull();
  });

  test("Geplanter Ablauf nur mit Aufteilung, klappt die Abschnitte auf", () => {
    const flow = buildSessionFlow({ type: "interval", km: 10, desc: "2 km WU · 6×1000m · 2 km CD" });
    const { rerender } = render(detail({ status: "done", result: RESULT }));
    expect(screen.queryByText("Geplanter Ablauf")).toBeNull();
    rerender(detail({ status: "done", result: RESULT, flow }));
    expect(screen.getByText("2 + 6 + 2 km")).toBeInTheDocument();
    expect(screen.queryByText("Hauptteil")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Geplanter Ablauf/ }));
    expect(screen.getByText("Hauptteil")).toBeInTheDocument();
  });
});

function entry(overrides: Partial<React.ComponentProps<typeof SessionEntrySheet>> = {}) {
  return (
    <SessionEntrySheet
      mode="create"
      subtitle="Steady-State Lauf · Plan 10,0 km"
      initialKm={10}
      initialFeeling={null}
      initialNotes=""
      suggestion={null}
      onSave={noop}
      onClose={noop}
      {...overrides}
    />
  );
}

describe("SessionEntrySheet", () => {
  test("km mit Plan-Wert vorausgefüllt, −/+ ändern, Gefühl 1–5, Notiz optional", () => {
    const onSave = jest.fn();
    render(entry({ onSave }));
    const km = screen.getByLabelText("Distanz") as HTMLInputElement;
    expect(km.value).toBe("10,0");
    fireEvent.click(screen.getByRole("button", { name: "Mehr" }));
    expect(km.value).toBe("10,5");
    fireEvent.click(screen.getByRole("button", { name: "Weniger" }));
    fireEvent.click(screen.getByRole("button", { name: "Weniger" }));
    expect(km.value).toBe("9,5");
    fireEvent.click(screen.getByRole("button", { name: "Gefühl 4 von 5" }));
    expect(screen.getByRole("button", { name: "Gefühl 4 von 5" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Gefühl 3 von 5" })).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    expect(onSave).toHaveBeenCalledWith({ actualKm: "9.5", feeling: 4, notes: "", adoptSuggestion: false });
  });

  test("bestehende Sterne-Werte werden 1:1 übernommen", () => {
    const onSave = jest.fn();
    render(entry({ mode: "edit", initialKm: 10.4, initialFeeling: 2, initialNotes: "zäh", onSave }));
    expect(screen.getByRole("heading", { name: "Eintrag bearbeiten" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Gefühl 2 von 5" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    expect(onSave).toHaveBeenCalledWith({ actualKm: "10.4", feeling: 2, notes: "zäh", adoptSuggestion: false });
  });

  test("Health-Vorschlag nur, wenn ein verknüpfbarer Lauf existiert", () => {
    render(entry());
    expect(screen.queryByTestId("entry-health-suggestion")).toBeNull();
    expect(screen.queryByText("Lauf aus Apple Health")).toBeNull();
  });

  test("Übernehmen setzt die Distanz des Laufs und meldet die Verknüpfung beim Speichern", () => {
    const onSave = jest.fn();
    render(entry({ onSave, suggestion: { line: "Heute 07:12 · 10,4 km · 52:10", km: 10.4 } }));
    expect(screen.getByText("Heute 07:12 · 10,4 km · 52:10")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Übernehmen" }));
    expect((screen.getByLabelText("Distanz") as HTMLInputElement).value).toBe("10,4");
    expect(screen.getByRole("button", { name: "Übernommen" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    expect(onSave).toHaveBeenCalledWith({ actualKm: "10.4", feeling: 0, notes: "", adoptSuggestion: true });
  });

  test("ohne Distanzfeld (Kraft, verknüpfter Health-Lauf) bleibt actualKm unberührt", () => {
    const onSave = jest.fn();
    render(entry({ initialKm: null, onSave }));
    expect(screen.queryByLabelText("Distanz")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    expect(onSave).toHaveBeenCalledWith({ actualKm: undefined, feeling: 0, notes: "", adoptSuggestion: false });
  });

  test("Als offen markieren nur beim Bearbeiten mit Handler", () => {
    const onReopen = jest.fn();
    const { rerender } = render(entry({ onReopen }));
    expect(screen.queryByRole("button", { name: "Als offen markieren" })).toBeNull();
    rerender(entry({ mode: "edit", onReopen }));
    fireEvent.click(screen.getByRole("button", { name: "Als offen markieren" }));
    expect(onReopen).toHaveBeenCalledTimes(1);
  });
});
