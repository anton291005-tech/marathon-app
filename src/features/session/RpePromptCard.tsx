import { RPE_ANCHORS, rpeAnchorLabel } from "./sessionDetailModel";

type Props = {
  /** Titel der Einheit, z. B. „Lockerer Lauf“. */
  title: string;
  /** „heute“ oder „gestern“. */
  when: string;
  onRate: (rpe: number) => void;
  onDismiss: () => void;
};

const RPE_VALUES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

/** Home-Karte: fragt einmal nach der Anstrengung einer ohne Wert abgehakten Einheit (Readiness Spec §6.2). */
export function RpePromptCard({ title, when, onRate, onDismiss }: Props) {
  return (
    <section className="mr-card mr-rpe-prompt" data-testid="rpe-prompt" aria-label="Anstrengung nachtragen">
      <fieldset className="mr-feeling mr-rpe">
        <legend className="mr-entry-label">
          Wie anstrengend war {when} „{title}“?
        </legend>
        <button type="button" className="mr-rpe__later" onClick={onDismiss}>
          Später
        </button>
        <div className="mr-rpe__grid">
          {RPE_VALUES.map((n) => (
            <button
              type="button"
              key={n}
              className="mr-feeling__btn mr-rpe__btn"
              aria-label={`Anstrengung ${n} von 10${RPE_ANCHORS[n] ? `, ${RPE_ANCHORS[n]}` : ""}`}
              title={rpeAnchorLabel(n)}
              onClick={() => onRate(n)}
            >
              {n}
            </button>
          ))}
        </div>
        <div className="mr-feeling__scale">
          <span>0 gar nicht</span>
          <span>5 anstrengend</span>
          <span>10 maximal</span>
        </div>
      </fieldset>
    </section>
  );
}
