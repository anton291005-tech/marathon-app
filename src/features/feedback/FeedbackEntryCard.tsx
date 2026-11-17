type Props = { onOpen: () => void; onDismiss: () => void };

/** Dezenter Eintrag auf „Heute" in den ersten 14 Tagen nach der Registrierung (`isFeedbackEntryVisible`). */
export function FeedbackEntryCard({ onOpen, onDismiss }: Props) {
  return (
    <section className="mr-card mr-checkin-card" data-testid="feedback-entry" aria-label="Feedback">
      <div className="mr-checkin-card__text">
        <div className="mr-checkin-card__title">Wie läuft es mit MyRace?</div>
        <div className="mr-checkin-card__sub">Fehler, Ideen, Lob — ein Satz reicht.</div>
      </div>
      <div className="mr-checkin-card__actions">
        <button type="button" className="mr-btn mr-btn--secondary mr-btn--small" onClick={onOpen}>
          Feedback geben
        </button>
        <button type="button" className="mr-checkin__link" onClick={onDismiss}>
          Ausblenden
        </button>
      </div>
    </section>
  );
}
