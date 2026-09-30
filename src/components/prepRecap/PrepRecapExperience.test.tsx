import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import type { FinishTimePatch, PrepRecapRecord } from "../../prepRecap/prepRecapRecord";
import { launchCelebration } from "./celebration";
import { finishTimeActionLabel } from "./finishTimeActionLabel";
import PrepRecapExperience, { type PrepRecapEntry } from "./PrepRecapExperience";
import { fullRecapStats, installPointerEventPolyfill, recapRecord } from "./recapTestFixtures";

jest.mock("../../native/haptics", () => ({
  hapticImpactLight: jest.fn().mockResolvedValue(undefined),
  hapticSuccess: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("./celebration", () => ({ launchCelebration: jest.fn() }));

// CRA setzt Mocks vor jedem Test zurück (resetMocks) — Implementierung daher pro Test.
function mockCelebration() {
  (launchCelebration as jest.Mock).mockImplementation(() => ({ done: new Promise(() => {}), cancel: jest.fn() }));
}

function Harness({
  initial,
  entry = "story",
  onSave,
  onClose = jest.fn(),
}: {
  initial: PrepRecapRecord;
  entry?: PrepRecapEntry;
  onSave: jest.Mock;
  onClose?: jest.Mock;
}) {
  const [record, setRecord] = useState(initial);
  return (
    <PrepRecapExperience
      record={record}
      entry={entry}
      onClose={onClose}
      onSaveFinish={async (patch: FinishTimePatch) => {
        onSave(patch);
        setRecord((r) => ({
          ...r,
          finishTimeSeconds: patch.seconds,
          finishTimeSource: patch.source,
          finishTimeConfirmed: patch.confirmed,
        }));
      }}
    />
  );
}

describe("PrepRecapExperience", () => {
  let restorePointerEvent: () => void;
  beforeAll(() => {
    restorePointerEvent = installPointerEventPolyfill();
  });
  afterAll(() => restorePointerEvent());
  beforeEach(() => mockCelebration());

  it("unbestätigte Zeit: erst die Bestätigung, dann die Story", async () => {
    const onSave = jest.fn();
    render(<Harness initial={recapRecord()} onSave={onSave} />);
    expect(screen.getByTestId("finish-time-step")).toBeInTheDocument();
    expect(screen.queryByTestId("prep-recap-story")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Stimmt" }));
    await waitFor(() => expect(screen.getByTestId("prep-recap-story")).toBeInTheDocument());
    expect(onSave).toHaveBeenCalledWith({ seconds: 11637, source: "health", confirmed: true });
    expect(screen.getByTestId("recap-slide-intro")).toBeInTheDocument();
  });

  it("Überspringen öffnet die Story, ohne zu bestätigen", () => {
    const onSave = jest.fn();
    render(<Harness initial={recapRecord()} onSave={onSave} />);
    fireEvent.click(screen.getByRole("button", { name: "Überspringen" }));
    expect(screen.getByTestId("prep-recap-story")).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("bestätigte Zeit: direkt die Story", () => {
    render(<Harness initial={recapRecord({ finishTimeConfirmed: true })} onSave={jest.fn()} />);
    expect(screen.queryByTestId("finish-time-step")).toBeNull();
    expect(screen.getByTestId("prep-recap-story")).toBeInTheDocument();
  });

  it("Plan ohne Rennen: keine Zeitabfrage, keine Zeit-Aktion", () => {
    const stats = fullRecapStats();
    const record = recapRecord({
      finishTimeSeconds: null,
      finishTimeSource: null,
      stats: { ...stats, race: { ...stats.race, completedBy: "plan_ended" } },
    });
    render(<Harness initial={record} onSave={jest.fn()} />);
    expect(screen.getByTestId("prep-recap-story")).toBeInTheDocument();
  });

  it("Outro → Zeit bearbeiten → zurück aufs Outro", async () => {
    const onSave = jest.fn();
    render(<Harness initial={recapRecord({ finishTimeConfirmed: true })} onSave={onSave} />);
    // Bis zum Outro tippen.
    for (let i = 0; i < 12; i += 1) {
      const stage = screen.getByTestId("recap-stage");
      fireEvent.pointerDown(stage, { clientX: 900, clientY: 300 });
      fireEvent.pointerUp(stage, { clientX: 900, clientY: 300 });
    }
    expect(screen.getByTestId("recap-slide-outro")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Zeit bearbeiten" }));
    expect(screen.getByLabelText("Minuten")).toHaveValue("13");
    fireEvent.change(screen.getByLabelText("Minuten"), { target: { value: "12" } });
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    await waitFor(() => expect(screen.getByTestId("recap-slide-outro")).toBeInTheDocument());
    expect(onSave).toHaveBeenCalledWith({ seconds: 11577, source: "manual", confirmed: true });
    expect(screen.getByText("3:12:57")).toBeInTheDocument();
  });

  it("Einstieg über die Ergebnis-Karte: nur die Zeit, danach schließen", async () => {
    const onClose = jest.fn();
    render(<Harness initial={recapRecord()} entry="editTime" onSave={jest.fn()} onClose={onClose} />);
    expect(screen.getByRole("button", { name: "Abbrechen" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Stimmt" }));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it("beschriftet die Zeit-Aktion nach Zustand", () => {
    expect(finishTimeActionLabel({ finishTimeSeconds: null, finishTimeConfirmed: false })).toBe("Zeit eintragen");
    expect(finishTimeActionLabel({ finishTimeSeconds: 11637, finishTimeConfirmed: false })).toBe("Zeit bestätigen");
    expect(finishTimeActionLabel({ finishTimeSeconds: 11637, finishTimeConfirmed: true })).toBe("Zeit bearbeiten");
  });
});
