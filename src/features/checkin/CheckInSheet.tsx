import { useState } from "react";
import { X } from "lucide-react";
import {
  CHECKIN_QUESTIONS,
  ILLNESS_SYMPTOMS,
  PAIN_AREAS,
  type CheckInEntry,
  type CheckInIllness,
  type CheckInPain,
  type IllnessSymptom,
  emptyCheckIn,
  isCheckInComplete,
} from "./checkInState";
import { HEALTH_CONSENT_TEXT } from "./healthConsent";

type Props = {
  day: string;
  /** Bereits gespeicherter Check-in von heute (zum Ergänzen der Chips), sonst `null`. */
  initial: CheckInEntry | null;
  /** „Zwickt es noch?“: Schmerz von gestern, vorausgewählt. */
  carriedPain: CheckInPain | null;
  /** Krankheits-Chip von gestern, vorausgewählt (Spec §6.1). */
  carriedIllness?: CheckInIllness | null;
  needsConsent: boolean;
  onGrantConsent: () => Promise<boolean>;
  onSave: (entry: CheckInEntry) => void;
  onClose: () => void;
};

const SEVERITIES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

/**
 * Morgen-Check-in (Readiness Spec §6.1): vier Fragen, je ein Tipp; nach der vierten Antwort ist gespeichert.
 * Danach optional die Chips „Etwas zwickt“ / „Fühle mich krank“. In diesem Schritt ohne Wirkung auf den Plan.
 */
export function CheckInSheet({
  day,
  initial,
  carriedPain,
  carriedIllness = null,
  needsConsent,
  onGrantConsent,
  onSave,
  onClose,
}: Props) {
  const startComplete = isCheckInComplete(initial);
  const [consentNeeded, setConsentNeeded] = useState(needsConsent);
  const [consentFailed, setConsentFailed] = useState(false);
  const [entry, setEntry] = useState<CheckInEntry>(() => ({
    ...(initial ?? emptyCheckIn(day)),
    // Gestern nur übernehmen, solange es heute keinen Eintrag gibt — sonst käme ein heute abgewählter Chip zurück.
    pain: initial ? initial.pain : carriedPain,
    illness: initial ? initial.illness : carriedIllness,
  }));
  const [step, setStep] = useState(startComplete ? CHECKIN_QUESTIONS.length : 0);
  const [painOpen, setPainOpen] = useState(!!(initial ? initial.pain : carriedPain));
  const [illnessOpen, setIllnessOpen] = useState(!!(initial ? initial.illness : carriedIllness));
  const done = step >= CHECKIN_QUESTIONS.length;

  const update = (patch: Partial<CheckInEntry>) => {
    const next = { ...entry, ...patch };
    setEntry(next);
    if (done) onSave(next);
  };

  const answer = (value: number) => {
    const q = CHECKIN_QUESTIONS[step];
    const next = { ...entry, [q.key]: value } as CheckInEntry;
    setEntry(next);
    if (step === CHECKIN_QUESTIONS.length - 1) onSave(next);
    setStep(step + 1);
  };

  const setPain = (patch: Partial<CheckInPain> | null) => {
    if (patch === null) return update({ pain: null });
    // Stelle zuerst: Stärke und Gangbild erst, wenn eine Stelle gewählt ist (kein stilles „anderes“).
    if (!entry.pain && !patch.area) return;
    const base: CheckInPain = entry.pain ?? { area: patch.area as CheckInPain["area"], severity: 0, alteredGait: false };
    update({ pain: { ...base, ...patch } });
  };

  const toggleSymptom = (symptom: IllnessSymptom) => {
    const current = entry.illness?.symptoms ?? [];
    const symptoms = current.includes(symptom) ? current.filter((s) => s !== symptom) : [...current, symptom];
    update({
      illness: symptoms.length
        ? { symptoms, ...(symptoms.includes("chest") ? { redFlag: entry.illness?.redFlag } : {}) }
        : null,
    });
  };

  if (consentNeeded) {
    return (
      <div className="mr-sheet-scrim">
        <div className="mr-sheet" role="dialog" aria-modal="true" aria-labelledby="checkin-consent-title">
          <div className="mr-sheet__grabber" aria-hidden><span /></div>
          <div className="mr-sheet__body mr-sheet__body--flush">
            <header className="mr-sheet__head">
              <div style={{ minWidth: 0 }}>
                <div className="mr-sheet__meta">Check-in</div>
                <h1 id="checkin-consent-title" className="mr-sheet__title">Deine Angaben speichern?</h1>
              </div>
            </header>
            <p className="mr-sheet__text">{HEALTH_CONSENT_TEXT}</p>
            <p className="mr-sheet__text">Du kannst den Check-in jederzeit auslassen. Ohne Zustimmung speichert MyRace nichts davon.</p>
            {consentFailed ? (
              <p className="mr-sheet__text" role="alert">Speichern hat nicht geklappt. Prüf deine Verbindung und versuch es noch einmal.</p>
            ) : null}
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <button
                type="button"
                className="mr-btn mr-btn--primary"
                onClick={async () => {
                  setConsentFailed(false);
                  if (await onGrantConsent()) setConsentNeeded(false);
                  else setConsentFailed(true);
                }}
              >
                Zustimmen und starten
              </button>
              <button type="button" className="mr-btn mr-btn--secondary" onClick={onClose}>
                Nicht jetzt
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mr-sheet-scrim">
      <div className="mr-sheet" role="dialog" aria-modal="true" aria-label="Check-in">
        <div className="mr-sheet__grabber" aria-hidden><span /></div>
        <div className="mr-sheet__body mr-sheet__body--flush">
          <header className="mr-sheet__head">
            <div style={{ minWidth: 0 }}>
              <div className="mr-sheet__meta">{done ? "Check-in gespeichert" : `Check-in · ${step + 1} von ${CHECKIN_QUESTIONS.length}`}</div>
              <h1 className="mr-sheet__title">{done ? "Danke!" : CHECKIN_QUESTIONS[step].text}</h1>
            </div>
            <button type="button" className="mr-icon-btn mr-icon-btn--raised" aria-label="Schließen" onClick={onClose}>
              <X aria-hidden size={18} strokeWidth={2} />
            </button>
          </header>

          {!done ? (
            <>
              <div className="mr-checkin__options" role="group" aria-label={CHECKIN_QUESTIONS[step].text}>
                {CHECKIN_QUESTIONS[step].labels.map((label, i) => {
                  const value = i + 1;
                  const selected = entry[CHECKIN_QUESTIONS[step].key] === value;
                  return (
                    <button
                      type="button"
                      key={label}
                      className={selected ? "mr-checkin__option is-on" : "mr-checkin__option"}
                      aria-pressed={selected}
                      onClick={() => answer(value)}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
              {step > 0 ? (
                <button type="button" className="mr-checkin__link" onClick={() => setStep(step - 1)}>
                  Zurück
                </button>
              ) : null}
            </>
          ) : (
            <>
              <p className="mr-sheet__text">Noch etwas, das du heute wissen lassen willst? Alles hier ist freiwillig.</p>
              <button type="button" className="mr-checkin__link" onClick={() => setStep(0)}>
                Antworten ändern
              </button>


              <div className="mr-checkin__chips">
                <button
                  type="button"
                  className={painOpen ? "mr-checkin__chip is-on" : "mr-checkin__chip"}
                  aria-pressed={painOpen}
                  onClick={() => {
                    if (painOpen) setPain(null);
                    setPainOpen(!painOpen);
                  }}
                >
                  {carriedPain && !initial ? "Zwickt es noch?" : "Etwas zwickt"}
                </button>
                <button
                  type="button"
                  className={illnessOpen ? "mr-checkin__chip is-on" : "mr-checkin__chip"}
                  aria-pressed={illnessOpen}
                  onClick={() => {
                    if (illnessOpen) update({ illness: null });
                    setIllnessOpen(!illnessOpen);
                  }}
                >
                  Fühle mich krank
                </button>
              </div>

              {painOpen ? (
                <section aria-label="Schmerz" className="mr-checkin__follow">
                  <div className="mr-entry-label">Wo?</div>
                  <div className="mr-checkin__chips">
                    {PAIN_AREAS.map((a) => (
                      <button
                        type="button"
                        key={a.value}
                        className={entry.pain?.area === a.value ? "mr-checkin__chip is-on" : "mr-checkin__chip"}
                        aria-pressed={entry.pain?.area === a.value}
                        onClick={() => setPain({ area: a.value })}
                      >
                        {a.label}
                      </button>
                    ))}
                  </div>
                  <div className="mr-entry-label">Wie stark beim Gehen oder Laufen?</div>
                  <div className="mr-checkin__grid">
                    {SEVERITIES.map((n) => (
                      <button
                        type="button"
                        key={n}
                        className={entry.pain?.severity === n ? "mr-feeling__btn mr-checkin__num is-on" : "mr-feeling__btn mr-checkin__num"}
                        aria-label={`Schmerz ${n} von 10`}
                        aria-pressed={entry.pain?.severity === n}
                        disabled={!entry.pain}
                        onClick={() => setPain({ severity: n })}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                  <div className="mr-entry-label">Läufst du deshalb anders als sonst?</div>
                  <div className="mr-checkin__chips">
                    {[true, false].map((v) => (
                      <button
                        type="button"
                        key={String(v)}
                        className={entry.pain?.alteredGait === v ? "mr-checkin__chip is-on" : "mr-checkin__chip"}
                        aria-pressed={entry.pain?.alteredGait === v}
                        disabled={!entry.pain}
                        onClick={() => setPain({ alteredGait: v })}
                      >
                        {v ? "Ja" : "Nein"}
                      </button>
                    ))}
                  </div>
                </section>
              ) : null}

              {illnessOpen ? (
                <section aria-label="Krankheit" className="mr-checkin__follow">
                  <div className="mr-entry-label">Was trifft zu?</div>
                  <div className="mr-checkin__chips">
                    {ILLNESS_SYMPTOMS.map((s) => {
                      const on = !!entry.illness?.symptoms.includes(s.value);
                      return (
                        <button
                          type="button"
                          key={s.value}
                          className={on ? "mr-checkin__chip is-on" : "mr-checkin__chip"}
                          aria-pressed={on}
                          onClick={() => toggleSymptom(s.value)}
                        >
                          {s.label}
                        </button>
                      );
                    })}
                  </div>
                  {entry.illness?.symptoms.includes("chest") ? (
                    <>
                      <div className="mr-entry-label">Hast du Brustschmerz, Atemnot oder Herzrasen?</div>
                      <div className="mr-checkin__chips">
                        {[true, false].map((v) => (
                          <button
                            type="button"
                            key={String(v)}
                            className={entry.illness?.redFlag === v ? "mr-checkin__chip is-on" : "mr-checkin__chip"}
                            aria-pressed={entry.illness?.redFlag === v}
                            onClick={() => update({ illness: { ...(entry.illness as NonNullable<CheckInEntry["illness"]>), redFlag: v } })}
                          >
                            {v ? "Ja" : "Nein"}
                          </button>
                        ))}
                      </div>
                      {entry.illness?.redFlag ? (
                        <p className="mr-sheet__text" role="alert">
                          Bitte trainiere nicht und lass das ärztlich abklären. Bei starken oder plötzlichen Beschwerden: Notruf 112.
                        </p>
                      ) : null}
                    </>
                  ) : null}
                </section>
              ) : null}

              <button type="button" className="mr-btn mr-btn--primary mr-btn--block" onClick={onClose}>
                Fertig
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
