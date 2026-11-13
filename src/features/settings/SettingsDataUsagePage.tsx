import type { CSSProperties, ReactNode } from "react";
import { SettingsGroup } from "./SettingsList";
import { HealthSignalsDiagnosticsPanel } from "./HealthSignalsDiagnosticsPanel";
import { AI_DATA_USES, CHECKIN_DATA_ITEMS, listAppleHealthDataTypes } from "./dataUsage";

const textStyle: CSSProperties = { fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.5, margin: 0 };

function BulletList({ items }: { items: readonly string[] }) {
  return (
    <ul style={{ margin: "8px 0 0", padding: "0 0 0 18px", display: "flex", flexDirection: "column", gap: 4 }}>
      {items.map((item) => (
        <li key={item} style={{ fontSize: 15, color: "var(--text-primary)", lineHeight: 1.4 }}>
          {item}
        </li>
      ))}
    </ul>
  );
}

function Block({ children }: { children: ReactNode }) {
  return <div style={{ paddingTop: 14 }}>{children}</div>;
}

/** Infoseite „Welche Daten MyRace nutzt" — reine Information, keine Einwilligungslogik. */
export function SettingsDataUsagePage({
  showCheckIn = false,
  showDiagnostics = false,
}: { showCheckIn?: boolean; showDiagnostics?: boolean } = {}) {
  return (
    <>
      <SettingsGroup title="Apple Health" padded>
        <Block>
          <p style={textStyle}>
            Wenn du Apple Health verbindest, fragt MyRace Lesezugriff auf diese Daten an. Was du freigibst,
            entscheidest du im Apple-Dialog; MyRace schreibt nichts in Apple Health.
          </p>
          <BulletList items={listAppleHealthDataTypes(showDiagnostics)} />
          <p style={{ ...textStyle, marginTop: 12 }}>
            Trainings und Tageswerte zur Erholung werden in deinem MyRace-Konto gespeichert, damit Plan,
            Auswertung und Erholungsstand auf jedem Gerät gleich sind.
          </p>
        </Block>
      </SettingsGroup>

      {showCheckIn ? (
        <SettingsGroup title="Check-in und Befinden" padded>
          <Block>
            <p style={textStyle}>
              Nur wenn du den Gesundheitsangaben zugestimmt hast, speichert MyRace deinen Morgen-Check-in in deinem
              Konto:
            </p>
            <BulletList items={CHECKIN_DATA_ITEMS} />
            <p style={{ ...textStyle, marginTop: 12 }}>
              Derzeit gehen die Angaben nicht an einen KI-Anbieter. Löschst du dein Konto, werden sie mitgelöscht.
            </p>
          </Block>
        </SettingsGroup>
      ) : null}

      {AI_DATA_USES.map((use) => (
        <SettingsGroup key={use.title} title={use.title} padded>
          <Block>
            <p style={textStyle}>Geht zur Verarbeitung an {use.provider}:</p>
            <BulletList items={use.items} />
            {use.note ? <p style={{ ...textStyle, marginTop: 12 }}>{use.note}</p> : null}
          </Block>
        </SettingsGroup>
      ))}

      <p style={{ ...textStyle, fontSize: 12, color: "var(--text-muted)", padding: "0 16px" }}>
        Ist der Coach nicht erreichbar, siehst du eine Fehlermeldung.
      </p>

      {showDiagnostics ? <HealthSignalsDiagnosticsPanel /> : null}
    </>
  );
}
