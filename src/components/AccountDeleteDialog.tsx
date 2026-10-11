import { useState, type CSSProperties } from "react";

/** Dieses Wort muss eingetippt werden, bevor „Konto löschen" aktiv wird. */
export const ACCOUNT_DELETE_CONFIRM_WORD = "LÖSCHEN";

export function isAccountDeleteConfirmed(input: string): boolean {
  return input.trim().toLocaleUpperCase("de-DE") === ACCOUNT_DELETE_CONFIRM_WORD;
}

type Props = {
  busy?: boolean;
  /** Meldung nach einem fehlgeschlagenen Versuch; der Bestätigen-Button heißt dann „Erneut versuchen". */
  error?: string | null;
  onCancel: () => void;
  onConfirmDelete: () => void;
};

const overlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 11000,
  background: "rgba(2, 6, 23, 0.78)",
  backdropFilter: "blur(6px)",
  display: "flex",
  // Oben statt mittig: das Eingabefeld bleibt über der iOS-Tastatur sichtbar.
  alignItems: "flex-start",
  justifyContent: "center",
  padding: "max(72px, calc(env(safe-area-inset-top, 0px) + 48px)) 16px 24px",
  overflowY: "auto",
  boxSizing: "border-box",
};

const cardStyle: CSSProperties = {
  width: "100%",
  maxWidth: 360,
  borderRadius: 16,
  border: "1px solid rgba(148, 163, 184, 0.18)",
  background: "rgba(15, 23, 42, 0.95)",
  boxShadow: "0 24px 48px rgba(0, 0, 0, 0.4)",
  padding: "24px 20px 20px",
  boxSizing: "border-box",
};

function actionButtonStyle(variant: "secondary" | "destructive", disabled: boolean): CSSProperties {
  const base: CSSProperties = {
    flex: 1,
    padding: "12px 14px",
    fontSize: 14,
    fontWeight: 700,
    borderRadius: 12,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.6 : 1,
  };
  if (variant === "destructive") {
    return {
      ...base,
      border: "none",
      color: "#fff",
      background: "linear-gradient(135deg, #dc2626, #b91c1c)",
    };
  }
  return {
    ...base,
    border: "1px solid rgba(148, 163, 184, 0.25)",
    background: "#0b1220",
    color: "#cbd5e1",
  };
}

export function AccountDeleteDialog({ busy = false, error = null, onCancel, onConfirmDelete }: Props) {
  const [typed, setTyped] = useState("");
  const confirmed = isAccountDeleteConfirmed(typed);
  const confirmDisabled = busy || !confirmed;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="account-delete-title"
      style={overlayStyle}
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel();
      }}
    >
      <form
        style={cardStyle}
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          if (!confirmDisabled) onConfirmDelete();
        }}
      >
        <h2
          id="account-delete-title"
          style={{
            margin: "0 0 10px",
            fontSize: 18,
            fontWeight: 800,
            color: "#f1f5f9",
            letterSpacing: "-0.02em",
          }}
        >
          Konto wirklich löschen?
        </h2>
        <p style={{ margin: "0 0 16px", fontSize: 14, color: "#94a3b8", lineHeight: 1.5 }}>
          Dein Konto und alle deine Daten werden unwiderruflich gelöscht. Das lässt sich nicht rückgängig machen.
        </p>

        <label htmlFor="account-delete-confirm" style={{ display: "block", margin: "0 0 8px", fontSize: 13, color: "#cbd5e1" }}>
          Tippe zur Bestätigung {ACCOUNT_DELETE_CONFIRM_WORD} ein.
        </label>
        <input
          id="account-delete-confirm"
          type="text"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          disabled={busy}
          placeholder={ACCOUNT_DELETE_CONFIRM_WORD}
          autoCapitalize="characters"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          style={{
            width: "100%",
            boxSizing: "border-box",
            margin: "0 0 16px",
            padding: "11px 12px",
            fontSize: 16,
            borderRadius: 12,
            border: "1px solid rgba(148, 163, 184, 0.25)",
            background: "#0b1220",
            color: "#f1f5f9",
            letterSpacing: "0.04em",
          }}
        />

        {error ? (
          <div
            role="alert"
            style={{
              marginBottom: 16,
              padding: "10px 12px",
              borderRadius: 10,
              fontSize: 13,
              color: "#fecaca",
              background: "rgba(239, 68, 68, 0.12)",
              border: "1px solid rgba(239, 68, 68, 0.28)",
            }}
          >
            {error}
          </div>
        ) : null}

        <div style={{ display: "flex", gap: 10 }}>
          <button type="button" disabled={busy} onClick={onCancel} style={actionButtonStyle("secondary", busy)}>
            Abbrechen
          </button>
          <button type="submit" disabled={confirmDisabled} style={actionButtonStyle("destructive", confirmDisabled)}>
            {busy ? "Wird gelöscht…" : error ? "Erneut versuchen" : "Konto löschen"}
          </button>
        </div>
      </form>
    </div>
  );
}
