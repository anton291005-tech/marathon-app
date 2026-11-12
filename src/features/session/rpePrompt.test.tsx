// Nachfrage „Wie anstrengend war …?“ (Readiness Schritt 2): Auswahl der Einheit und Karte.
import { fireEvent, render, screen } from "@testing-library/react";
import { RpePromptCard } from "./RpePromptCard";
import { pickRpePromptSession, readRpePromptDismissed, writeRpePromptDismissed } from "./rpePrompt";

const s = (id: string, ymd: string, type = "easy") => ({ id, type, title: `Lauf ${id}`, dateIso: `${ymd}T12:00:00.000Z` });
const SESSIONS = [s("vorgestern", "2026-11-10"), s("gestern", "2026-11-11"), s("heute", "2026-11-12"), s("ruhe", "2026-11-12", "rest"), s("morgen", "2026-11-13")];
const TODAY = "2026-11-12";

describe("pickRpePromptSession", () => {
  it("nimmt die jüngste erledigte Einheit von heute/gestern ohne Anstrengung", () => {
    const logs = { gestern: { done: true }, heute: { done: true }, vorgestern: { done: true } };
    expect(pickRpePromptSession({ sessions: SESSIONS, logs, todayYmd: TODAY, dismissed: new Set() })?.id).toBe("heute");
  });

  it("überspringt Einheiten mit RPE, abgelehnte, ausgelassene, offene und ältere", () => {
    const logs = {
      heute: { done: true, rpe: 5 },
      gestern: { done: true },
      vorgestern: { done: true },
      morgen: { done: true },
    };
    expect(pickRpePromptSession({ sessions: SESSIONS, logs, todayYmd: TODAY, dismissed: new Set() })?.id).toBe("gestern");
    expect(pickRpePromptSession({ sessions: SESSIONS, logs, todayYmd: TODAY, dismissed: new Set(["gestern"]) })).toBeNull();
    expect(
      pickRpePromptSession({ sessions: SESSIONS, logs: { heute: { done: true, skipped: true }, gestern: {} }, todayYmd: TODAY, dismissed: new Set() }),
    ).toBeNull();
  });

  it("RPE 0 zählt als angegeben", () => {
    expect(pickRpePromptSession({ sessions: SESSIONS, logs: { heute: { done: true, rpe: 0 } }, todayYmd: TODAY, dismissed: new Set() })).toBeNull();
  });

  it("Ruhetage werden nie gefragt", () => {
    expect(pickRpePromptSession({ sessions: SESSIONS, logs: { ruhe: { done: true } }, todayYmd: TODAY, dismissed: new Set() })).toBeNull();
  });

  test("von Hand zugeordneter Health-Lauf zählt als erledigt", () => {
    const logs = { heute: { assignedRun: { runId: "r1" } } };
    expect(pickRpePromptSession({ sessions: SESSIONS, logs, todayYmd: TODAY, dismissed: new Set() })?.id).toBe("heute");
  });

  it("„Später“-Liste wird gespeichert", () => {
    window.localStorage.clear();
    writeRpePromptDismissed(new Set(["a", "b"]));
    expect(Array.from(readRpePromptDismissed()).sort()).toEqual(["a", "b"]);
  });
});

describe("RpePromptCard", () => {
  it("Tipp auf einen Wert meldet ihn, „Später“ beendet die Nachfrage", () => {
    const onRate = jest.fn();
    const onDismiss = jest.fn();
    render(<RpePromptCard title="Lockerer Lauf" when="heute" onRate={onRate} onDismiss={onDismiss} />);
    expect(screen.getByText("Wie anstrengend war heute „Lockerer Lauf“?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^Anstrengung 6 von 10$/ }));
    expect(onRate).toHaveBeenCalledWith(6);
    fireEvent.click(screen.getByRole("button", { name: "Später" }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
