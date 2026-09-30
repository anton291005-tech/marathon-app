import { useRef, useState, type ChangeEvent, type CSSProperties, type RefObject } from "react";
import {
  parseFinishTimeParts,
  sanitizeTimeDigits,
  splitFinishSeconds,
  type FinishTimeParts,
} from "../../prepRecap/finishTimeInput";
import type { FinishTimePatch, FinishTimeSource } from "../../prepRecap/prepRecapRecord";
import { formatFinishTime } from "../../prepRecap/raceResultPresentation";
import { FINISH_INPUT_BACKGROUND } from "./recapTheme";
import {
  heroFontSize,
  recapCloseButtonStyle,
  recapEyebrowStyle,
  recapOverlayStyle,
  recapPrimaryButtonStyle,
  recapSecondaryButtonStyle,
  recapTextButtonStyle,
} from "./recapStyles";

export type FinishTimeCurrent = {
  seconds: number;
  source: FinishTimeSource | null;
  confirmed: boolean;
};

type Props = {
  raceName: string | null;
  /** Gespeicherte Zeit (bestätigt oder Health-Vorschlag); null = noch keine. */
  current: FinishTimeCurrent | null;
  /** „Überspringen" vor der Story (bestätigt nichts), „Abbrechen" beim späteren Bearbeiten. */
  dismissLabel: "Überspringen" | "Abbrechen";
  /** true → direkt die Eingabe statt „stimmt das?" (Bearbeiten einer bestätigten Zeit). */
  startInEdit?: boolean;
  onSubmit: (patch: FinishTimePatch) => Promise<void> | void;
  onDismiss: () => void;
};

const EMPTY_PARTS: FinishTimeParts = { hours: "", minutes: "", seconds: "" };

const fieldStyle: CSSProperties = {
  width: "100%",
  minWidth: 0,
  height: 76,
  boxSizing: "border-box",
  borderRadius: 18,
  border: "1px solid rgba(248,250,252,0.22)",
  background: "rgba(7,9,18,0.55)",
  color: "#f8fafc",
  fontSize: "40px",
  fontWeight: 800,
  textAlign: "center",
  fontVariantNumeric: "tabular-nums",
  letterSpacing: "-0.02em",
  outline: "none",
  caretColor: "#fde68a",
  fontFamily: "inherit",
  padding: 0,
};

const fieldLabelStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  color: "rgba(226,232,240,0.55)",
  marginTop: 8,
  textAlign: "center",
};

/**
 * Zielzeit-Bestätigung vor Slide 1 (solange `finish_time_confirmed = false`).
 * Mit Health-Vorschlag: ein Tap bestätigt. Ändern speichert eine manuelle Zeit.
 * Überspringen bestätigt NICHT — die Story zeigt die Zeit dann weiter „laut Apple Health".
 */
export default function FinishTimeInputStep({
  raceName,
  current,
  dismissLabel,
  startInEdit = false,
  onSubmit,
  onDismiss,
}: Props) {
  const suggestion = current && !current.confirmed ? current : null;
  const [editing, setEditing] = useState(() => startInEdit || suggestion == null);
  const [parts, setParts] = useState<FinishTimeParts>(() =>
    current && (startInEdit || current.confirmed) ? splitFinishSeconds(current.seconds) : EMPTY_PARTS,
  );
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [autoFocus, setAutoFocus] = useState(false);
  const minutesRef = useRef<HTMLInputElement>(null);
  const secondsRef = useRef<HTMLInputElement>(null);

  const parsed = parseFinishTimeParts(parts);

  const submit = async (patch: FinishTimePatch) => {
    if (saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      await onSubmit(patch);
    } catch {
      setSaveError("Speichern hat nicht geklappt. Bitte versuch es noch einmal.");
    } finally {
      setSaving(false);
    }
  };

  const confirmSuggestion = () => {
    if (!suggestion) return;
    void submit({ seconds: suggestion.seconds, source: suggestion.source ?? "health", confirmed: true });
  };

  const saveEdited = () => {
    if (!parsed.ok) return;
    // Unveränderte Zeit behält ihre Quelle; jede Änderung ist eine manuelle Angabe.
    const source: FinishTimeSource =
      current && current.seconds === parsed.seconds && current.source ? current.source : "manual";
    void submit({ seconds: parsed.seconds, source, confirmed: true });
  };

  const startEditing = () => {
    setParts(suggestion ? splitFinishSeconds(suggestion.seconds) : EMPTY_PARTS);
    setAutoFocus(true);
    setEditing(true);
  };

  const onField = (key: keyof FinishTimeParts, maxLength: number, next?: RefObject<HTMLInputElement | null>) => (
    e: ChangeEvent<HTMLInputElement>,
  ) => {
    const value = sanitizeTimeDigits(e.target.value, maxLength);
    setParts((p) => ({ ...p, [key]: value }));
    if (value.length === maxLength) next?.current?.focus();
  };

  const suggestionText = suggestion ? formatFinishTime(suggestion.seconds) : null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Zielzeit bestätigen"
      data-testid="finish-time-step"
      style={{ ...recapOverlayStyle, background: FINISH_INPUT_BACKGROUND }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          padding: "calc(env(safe-area-inset-top, 0px) + 10px) 14px 0",
        }}
      >
        <button type="button" aria-label="Schließen" onClick={onDismiss} style={recapCloseButtonStyle}>
          ✕
        </button>
      </div>

      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          padding: "8px 28px calc(env(safe-area-inset-bottom, 0px) + 20px)",
          boxSizing: "border-box",
          width: "100%",
          maxWidth: 520,
          margin: "0 auto",
        }}
      >
        <div style={{ ...recapEyebrowStyle, color: "#fde68a", marginTop: "min(8vh, 64px)" }}>
          {raceName ? `${raceName} · Deine Zeit` : "Deine Zeit"}
        </div>

        {!editing && suggestion && suggestionText ? (
          <>
            <div
              data-testid="finish-time-suggestion"
              style={{
                marginTop: 18,
                fontSize: heroFontSize(suggestionText, 104),
                fontWeight: 850,
                letterSpacing: "-0.05em",
                lineHeight: 0.95,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {suggestionText}
            </div>
            <p style={{ margin: "22px 0 0", fontSize: 22, fontWeight: 750, lineHeight: 1.25, letterSpacing: "-0.01em" }}>
              Laut Apple Health: {suggestionText} — stimmt das?
            </p>
            <p style={{ margin: "10px 0 0", fontSize: 15, lineHeight: 1.45, color: "rgba(226,232,240,0.68)" }}>
              Die Uhr misst von Start bis Stopp. Deine offizielle Chipzeit kann davon leicht abweichen.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 32 }}>
              <button type="button" onClick={confirmSuggestion} disabled={saving} style={recapPrimaryButtonStyle}>
                Stimmt
              </button>
              <button type="button" onClick={startEditing} disabled={saving} style={recapSecondaryButtonStyle}>
                Zeit ändern
              </button>
            </div>
            {saveError ? (
              <div role="alert" style={{ marginTop: 12, fontSize: 14, fontWeight: 650, color: "#fca5a5" }}>
                {saveError}
              </div>
            ) : null}
          </>
        ) : (
          <>
            <p style={{ margin: "18px 0 0", fontSize: 30, fontWeight: 800, lineHeight: 1.12, letterSpacing: "-0.025em" }}>
              {current ? "Deine offizielle Zeit" : "Wie lange warst du unterwegs?"}
            </p>
            <p style={{ margin: "10px 0 0", fontSize: 15, lineHeight: 1.45, color: "rgba(226,232,240,0.68)" }}>
              Am genauesten ist die Chipzeit aus der Ergebnisliste.
            </p>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(0,0.8fr) auto minmax(0,1fr) auto minmax(0,1fr)",
                alignItems: "start",
                gap: 8,
                marginTop: 28,
              }}
            >
              <label style={{ minWidth: 0 }}>
                <input
                  aria-label="Stunden"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  autoComplete="off"
                  placeholder="h"
                  autoFocus={autoFocus}
                  value={parts.hours}
                  onChange={onField("hours", 1, minutesRef)}
                  style={fieldStyle}
                />
                <div style={fieldLabelStyle}>Std</div>
              </label>
              <span style={{ fontSize: 34, fontWeight: 800, lineHeight: "76px", color: "rgba(248,250,252,0.5)" }}>:</span>
              <label style={{ minWidth: 0 }}>
                <input
                  ref={minutesRef}
                  aria-label="Minuten"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  autoComplete="off"
                  placeholder="mm"
                  value={parts.minutes}
                  onChange={onField("minutes", 2, secondsRef)}
                  style={fieldStyle}
                />
                <div style={fieldLabelStyle}>Min</div>
              </label>
              <span style={{ fontSize: 34, fontWeight: 800, lineHeight: "76px", color: "rgba(248,250,252,0.5)" }}>:</span>
              <label style={{ minWidth: 0 }}>
                <input
                  ref={secondsRef}
                  aria-label="Sekunden"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  autoComplete="off"
                  placeholder="ss"
                  value={parts.seconds}
                  onChange={onField("seconds", 2)}
                  style={fieldStyle}
                />
                <div style={fieldLabelStyle}>Sek</div>
              </label>
            </div>
            <div role="alert" style={{ minHeight: 22, marginTop: 12, fontSize: 14, fontWeight: 650, color: "#fca5a5" }}>
              {!parsed.ok && parsed.error ? parsed.error : saveError}
            </div>
            <div style={{ marginTop: 14 }}>
              <button
                type="button"
                onClick={saveEdited}
                disabled={!parsed.ok || saving}
                style={{ ...recapPrimaryButtonStyle, opacity: parsed.ok ? 1 : 0.4 }}
              >
                Speichern
              </button>
            </div>
          </>
        )}

        <div style={{ display: "flex", justifyContent: "center", marginTop: 10 }}>
          <button type="button" onClick={onDismiss} disabled={saving} style={recapTextButtonStyle}>
            {dismissLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
