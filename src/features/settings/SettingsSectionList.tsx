import { SettingsGroup, SettingsRow } from "./SettingsList";
import { SettingsProfileCard } from "./SettingsProfileCard";
import {
  SETTINGS_PAGE_TITLES,
  SETTINGS_SECTION_IDS,
  type SettingsPageId,
  type SettingsSectionId,
} from "./settingsNavigation";

type Props = {
  title: string;
  email: string | null;
  goalLine: string | null;
  /** Aktueller Wert je Bereich (rechts in der Zeile); fehlende Einträge zeigen nur den Chevron. */
  values?: Partial<Record<SettingsSectionId, string | null>>;
  onOpen: (page: SettingsPageId) => void;
};

/** Wurzel des Einstellungen-Tabs: Titel, Profilkarte, die sechs Bereiche. */
export function SettingsSectionList({ title, email, goalLine, values, onOpen }: Props) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <h1 style={{ margin: "4px 4px 0", fontSize: 28, fontWeight: 700, letterSpacing: "-0.02em", color: "var(--text-primary)" }}>
        {title}
      </h1>
      <SettingsProfileCard email={email} goalLine={goalLine} onOpen={() => onOpen("profile")} />
      <SettingsGroup>
        {SETTINGS_SECTION_IDS.map((id) => (
          <SettingsRow key={id} label={SETTINGS_PAGE_TITLES[id]} value={values?.[id]} onClick={() => onOpen(id)} />
        ))}
      </SettingsGroup>
    </div>
  );
}
