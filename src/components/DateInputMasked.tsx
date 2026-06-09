import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from "react";
import { parseOnboardingRaceDate, startOfLocalDay } from "../onboarding/marathonPreferencesOnboarding";
import { getAppNow } from "../core/time/timeSystem";

const MAX_DIGITS = 8;

const inputStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "12px 14px",
  fontSize: 16,
  borderRadius: 12,
  border: "1px solid rgba(148, 163, 184, 0.2)",
  background: "#070b16",
  color: "#e2e8f0",
  outline: "none",
  fontVariantNumeric: "tabular-nums",
  letterSpacing: "0.02em",
};

const labelStyle: CSSProperties = {
  display: "block",
  fontSize: 12,
  fontWeight: 600,
  color: "#cbd5e1",
  marginBottom: 6,
};

const errorStyle: CSSProperties = {
  margin: "6px 0 0",
  fontSize: 12,
  color: "#f87171",
  lineHeight: 1.4,
};

export function digitsFromMaskedValue(value: string): string {
  return value.replace(/\D/g, "").slice(0, MAX_DIGITS);
}

/** Formats up to 8 digits as TT.MM.JJJJ with auto-dots after day and month blocks. */
export function formatMaskedDateFromDigits(digits: string): string {
  const d = digits.slice(0, MAX_DIGITS);
  if (!d) return "";

  const dd = d.slice(0, 2);
  const mm = d.slice(2, 4);
  const yyyy = d.slice(4, 8);

  if (d.length <= 2) return d.length === 2 ? `${dd}.` : dd;
  if (d.length <= 4) return d.length === 4 ? `${dd}.${mm}.` : `${dd}.${mm}`;
  return `${dd}.${mm}.${yyyy}`;
}

export function isCompleteMaskedDate(value: string): boolean {
  return digitsFromMaskedValue(value).length === MAX_DIGITS;
}

export function parseDateInputMasked(input: string): Date | null {
  return parseOnboardingRaceDate(input);
}

export type ValidateMaskedDateOptions = {
  minDate?: Date;
  optional?: boolean;
  /** When true, parsed date must be strictly after minDate (same day rejected). */
  strictAfterMin?: boolean;
};

export function validateMaskedDateInput(
  value: string,
  opts?: ValidateMaskedDateOptions,
): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return opts?.optional ? null : "Bitte Datum eingeben.";
  }
  if (!isCompleteMaskedDate(trimmed)) {
    return "Bitte vollständiges Datum eingeben (TT.MM.JJJJ).";
  }
  const parsed = parseOnboardingRaceDate(trimmed);
  if (!parsed) return "Ungültiges Datum.";

  const today = startOfLocalDay(getAppNow());
  const min = startOfLocalDay(opts?.minDate ?? today);

  if (opts?.strictAfterMin) {
    if (parsed.getTime() <= min.getTime()) {
      return "Datum muss nach dem früheren Datum liegen.";
    }
    return null;
  }

  if (parsed.getTime() < min.getTime()) {
    return min.getTime() === today.getTime()
      ? "Datum darf nicht in der Vergangenheit liegen."
      : "Datum liegt vor dem frühesten erlaubten Tag.";
  }
  return null;
}

export type DateInputMaskedProps = {
  id?: string;
  value: string;
  onChange: (val: string) => void;
  minDate?: Date;
  strictAfterMin?: boolean;
  optional?: boolean;
  placeholder?: string;
  label?: string;
  error?: string;
  disabled?: boolean;
  style?: CSSProperties;
};

export default function DateInputMasked({
  id,
  value,
  onChange,
  minDate,
  strictAfterMin = false,
  optional = false,
  placeholder = "TT.MM.JJJJ",
  label,
  error,
  disabled = false,
  style,
}: DateInputMaskedProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const inputRef = useRef<HTMLInputElement>(null);
  const [internalError, setInternalError] = useState<string | null>(null);

  const digits = digitsFromMaskedValue(value);
  const displayValue = formatMaskedDateFromDigits(digits);
  const shownError = error || internalError || undefined;

  useEffect(() => {
    if (!value.trim()) setInternalError(null);
  }, [value]);

  const applyDigits = useCallback(
    (nextDigits: string) => {
      onChange(formatMaskedDateFromDigits(nextDigits.slice(0, MAX_DIGITS)));
    },
    [onChange],
  );

  const runBlurValidation = useCallback(() => {
    if (!digits.length) {
      setInternalError(null);
      return;
    }
    setInternalError(
      validateMaskedDateInput(value, { minDate, optional, strictAfterMin }),
    );
  }, [digits.length, minDate, optional, strictAfterMin, value]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (disabled) return;

      if (e.key === "Backspace") {
        e.preventDefault();
        applyDigits(digits.slice(0, -1));
        return;
      }

      if (e.key === "Delete") {
        e.preventDefault();
        applyDigits("");
        return;
      }

      if (e.key.length === 1 && /\d/.test(e.key)) {
        e.preventDefault();
        if (digits.length >= MAX_DIGITS) return;
        applyDigits(digits + e.key);
        return;
      }

      const allowed = new Set([
        "Tab",
        "Shift",
        "Control",
        "Alt",
        "Meta",
        "ArrowLeft",
        "ArrowRight",
        "Home",
        "End",
        "Escape",
      ]);
      if (!allowed.has(e.key)) {
        e.preventDefault();
      }
    },
    [applyDigits, digits, disabled],
  );

  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLInputElement>) => {
      if (disabled) return;
      e.preventDefault();
      const pasted = e.clipboardData.getData("text").replace(/\D/g, "");
      if (!pasted) return;
      const room = MAX_DIGITS - digits.length;
      applyDigits(digits + pasted.slice(0, room));
    },
    [applyDigits, digits, disabled],
  );

  return (
    <div style={{ marginBottom: 20 }}>
      {label ? (
        <label htmlFor={inputId} style={labelStyle}>
          {label}
        </label>
      ) : null}
      <input
        ref={inputRef}
        id={inputId}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        spellCheck={false}
        value={displayValue}
        onClick={() => inputRef.current?.focus()}
        onChange={(e) => {
          const newDigits = e.target.value.replace(/\D/g, "");
          if (newDigits.length > digits.length) {
            const added = newDigits.slice(digits.length);
            applyDigits((digits + added).slice(0, MAX_DIGITS));
          } else if (newDigits.length < digits.length) {
            applyDigits(digits.slice(0, -1));
          }
        }}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        onBlur={runBlurValidation}
        onFocus={() => setInternalError(null)}
        placeholder={placeholder}
        disabled={disabled}
        aria-invalid={shownError ? true : undefined}
        style={{
          ...inputStyle,
          ...style,
          border: shownError
            ? "1px solid rgba(248, 113, 113, 0.65)"
            : inputStyle.border,
          cursor: disabled ? "not-allowed" : "text",
          opacity: disabled ? 0.6 : 1,
        }}
      />
      {shownError ? <p style={errorStyle}>{shownError}</p> : null}
    </div>
  );
}
