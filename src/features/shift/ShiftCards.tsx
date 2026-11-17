import { useState, type CSSProperties } from "react";
import { BriefcaseBusiness, X } from "lucide-react";
import { ICON_SIZE_S, ICON_STROKE } from "../../ui/icons";
import { SHIFT_BENEFIT, SHIFT_QUESTION } from "../../shift/shiftText";
import { dismissShiftIntro, setWorksShifts } from "../../shift/shiftStore";
import { useShiftState } from "../../shift/useShiftMode";
import { SettingsGroup, SettingsRow } from "../settings/SettingsList";
import { ShiftPlanPage } from "./ShiftPlanPage";
import "./shift.css";

/**
 * Frage im Wizard nach den Lauftagen. Speichert die Antwort sofort (`profiles.works_shifts`, lokal als Rückfall).
 * „Dienstplan jetzt eintragen“ öffnet die Dienstplan-Seite über dem Wizard; danach geht es im Wizard weiter.
 */
export function ShiftWizardQuestion({
  todayYmd,
  chipStyle,
  labelStyle,
}: {
  todayYmd: string;
  /** Stil der Wizard-Chips (damit die Frage aussieht wie die übrigen Wizard-Fragen). */
  chipStyle?: (selected: boolean) => CSSProperties;
  labelStyle?: CSSProperties;
}) {
  const state = useShiftState();
  const [pageOpen, setPageOpen] = useState(false);
  const [later, setLater] = useState(false);
  const answer = state.worksShifts;
  const entryCount = Object.keys(state.entriesByDate).length;

  return (
    <div className="mr-shift-question" data-testid="shift-wizard-question">
      <div id="onboard-shift-label" style={{ ...labelStyle, marginBottom: 8 }}>
        {SHIFT_QUESTION}
      </div>
      <div role="group" aria-labelledby="onboard-shift-label" style={{ display: "flex", gap: 8 }}>
        {[
          { value: true, label: "Ja" },
          { value: false, label: "Nein" },
        ].map((option) => (
          <button
            key={option.label}
            type="button"
            aria-pressed={answer === option.value}
            onClick={() => {
              setLater(false);
              void setWorksShifts(option.value);
            }}
            style={chipStyle ? chipStyle(answer === option.value) : undefined}
            className={chipStyle ? undefined : `mr-shift-chip${answer === option.value ? " is-on" : ""}`}
          >
            {option.label}
          </button>
        ))}
      </div>
      {answer === true ? (
        <>
          <p className="mr-shift-question__benefit">{SHIFT_BENEFIT}</p>
          {entryCount > 0 ? (
            <p className="mr-shift-question__done">Dienstplan eingetragen ({entryCount} Tage). Du kannst ihn jederzeit in den Einstellungen ändern.</p>
          ) : later ? (
            <p className="mr-shift-question__done">Gut – du findest den Dienstplan später im Woche-Tab und in den Einstellungen.</p>
          ) : (
            <div className="mr-shift-question__actions">
              <button type="button" className="mr-btn mr-btn--primary mr-btn--small" onClick={() => setPageOpen(true)}>
                Dienstplan jetzt eintragen
              </button>
              <button type="button" className="mr-btn mr-btn--secondary mr-btn--small" onClick={() => setLater(true)}>
                Später
              </button>
            </div>
          )}
        </>
      ) : null}
      {pageOpen ? <ShiftPlanPage todayYmd={todayYmd} onClose={() => setPageOpen(false)} /> : null}
    </div>
  );
}

/** Einmalige, wegklickbare Karte auf „Heute“ für Bestandsnutzer ohne Antwort. */
export function ShiftIntroCard({ onYes }: { onYes: () => void }) {
  return (
    <section className="mr-card mr-shift-intro" data-testid="shift-intro-card" aria-label="Schicht-Modus">
      <div className="mr-shift-intro__title">{SHIFT_QUESTION}</div>
      <p className="mr-shift-intro__sub">{SHIFT_BENEFIT}</p>
      <div className="mr-shift-intro__actions">
        <button
          type="button"
          className="mr-btn mr-btn--primary mr-btn--small"
          onClick={() => {
            void setWorksShifts(true);
            onYes();
          }}
        >
          Ja, Dienstplan eintragen
        </button>
        <button type="button" className="mr-btn mr-btn--secondary mr-btn--small" onClick={() => void setWorksShifts(false)}>
          Nein
        </button>
      </div>
      <button type="button" className="mr-icon-btn mr-shift-intro__close" aria-label="Karte ausblenden" onClick={dismissShiftIntro}>
        <X aria-hidden size={18} strokeWidth={ICON_STROKE} />
      </button>
    </section>
  );
}

/** Genau ein Satz auf „Heute“ an Tagen mit Bezug zum Dienstplan; optional der Weg zum Vorschlag. */
export function ShiftTodayNote({ text, onShowProposal }: { text: string; onShowProposal?: () => void }) {
  return (
    <section className="mr-card mr-shift-note" data-testid="shift-today-note" aria-label="Dienstplan">
      <span className="mr-shift-note__icon">
        <BriefcaseBusiness aria-hidden size={ICON_SIZE_S + 2} strokeWidth={ICON_STROKE} />
      </span>
      <div className="mr-shift-note__body">
        <p className="mr-shift-note__text">{text}</p>
        {onShowProposal ? (
          <button type="button" className="mr-shift-note__link" onClick={onShowProposal}>
            Vorschlag ansehen
          </button>
        ) : null}
      </div>
    </section>
  );
}

/** Einstellungen → Training: Schalter „Ich arbeite in Schichten“ und Zeile „Dienstplan“. */
export function ShiftSettingsRows({ onOpenPlan }: { onOpenPlan: () => void }) {
  const state = useShiftState();
  const on = state.worksShifts === true;
  const count = Object.keys(state.entriesByDate).length;
  const rows = [
    <button key="switch" type="button" role="switch" aria-checked={on} className="mr-shift-switch-row" onClick={() => void setWorksShifts(!on)}>
      <span className="mr-shift-switch-row__label">Ich arbeite in Schichten</span>
      <span aria-hidden className={`mr-shift-switch${on ? " is-on" : ""}`} />
    </button>,
  ];
  if (on) rows.push(<SettingsRow key="plan" label="Dienstplan" value={count > 0 ? `${count} Tage` : "Noch leer"} onClick={onOpenPlan} />);
  return (
    <SettingsGroup
      title="Dienstplan"
      footer="Mit Dienstplan erkennt MyRace Tage nach Nacht- und Spätdiensten und schlägt passendere Tage vor. Deine Dienste gehen an kein KI-Modell."
    >
      {rows}
    </SettingsGroup>
  );
}
