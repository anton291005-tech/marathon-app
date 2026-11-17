import { useState } from "react";
import { isUsageEventsEnabled, setUsageEventsEnabled } from "../../telemetry/usageEvents";
import { SettingsGroup, SettingsRow } from "./SettingsList";

export const USAGE_EVENTS_FOOTER_ON =
  "MyRace zählt, ob und wie du die App nutzt: App geöffnet, Plan erstellt, Einheit erledigt, Vorschlag angenommen. Ohne Inhalte, ohne Gesundheitswerte, nur mit deiner Konto-ID. Tippen schaltet es aus.";
export const USAGE_EVENTS_FOOTER_OFF = "Aus. MyRace zählt keine Nutzung mehr. Tippen schaltet es wieder ein.";

/** Einstellungen → Datenschutz & Daten: Nutzungsdaten an/aus (Wahl lokal auf dem Gerät, `usageEvents`). */
export function UsageEventsSetting() {
  const [enabled, setEnabled] = useState(() => isUsageEventsEnabled());
  return (
    <SettingsGroup title="Nutzungsdaten" footer={enabled ? USAGE_EVENTS_FOOTER_ON : USAGE_EVENTS_FOOTER_OFF}>
      <SettingsRow
        label="Nutzung zählen"
        value={enabled ? "An" : "Aus"}
        onClick={() => {
          const next = !enabled;
          setUsageEventsEnabled(next);
          setEnabled(next);
        }}
      />
    </SettingsGroup>
  );
}
