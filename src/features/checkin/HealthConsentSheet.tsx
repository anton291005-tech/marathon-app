import { useState } from "react";
import { HEALTH_CONSENT_TEXT } from "./healthConsent";

type Props = {
  /** Speichert die Zustimmung; `false` = hat nicht geklappt (Sheet bleibt offen). */
  onGrant: () => Promise<boolean>;
  /** „Nicht jetzt“: für diese Textversion auf diesem Gerät nicht erneut fragen. */
  onDecline: () => void;
};

/**
 * Gesundheits-Zustimmung v2 (nur mit Uhr-Signale-Flag). Erscheint vor dem Apple-Health-Dialog, vor der ersten
 * gespeicherten Anstrengung und einmal pro Textversion beim Start für verbundene Nutzer.
 */
export function HealthConsentSheet({ onGrant, onDecline }: Props) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  return (
    <div className="mr-sheet-scrim">
      <div className="mr-sheet" role="dialog" aria-modal="true" aria-labelledby="health-consent-title">
        <div className="mr-sheet__grabber" aria-hidden>
          <span />
        </div>
        <div className="mr-sheet__body mr-sheet__body--flush">
          <header className="mr-sheet__head">
            <div style={{ minWidth: 0 }}>
              <div className="mr-sheet__meta">Gesundheitsdaten</div>
              <h1 id="health-consent-title" className="mr-sheet__title">
                Gesundheitsdaten speichern?
              </h1>
            </div>
          </header>
          <p className="mr-sheet__text" style={{ whiteSpace: "pre-line" }} data-testid="health-consent-text">
            {HEALTH_CONSENT_TEXT}
          </p>
          <p className="mr-sheet__text">
            Ohne Zustimmung liest MyRace keine Erholungswerte, fragt nicht nach der Anstrengung und speichert keinen
            Check-in. Trainings und Plan funktionieren weiter.
          </p>
          {failed ? (
            <p className="mr-sheet__text" role="alert">
              Speichern hat nicht geklappt. Prüf deine Verbindung und versuch es noch einmal.
            </p>
          ) : null}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <button
              type="button"
              className="mr-btn mr-btn--primary"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setFailed(false);
                const ok = await onGrant();
                setBusy(false);
                if (!ok) setFailed(true);
              }}
            >
              {busy ? "Speichere …" : "Zustimmen"}
            </button>
            <button type="button" className="mr-btn mr-btn--secondary" disabled={busy} onClick={onDecline}>
              Nicht jetzt
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
