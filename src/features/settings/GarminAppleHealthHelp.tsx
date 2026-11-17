import React, { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

/**
 * Hilfe bei Apple Health: Garmin-Uhren schreiben über die Garmin-Connect-App nach Apple Health, MyRace
 * liest von dort (kein Filter auf Gerät oder Quelle, siehe Bericht W2 Weg A).
 *
 * Wortlaut: Garmin nennt den Weg in der iPhone-App „Mehr → Einstellungen → Verbundene Apps → Apple Health“.
 * Die Menünamen ändern sich zwischen App-Versionen, deshalb steht der Hinweis auf Abweichungen dabei.
 */
export const GARMIN_APPLE_HEALTH_STEPS: readonly string[] = [
  "Öffne die Garmin-Connect-App und tippe auf „Mehr“, dann auf „Einstellungen“.",
  "Wähle „Verbundene Apps“ und dann „Apple Health“.",
  "Erlaube Trainings (Aktivitäten), Schlaf und Herzfrequenz. Neue Läufe erscheinen danach hier, sobald die Uhr mit Garmin Connect synchronisiert hat.",
];

export function GarminAppleHealthHelp() {
  const [open, setOpen] = useState(false);
  const Icon = open ? ChevronUp : ChevronDown;
  return (
    <div style={{ marginTop: "var(--space-3)", borderTop: "1px solid var(--line)", paddingTop: "var(--space-2)" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        data-testid="garmin-help-toggle"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "var(--space-2)",
          width: "100%",
          minHeight: "var(--size-touch)",
          padding: 0,
          border: 0,
          background: "transparent",
          color: "var(--ink)",
          font: "600 15px/20px var(--font-sans)",
          textAlign: "left",
          cursor: "pointer",
        }}
      >
        <span>Garmin-Uhr? So kommen deine Läufe rein</span>
        <Icon className="mr-icon--s" aria-hidden="true" style={{ color: "var(--ink-3)", flex: "none" }} />
      </button>
      {open ? (
        <div data-testid="garmin-help-steps">
          <ol style={{ margin: "var(--space-1) 0 0", paddingLeft: 20, color: "var(--ink-2)", fontSize: 13, lineHeight: "18px" }}>
            {GARMIN_APPLE_HEALTH_STEPS.map((step) => (
              <li key={step} style={{ marginBottom: "var(--space-2)" }}>
                {step}
              </li>
            ))}
          </ol>
          <p className="mr-caption" style={{ marginTop: "var(--space-1)" }}>
            Je nach Version der Garmin-App können die Menüs etwas anders heißen. Nutzt du zusätzlich Strava, zählt
            derselbe Lauf trotzdem nur einmal.
          </p>
        </div>
      ) : null}
    </div>
  );
}
