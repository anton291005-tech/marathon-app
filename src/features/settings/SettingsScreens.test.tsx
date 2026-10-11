/* eslint-disable testing-library/no-container, testing-library/no-node-access -- die Rahmen-Tests prüfen Inline-Styles und den Neuaufbau des Scroll-Knotens; dafür gibt es keine Rollen-Abfrage. */
import { fireEvent, render, screen } from "@testing-library/react";
import { SettingsDetailPage, SettingsPageFrame } from "./SettingsDetailPage";
import { SettingsGroup, SettingsRow } from "./SettingsList";
import { SettingsSectionList } from "./SettingsSectionList";

describe("SettingsSectionList", () => {
  test("zeigt Profilkarte und genau die sechs Bereiche; Zeilen und Karte öffnen ihre Seite", () => {
    const onOpen = jest.fn();
    render(
      <SettingsSectionList
        title="Einstellungen"
        email="laeufer@example.com"
        goalLine="Marathon · noch 51 Tage · Ziel 2:50:00"
        values={{ training: "2/5 Pläne" }}
        onOpen={onOpen}
      />,
    );

    expect(screen.getByRole("heading", { name: "Einstellungen" })).toBeInTheDocument();
    expect(screen.getByText("laeufer@example.com")).toBeInTheDocument();
    expect(screen.getByText("Marathon · noch 51 Tage · Ziel 2:50:00")).toBeInTheDocument();
    expect(screen.getByText("2/5 Pläne")).toBeInTheDocument();

    const rows = ["Profil", "Training", "Verbindungen", "App", "Datenschutz & Daten", "Konto & Hilfe"];
    for (const label of rows) {
      expect(screen.getByRole("button", { name: new RegExp(`^${label}(?! öffnen)`) })).toBeInTheDocument();
    }
    // Profilkarte + sechs Zeilen, sonst nichts Tippbares.
    expect(screen.getAllByRole("button")).toHaveLength(7);

    fireEvent.click(screen.getByRole("button", { name: /^Verbindungen/ }));
    expect(onOpen).toHaveBeenLastCalledWith("connections");
    fireEvent.click(screen.getByRole("button", { name: "Profil öffnen" }));
    expect(onOpen).toHaveBeenLastCalledWith("profile");
  });

  test("ohne Ziel und ohne E-Mail stehen Leertexte, nie leere Zeilen", () => {
    render(<SettingsSectionList title="Einstellungen" email={null} goalLine={null} onOpen={() => {}} />);
    expect(screen.getByText("Kein aktives Ziel")).toBeInTheDocument();
    expect(screen.getByText("Nicht angemeldet")).toBeInTheDocument();
  });
});

describe("SettingsDetailPage", () => {
  test("Kopfzeile mit Titel und Zurück zur darunterliegenden Seite", () => {
    const onBack = jest.fn();
    render(
      <SettingsDetailPage title="Training" backLabel="Einstellungen" onBack={onBack}>
        <SettingsGroup title="Aktives Ziel" padded>
          <div>Inhalt</div>
        </SettingsGroup>
      </SettingsDetailPage>,
    );
    expect(screen.getByRole("heading", { name: "Training" })).toBeInTheDocument();
    expect(screen.getByText("Aktives Ziel")).toBeInTheDocument();
    expect(screen.getByText("Inhalt")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Zurück zu Einstellungen" }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});

describe("SettingsPageFrame", () => {
  test("liegt im normalen Fluss — nichts ist position: fixed (Tab-Bar-Guard muss greifen)", () => {
    const { container } = render(
      <SettingsPageFrame pageKey="training" motion={1}>
        <SettingsDetailPage title="Training" backLabel="Einstellungen" onBack={() => {}}>
          <SettingsGroup>
            <SettingsRow label="Teilen" onClick={() => {}} />
          </SettingsGroup>
        </SettingsDetailPage>
      </SettingsPageFrame>,
    );
    const positioned = Array.from(container.querySelectorAll<HTMLElement>("*")).filter(
      (el) => el.style.position === "fixed" || el.style.position === "absolute",
    );
    expect(positioned).toHaveLength(0);
  });

  test("ein Seitenwechsel baut den Scroll-Bereich neu auf", () => {
    const { container, rerender } = render(
      <SettingsPageFrame pageKey="root" motion={0}>
        <div>Wurzel</div>
      </SettingsPageFrame>,
    );
    const before = container.firstElementChild?.lastElementChild;
    rerender(
      <SettingsPageFrame pageKey="training" motion={1}>
        <div>Training</div>
      </SettingsPageFrame>,
    );
    const after = container.firstElementChild?.lastElementChild;
    expect(after).not.toBe(before);
    expect(after).toHaveClass("settings-page-push");
  });
});
