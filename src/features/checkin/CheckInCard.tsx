type Props = { onStart: () => void; onSkip: () => void };

/** Home-Karte „Wie geht es dir heute?“ (Readiness Spec §6.1); verschwindet nach dem Check-in, um 14 Uhr oder nach „Heute nicht“. */
export function CheckInCard({ onStart, onSkip }: Props) {
  return (
    <section className="mr-card mr-checkin-card" data-testid="checkin-card" aria-label="Check-in">
      <div className="mr-checkin-card__text">
        <div className="mr-checkin-card__title">Wie geht es dir heute?</div>
        <div className="mr-checkin-card__sub">Vier kurze Fragen, unter 15 Sekunden.</div>
      </div>
      <div className="mr-checkin-card__actions">
        <button type="button" className="mr-btn mr-btn--primary" onClick={onStart}>
          Check-in
        </button>
        <button type="button" className="mr-checkin__link" onClick={onSkip}>
          Heute nicht
        </button>
      </div>
    </section>
  );
}
