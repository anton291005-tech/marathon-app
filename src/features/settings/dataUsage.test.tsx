import { render, screen } from "@testing-library/react";
import { APPLE_HEALTH_READ_TYPES } from "../../appleHealth/appleHealthService";
import { SettingsDataUsagePage } from "./SettingsDataUsagePage";
import { HEALTH_SIGNAL_TYPES } from "../../appleHealth/healthSignalsPlugin";
import { AI_DATA_USES, APPLE_HEALTH_TYPE_LABELS, listAppleHealthDataTypes } from "./dataUsage";

describe("Datennutzung", () => {
  test("jeder angefragte HealthKit-Typ hat genau einen eigenen Anzeigenamen", () => {
    const labels = listAppleHealthDataTypes(true);
    expect(labels).toHaveLength(APPLE_HEALTH_READ_TYPES.length + HEALTH_SIGNAL_TYPES.length);
    expect(new Set(labels).size).toBe(labels.length);
    for (const type of APPLE_HEALTH_READ_TYPES) {
      expect(APPLE_HEALTH_TYPE_LABELS[type]).toBeTruthy();
    }
    expect(Object.keys(APPLE_HEALTH_TYPE_LABELS).sort()).toEqual([...APPLE_HEALTH_READ_TYPES].sort());
  });

  test("ohne Uhr-Signale-Flag (Production) fehlen Blutsauerstoff und die Native-Typen in der Liste und auf der Seite", () => {
    const labels = listAppleHealthDataTypes();
    expect(labels).toHaveLength(APPLE_HEALTH_READ_TYPES.length - 1);
    expect(labels).not.toContain(APPLE_HEALTH_TYPE_LABELS.oxygenSaturation);
    render(<SettingsDataUsagePage />);
    expect(screen.queryByText(APPLE_HEALTH_TYPE_LABELS.oxygenSaturation)).toBeNull();
    expect(screen.queryByText(/RMSSD/)).toBeNull();
    expect(screen.queryByText("Uhr-Signale (Test)")).toBeNull();
  });

  test("mit Flag zeigt die Seite die Uhr-Signale", () => {
    render(<SettingsDataUsagePage showDiagnostics />);
    for (const label of listAppleHealthDataTypes(true)) expect(screen.getByText(label)).toBeInTheDocument();
  });

  test("die Seite listet alle Health-Typen und beide KI-Wege mit Anbieter", () => {
    render(<SettingsDataUsagePage showDiagnostics />);
    for (const label of listAppleHealthDataTypes(true)) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    for (const use of AI_DATA_USES) {
      expect(screen.getByText(use.title)).toBeInTheDocument();
      for (const item of use.items) expect(screen.getByText(item)).toBeInTheDocument();
    }
    expect(screen.getAllByText(/Anthropic \(Claude\)/)).toHaveLength(AI_DATA_USES.length);
  });

  test("reine Information: keine Schalter, Buttons oder Eingaben (keine Einwilligungslogik)", () => {
    render(<SettingsDataUsagePage />);
    for (const role of ["button", "switch", "checkbox", "textbox", "combobox", "link"]) {
      expect(screen.queryAllByRole(role)).toHaveLength(0);
    }
  });
});
