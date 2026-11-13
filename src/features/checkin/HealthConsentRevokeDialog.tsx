type Props = {
  busy?: boolean;
  error?: string | null;
  onCancel: () => void;
  onConfirm: () => void;
};

/** Was der Widerruf löscht – dieselbe Liste steht in der Datenschutzerklärung §6 und in Migration 022. */
export const HEALTH_REVOKE_DELETES: readonly string[] = [
  "alle Check-ins",
  "alle Erholungs-Tageswerte (Schlaf, HRV, Ruhepuls, Temperatur)",
  "die Anstrengung deiner Einheiten",
];

/** Bestätigung vor dem Widerruf der Gesundheits-Zustimmung (löscht Daten, nicht rückgängig zu machen). */
export function HealthConsentRevokeDialog({ busy = false, error = null, onCancel, onConfirm }: Props) {
  return (
    <div className="mr-sheet-scrim">
      <div className="mr-sheet" role="dialog" aria-modal="true" aria-labelledby="health-revoke-title">
        <div className="mr-sheet__grabber" aria-hidden>
          <span />
        </div>
        <div className="mr-sheet__body mr-sheet__body--flush">
          <header className="mr-sheet__head">
            <div style={{ minWidth: 0 }}>
              <div className="mr-sheet__meta">Gesundheitsdaten</div>
              <h1 id="health-revoke-title" className="mr-sheet__title">
                Zustimmung widerrufen?
              </h1>
            </div>
          </header>
          <p className="mr-sheet__text">MyRace löscht dann aus deinem Konto und von diesem Gerät:</p>
          <ul style={{ margin: 0, padding: "0 0 0 18px", display: "flex", flexDirection: "column", gap: 4 }}>
            {HEALTH_REVOKE_DELETES.map((item) => (
              <li key={item} className="mr-sheet__text">
                {item}
              </li>
            ))}
          </ul>
          <p className="mr-sheet__text">
            Deine Trainings bleiben. Das lässt sich nicht rückgängig machen. Den Lesezugriff entziehst du zusätzlich in
            den iPhone-Einstellungen unter Gesundheit → Datenzugriff &amp; Geräte → MyRace.
          </p>
          {error ? (
            <p className="mr-sheet__text" role="alert">
              {error}
            </p>
          ) : null}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <button type="button" className="mr-btn mr-btn--primary" disabled={busy} onClick={onConfirm}>
              {busy ? "Lösche …" : error ? "Erneut versuchen" : "Widerrufen und löschen"}
            </button>
            <button type="button" className="mr-btn mr-btn--secondary" disabled={busy} onClick={onCancel}>
              Abbrechen
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
