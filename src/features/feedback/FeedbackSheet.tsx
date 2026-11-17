import { useState } from "react";
import { X } from "lucide-react";
import { getAppTodayYmd } from "../../core/time/timeSystem";
import type { FeedbackSubmitResult } from "../../lib/supabase/services/feedbackService";
import { trackUsageEvent } from "../../telemetry/usageEvents";
import { ICON_STROKE } from "../../ui/icons";
import { SUPPORT_EMAIL_CONFIGURED } from "../settings/appInfo";
import {
  buildFeedbackFallbackMailto,
  buildFeedbackRecord,
  FEEDBACK_CATEGORIES,
  FEEDBACK_MESSAGE_MAX,
  type FeedbackCategory,
  type FeedbackRecord,
  type FeedbackScreen,
} from "./feedbackModel";

type Props = {
  screen: FeedbackScreen;
  appVersion: string;
  userAgent: string | null | undefined;
  platform: string | null | undefined;
  submit: (record: FeedbackRecord) => Promise<FeedbackSubmitResult>;
  onClose: () => void;
  /** Nur für Tests: ob ein Mail-Rückfall möglich ist (Standard: Support-Adresse gesetzt). */
  mailFallbackAvailable?: boolean;
};

type Phase =
  | { kind: "edit" }
  | { kind: "sending" }
  | { kind: "sent" }
  | { kind: "mail"; href: string }
  | { kind: "error"; mailHref: string | null };

/**
 * „Feedback geben": ein Textfeld, optional Fehler · Idee · Lob. App-Version, Bildschirm, Gerät/OS und Datum
 * hängt die App an; sonst nichts (keine Plan- oder Gesundheitsdaten). Fehlt die Tabelle, geht es per Mail.
 */
export function FeedbackSheet({
  screen,
  appVersion,
  userAgent,
  platform,
  submit,
  onClose,
  mailFallbackAvailable = SUPPORT_EMAIL_CONFIGURED,
}: Props) {
  const [message, setMessage] = useState("");
  const [category, setCategory] = useState<FeedbackCategory | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "edit" });

  const record = buildFeedbackRecord({ message, category, appVersion, screen, userAgent, platform });
  const sending = phase.kind === "sending";

  const send = async () => {
    if (!record || sending) return;
    setPhase({ kind: "sending" });
    let result: FeedbackSubmitResult;
    try {
      result = await submit(record);
    } catch {
      result = { status: "error" };
    }
    const mailHref = mailFallbackAvailable ? buildFeedbackFallbackMailto(record, getAppTodayYmd()) : null;
    if (result.status === "saved") {
      trackUsageEvent("feedback_sent");
      setPhase({ kind: "sent" });
    } else if (result.status === "unavailable" && mailHref) {
      setPhase({ kind: "mail", href: mailHref });
    } else {
      setPhase({ kind: "error", mailHref });
    }
  };

  return (
    <div className="mr-sheet-scrim">
      <div className="mr-sheet" role="dialog" aria-modal="true" aria-labelledby="feedback-title">
        <div className="mr-sheet__grabber" aria-hidden>
          <span />
        </div>
        <div className="mr-sheet__body mr-sheet__body--flush">
          <header className="mr-sheet__head">
            <div style={{ minWidth: 0 }}>
              <div className="mr-sheet__meta">Konto &amp; Hilfe</div>
              <h1 id="feedback-title" className="mr-sheet__title">
                Feedback geben
              </h1>
            </div>
            <button type="button" className="mr-icon-btn mr-icon-btn--raised" aria-label="Schließen" onClick={onClose}>
              <X aria-hidden size={18} strokeWidth={ICON_STROKE} />
            </button>
          </header>

          {phase.kind === "sent" ? (
            <>
              <p className="mr-sheet__text" role="status">
                Danke. Dein Feedback ist angekommen.
              </p>
              <button type="button" className="mr-btn mr-btn--primary" onClick={onClose}>
                Fertig
              </button>
            </>
          ) : phase.kind === "mail" ? (
            <>
              <p className="mr-sheet__text" role="status">
                Direkt senden geht gerade nicht. Schick es per Mail — der Text ist schon eingetragen.
              </p>
              <a className="mr-btn mr-btn--primary" style={{ textDecoration: "none" }} href={phase.href} onClick={() => trackUsageEvent("feedback_sent")}>
                Mail öffnen
              </a>
              <button type="button" className="mr-btn mr-btn--secondary" onClick={onClose}>
                Schließen
              </button>
            </>
          ) : (
            <>
              <p className="mr-sheet__text">
                Was fällt dir auf? Fehler, Ideen und Lob helfen gleichermaßen. App-Version, Bildschirm, Gerät und
                Datum hängen wir an — sonst nichts.
              </p>

              <div>
                <span className="mr-entry-label" id="feedback-category-label">
                  Art (optional)
                </span>
                <div className="mr-checkin__chips" role="group" aria-labelledby="feedback-category-label">
                  {FEEDBACK_CATEGORIES.map((c) => {
                    const on = category === c.value;
                    return (
                      <button
                        type="button"
                        key={c.value}
                        className={on ? "mr-checkin__chip is-on" : "mr-checkin__chip"}
                        aria-pressed={on}
                        disabled={sending}
                        onClick={() => setCategory(on ? null : c.value)}
                      >
                        {c.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="mr-entry-label" htmlFor="feedback-message">
                  Deine Nachricht
                </label>
                <textarea
                  id="feedback-message"
                  className="mr-entry-notes"
                  rows={6}
                  maxLength={FEEDBACK_MESSAGE_MAX}
                  placeholder="Was ist dir aufgefallen?"
                  value={message}
                  disabled={sending}
                  onChange={(e) => setMessage(e.target.value)}
                />
              </div>

              {phase.kind === "error" ? (
                <p className="mr-sheet__text" role="alert" style={{ color: "var(--status-low)" }}>
                  Senden hat nicht geklappt. Prüf deine Verbindung und versuch es noch einmal.
                </p>
              ) : null}

              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: "auto" }}>
                <button
                  type="button"
                  className="mr-btn mr-btn--primary"
                  onClick={() => void send()}
                  disabled={!record || sending}
                >
                  {sending ? "Sende …" : "Senden"}
                </button>
                {phase.kind === "error" && phase.mailHref ? (
                  <a className="mr-btn mr-btn--secondary" style={{ textDecoration: "none" }} href={phase.mailHref} onClick={() => trackUsageEvent("feedback_sent")}>
                    Per Mail senden
                  </a>
                ) : null}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
