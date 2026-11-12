import { useState } from "react";
import {
  collectHealthSignalsDiagnostics,
  formatHealthSignalsReport,
} from "../../appleHealth/healthSignalsDiagnostics";
import { SettingsGroup } from "./SettingsList";

/**
 * Versteckte Geräte-Diagnose für die Uhr-Signale (Readiness Baustein B). Nur gerendert, wenn der Aufrufer
 * `isCheckInEnabled()` bejaht (Dev, Preview, Antons iPhone) – in Production nie sichtbar.
 */
export function HealthSignalsDiagnosticsPanel() {
  const [report, setReport] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const run = async () => {
    setBusy(true);
    setCopied(false);
    try {
      const text = formatHealthSignalsReport(await collectHealthSignalsDiagnostics());
      // eslint-disable-next-line no-console
      console.log("[HEALTH_SIGNALS_DIAGNOSTICS]\n" + text);
      setReport(text);
    } catch (e) {
      setReport(`Fehler: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!report) return;
    try {
      await navigator.clipboard.writeText(report);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <SettingsGroup title="Uhr-Signale (Test)" padded>
      <div data-testid="health-signals-diagnostics" style={{ paddingTop: 14, display: "flex", flexDirection: "column", gap: 10 }}>
        <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.5, margin: 0 }}>
          Nur für Tests: zeigt, welche Werte deine Uhr in den letzten 7 Tagen nach Apple Health geschrieben hat.
        </p>
        <button type="button" onClick={() => void run()} disabled={busy} style={{ padding: "10px 14px", fontWeight: 700 }}>
          {busy ? "Lese …" : "Uhr-Signale prüfen"}
        </button>
        {report ? (
          <>
            <pre
              data-testid="health-signals-report"
              style={{ fontSize: 11, lineHeight: 1.4, whiteSpace: "pre-wrap", overflowWrap: "anywhere", margin: 0, color: "var(--text-primary)" }}
            >
              {report}
            </pre>
            <button type="button" onClick={() => void copy()} style={{ padding: "8px 12px" }}>
              {copied ? "Kopiert" : "Befund kopieren"}
            </button>
          </>
        ) : null}
      </div>
    </SettingsGroup>
  );
}
