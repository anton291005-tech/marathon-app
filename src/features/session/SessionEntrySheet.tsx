import { useState } from "react";
import { Heart, X } from "lucide-react";
import { ICON_STROKE } from "../../ui/icons";
import { formatKmDe } from "../../ui/formatDe";
import { kmInputToLogValue, normalizeFeeling, stepKmInput, type HealthRunSuggestion } from "./sessionDetailModel";

export type SessionEntryValues = {
  /** Wert fürs Log (`"10.4"`); `undefined`, wenn die Einheit kein Distanzfeld hat. */
  actualKm: string | undefined;
  /** 1–5; 0 = nicht angegeben (wie bisher im Log). */
  feeling: number;
  notes: string;
  /** Der vorgeschlagene Health-Lauf soll mit diesem Eintrag verknüpft werden. */
  adoptSuggestion: boolean;
};

type SessionEntrySheetProps = {
  mode: "create" | "edit";
  /** „Steady-State Lauf · Plan 10,0 km" */
  subtitle: string;
  /** Startwert des Distanzfelds; `null` = kein Distanzfeld (Einheit ohne Distanz oder Health-Lauf verknüpft). */
  initialKm: number | null;
  initialFeeling: number | null;
  initialNotes: string;
  /** Nur gesetzt, wenn ein erkannter, noch nicht zugeordneter Health-Lauf existiert. */
  suggestion: HealthRunSuggestion | null;
  onSave: (values: SessionEntryValues) => void;
  onClose: () => void;
  /** Bearbeiten: Eintrag zurücknehmen (Einheit wieder offen). Ohne Handler kein Button. */
  onReopen?: () => void;
};

/** Bottom-Sheet „Einheit eintragen" (docs/design-system/mockups/Einheit_Eintragen.dc.html). */
export function SessionEntrySheet({
  mode,
  subtitle,
  initialKm,
  initialFeeling,
  initialNotes,
  suggestion,
  onSave,
  onClose,
  onReopen,
}: SessionEntrySheetProps) {
  const [km, setKm] = useState(initialKm != null ? formatKmDe(initialKm) : "");
  const [feeling, setFeeling] = useState(normalizeFeeling(initialFeeling) ?? 0);
  const [notes, setNotes] = useState(initialNotes);
  const [adopted, setAdopted] = useState(false);
  const hasKmField = initialKm != null;
  const heading = mode === "edit" ? "Eintrag bearbeiten" : "Einheit eintragen";

  const adoptSuggestion = () => {
    setAdopted(true);
    if (suggestion?.km != null) setKm(formatKmDe(suggestion.km));
  };

  return (
    <div onClick={onClose} className="mr-entry-scrim">
      <section onClick={(e) => e.stopPropagation()} className="mr-entry-sheet" role="dialog" aria-modal="true" aria-label={heading}>
        <div className="mr-sheet__grabber" aria-hidden><span /></div>
        <div className="mr-entry-sheet__body">
          <header className="mr-sheet__head">
            <div style={{ minWidth: 0 }}>
              <h1 className="mr-entry-sheet__title">{heading}</h1>
              <div className="mr-entry-sheet__sub">{subtitle}</div>
            </div>
            <button type="button" className="mr-icon-btn mr-icon-btn--raised" aria-label="Schließen" onClick={onClose}>
              <X aria-hidden size={18} strokeWidth={2} />
            </button>
          </header>

          {suggestion ? (
            <div className="mr-entry-suggest" data-testid="entry-health-suggestion">
              <div className="mr-entry-suggest__icon"><Heart aria-hidden size={18} strokeWidth={ICON_STROKE} /></div>
              <div className="mr-entry-suggest__text">
                <div className="mr-entry-suggest__title">Lauf aus Apple Health</div>
                {suggestion.line ? <div className="mr-entry-suggest__sub">{suggestion.line}</div> : null}
              </div>
              <button type="button" className="mr-entry-suggest__btn" disabled={adopted} onClick={adoptSuggestion}>
                {adopted ? "Übernommen" : "Übernehmen"}
              </button>
            </div>
          ) : null}

          {hasKmField ? (
            <div>
              <label htmlFor="session-actual-km" className="mr-entry-label">Distanz</label>
              <div className="mr-km-stepper">
                <button type="button" className="mr-km-stepper__btn" aria-label="Weniger" disabled={adopted} onClick={() => setKm((v) => stepKmInput(v, -1))}>−</button>
                <div className="mr-km-stepper__field">
                  <input
                    id="session-actual-km"
                    inputMode="decimal"
                    autoComplete="off"
                    value={km}
                    readOnly={adopted}
                    onChange={(e) => setKm(e.target.value.replace(/[^0-9.,]/g, ""))}
                  />
                  <span>km</span>
                </div>
                <button type="button" className="mr-km-stepper__btn" aria-label="Mehr" disabled={adopted} onClick={() => setKm((v) => stepKmInput(v, 1))}>+</button>
              </div>
            </div>
          ) : null}

          <fieldset className="mr-feeling">
            <legend className="mr-entry-label">Wie hat es sich angefühlt?</legend>
            <div className="mr-feeling__grid">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  type="button"
                  key={n}
                  className={feeling === n ? "mr-feeling__btn is-on" : "mr-feeling__btn"}
                  aria-label={`Gefühl ${n} von 5`}
                  aria-pressed={feeling === n}
                  onClick={() => setFeeling((current) => (current === n ? 0 : n))}
                >
                  {n}
                </button>
              ))}
            </div>
            <div className="mr-feeling__scale"><span>Sehr schwer</span><span>Sehr leicht</span></div>
          </fieldset>

          <div>
            <label htmlFor="session-notes" className="mr-entry-label">Notiz <span style={{ fontWeight: 400 }}>(optional)</span></label>
            <textarea
              id="session-notes"
              className="mr-entry-notes"
              rows={2}
              placeholder="Wie lief es? Besonderheiten?"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>

        <div className="mr-entry-sheet__foot">
          <button
            type="button"
            className="mr-btn mr-btn--primary mr-btn--block"
            onClick={() => onSave({ actualKm: hasKmField ? kmInputToLogValue(km) : undefined, feeling, notes, adoptSuggestion: adopted })}
          >
            Speichern
          </button>
          {mode === "edit" && onReopen ? (
            <button type="button" className="mr-btn mr-btn--ghost mr-btn--block" onClick={onReopen}>
              Als offen markieren
            </button>
          ) : null}
        </div>
      </section>
    </div>
  );
}
