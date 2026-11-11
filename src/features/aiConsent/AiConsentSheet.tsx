import { useState } from "react";
import { PRIVACY_POLICY_URL } from "../settings/appInfo";
import { AI_COACH_DATA_ITEMS, AI_PLAN_FALLBACK_DATA_ITEMS } from "../settings/dataUsage";

type Props = {
  /** Zustimmen; `false` = Speichern fehlgeschlagen (Sheet bleibt offen mit Hinweis). */
  onGrant: () => Promise<boolean>;
  onDecline: () => void;
};

/**
 * Zustimmungs-Screen für den KI-Coach (App-Store-Regel 5.1.2(i)). Nennt Anbieter und Daten vor dem ersten
 * KI-Aufruf; beide Antworten sind gleich gewichtet, ohne Zustimmung bleibt die App voll nutzbar.
 * Bewusst ohne Schließen per Tippen daneben: eine Entscheidung ist nötig, „Ohne Coach“ ist jederzeit möglich.
 */
export function AiConsentSheet({ onGrant, onDecline }: Props) {
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  const grant = async () => {
    if (saving) return;
    setSaving(true);
    setFailed(false);
    const ok = await onGrant();
    setSaving(false);
    if (!ok) setFailed(true);
  };

  return (
    <div className="mr-sheet-scrim">
      <div className="mr-sheet" role="dialog" aria-modal="true" aria-labelledby="ai-consent-title">
        <div className="mr-sheet__grabber" aria-hidden><span /></div>
        <div className="mr-sheet__body mr-sheet__body--flush">
          <header className="mr-sheet__head">
            <div style={{ minWidth: 0 }}>
              <div className="mr-sheet__meta">Coach</div>
              <h1 id="ai-consent-title" className="mr-sheet__title">KI-Coach aktivieren?</h1>
            </div>
          </header>

          <p className="mr-sheet__text">
            Der Coach beantwortet deine Fragen mit einer KI von <strong>Anthropic (Claude)</strong>. Mit deiner
            Zustimmung schickt MyRace dafür diese Daten an Anthropic:
          </p>

          <section>
            <h2 className="mr-sheet__h2">Beim Coach, bei jeder Frage</h2>
            <ul style={{ margin: 0, padding: "0 0 0 18px", display: "flex", flexDirection: "column", gap: 6 }}>
              {AI_COACH_DATA_ITEMS.map((item) => (
                <li key={item} className="mr-sheet__text">
                  {item}
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h2 className="mr-sheet__h2">Bei der Plan-Erstellung, nur im Ausnahmefall</h2>
            <p className="mr-sheet__text" style={{ marginBottom: 6 }}>
              Deinen Plan berechnet MyRace selbst, ohne KI. Nur wenn das scheitert, hilft Claude aus und bekommt:
            </p>
            <ul style={{ margin: 0, padding: "0 0 0 18px", display: "flex", flexDirection: "column", gap: 6 }}>
              {AI_PLAN_FALLBACK_DATA_ITEMS.map((item) => (
                <li key={item} className="mr-sheet__text">
                  {item}
                </li>
              ))}
            </ul>
          </section>

          <p className="mr-sheet__text">
            Deine E-Mail-Adresse wird nicht mitgeschickt. Ohne Zustimmung funktioniert alles andere ganz normal —
            Plan, Woche, Leistung und Apple Health. Nur der Coach bleibt aus. Du kannst das jederzeit unter
            Einstellungen → Datenschutz &amp; Daten ändern.
          </p>

          <a className="mr-sheet__text" href={PRIVACY_POLICY_URL} target="_blank" rel="noreferrer" style={{ color: "var(--accent-text)" }}>
            Datenschutzerklärung lesen
          </a>

          {failed ? (
            <p className="mr-sheet__text" role="alert" style={{ color: "var(--danger, var(--accent-text))" }}>
              Speichern hat nicht geklappt. Prüf deine Verbindung und versuch es noch einmal.
            </p>
          ) : null}

          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: "auto" }}>
            <button type="button" className="mr-btn mr-btn--primary" onClick={() => void grant()} disabled={saving}>
              {saving ? "Speichere …" : "Zustimmen und Coach nutzen"}
            </button>
            <button type="button" className="mr-btn mr-btn--secondary" onClick={onDecline} disabled={saving}>
              Ohne Coach fortfahren
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
