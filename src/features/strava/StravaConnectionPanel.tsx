import React from "react";
import { RefreshCw } from "lucide-react";
import connectWithStravaButton from "../../strava/assets/btn_strava_connect_with_orange.svg";
import poweredByStravaLogo from "../../strava/assets/api_logo_pwrdBy_strava_horiz_white.svg";
import type { StravaSyncResult } from "../../strava/stravaSync";

type Feedback = { tone: "ok" | "err"; text: string } | null;

export type StravaConnectionPanelProps = {
  /** `null` = noch nicht geprüft. */
  connected: boolean | null;
  /** Verbinden/Trennen läuft. */
  connectBusy: boolean;
  feedback: Feedback;
  onConnect: () => void;
  onDisconnect: () => void;
  syncBusy: boolean;
  lastResult: StravaSyncResult | null;
  reconnectRequired: boolean;
  onSyncNow: () => void;
};

/** Ruhige Statuszeile zum letzten Abgleich (ohne Fehlercodes). */
export function stravaSyncStatusText(result: StravaSyncResult | null): string | null {
  if (!result) return null;
  switch (result.status) {
    case "ok":
      if (result.imported === 0) return "Abgeglichen. Keine neuen Läufe.";
      return result.imported === 1 ? "Abgeglichen. 1 Lauf übernommen." : `Abgeglichen. ${result.imported} Läufe übernommen.`;
    case "rate_limited":
      return "Strava ist gerade ausgelastet. Die App versucht es später noch einmal.";
    case "error":
      return "Abgleich gerade nicht möglich. Die App versucht es später noch einmal.";
    default:
      return null;
  }
}

const textStyle: React.CSSProperties = { margin: 0, fontSize: 13, lineHeight: "18px", color: "var(--ink-2)" };

/**
 * Strava in Einstellungen → Verbindungen. Brand Guidelines (developers.strava.com/guidelines):
 * OAuth startet nur über den offiziellen „Connect with Strava“-Knopf (unverändert, 48 px hoch),
 * „Powered by Strava“ dort, wo Strava-Daten erscheinen, kleiner als der App-Name.
 */
export function StravaConnectionPanel(props: StravaConnectionPanelProps) {
  const { connected, connectBusy, feedback, reconnectRequired, syncBusy } = props;
  const statusText = connected ? stravaSyncStatusText(props.lastResult) : null;

  const connectButton = (
    <button
      type="button"
      onClick={props.onConnect}
      disabled={connectBusy}
      aria-label="Connect with Strava"
      data-testid="strava-connect"
      style={{
        alignSelf: "flex-start",
        padding: 0,
        border: 0,
        background: "transparent",
        borderRadius: 6,
        cursor: connectBusy ? "default" : "pointer",
        opacity: connectBusy ? 0.55 : 1,
        lineHeight: 0,
      }}
    >
      <img src={connectWithStravaButton} alt="Connect with Strava" height={48} style={{ height: 48, width: "auto", maxWidth: "100%" }} />
    </button>
  );

  return (
    <div data-testid="strava-panel" style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)", paddingTop: "var(--space-3)", minWidth: 0 }}>
      {connected !== true ? (
        <>
          <p style={textStyle}>
            Verbinde Strava, damit Läufe von deiner Garmin- oder einer anderen Uhr automatisch ankommen und
            geplante Einheiten als erledigt zählen.
          </p>
          {connectButton}
        </>
      ) : reconnectRequired ? (
        <>
          <div style={{ fontSize: 15, fontWeight: 600, color: "var(--ink)" }}>Strava neu verbinden</div>
          <p style={textStyle}>
            Strava gibt deine Läufe gerade nicht mehr frei, zum Beispiel weil der Zugriff dort beendet wurde.
            Verbinde Strava neu, dann kommen neue Läufe wieder an.
          </p>
          {connectButton}
        </>
      ) : (
        <>
          <div style={{ fontSize: 15, fontWeight: 600, color: "var(--ink)" }}>Mit Strava verbunden</div>
          <p style={textStyle}>
            Neue Läufe kommen beim Öffnen der App an. Kommt derselbe Lauf auch über Apple Health, zählt er nur
            einmal.
          </p>
          {statusText ? (
            <p style={{ ...textStyle, color: "var(--ink-3)" }} data-testid="strava-sync-status">
              {statusText}
            </p>
          ) : null}
        </>
      )}

      {connected === true ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)" }}>
          {!reconnectRequired ? (
            <button
              type="button"
              className="mr-btn mr-btn--secondary mr-btn--small"
              onClick={props.onSyncNow}
              disabled={syncBusy || connectBusy}
              data-testid="strava-sync-now"
            >
              <RefreshCw className="mr-icon--s" aria-hidden="true" />
              {syncBusy ? "Synchronisiere …" : "Jetzt synchronisieren"}
            </button>
          ) : null}
          <button
            type="button"
            className="mr-btn mr-btn--danger mr-btn--small"
            onClick={props.onDisconnect}
            disabled={connectBusy}
          >
            {connectBusy ? "Trenne …" : "Trennen"}
          </button>
        </div>
      ) : null}

      {feedback ? (
        <p
          style={{ ...textStyle, color: feedback.tone === "ok" ? "var(--status-good)" : "var(--accent-text)", fontWeight: 600 }}
        >
          {feedback.text}
        </p>
      ) : null}

      {connected === true ? (
        <img
          src={poweredByStravaLogo}
          alt="Powered by Strava"
          data-testid="powered-by-strava"
          style={{ height: 14, width: "auto", alignSelf: "flex-start", marginTop: "var(--space-1)" }}
        />
      ) : null}
    </div>
  );
}
