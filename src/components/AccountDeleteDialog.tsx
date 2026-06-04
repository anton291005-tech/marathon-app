import type { CSSProperties } from "react";

export type AccountDeleteDialogStep = 1 | 2;

type Props = {
  step: AccountDeleteDialogStep;
  busy?: boolean;
  error?: string | null;
  onCancel: () => void;
  onContinue: () => void;
  onConfirmDelete: () => void;
};

const overlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 11000,
  background: "rgba(2, 6, 23, 0.78)",
  backdropFilter: "blur(6px)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "24px 16px",
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

export function AccountDeleteDialog({
  step,
  busy = false,
  error = null,
  onCancel,
  onContinue,
  onConfirmDelete,
}: Props) {
  const isStep1 = step === 1;
  const title = isStep1 ? "Account wirklich löschen?" : "Bist du sicher?";
  const message = isStep1
    ? "Alle deine Daten werden unwiderruflich gelöscht."
    : "Diese Aktion kann nicht rückgängig gemacht werden.";

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
      <div style={cardStyle} onClick={(e) => e.stopPropagation()}>
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
          {title}
        </h2>
        <p style={{ margin: "0 0 20px", fontSize: 14, color: "#94a3b8", lineHeight: 1.5 }}>{message}</p>

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
          {isStep1 ? (
            <button type="button" disabled={busy} onClick={onContinue} style={actionButtonStyle("destructive", busy)}>
              Weiter
            </button>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={onConfirmDelete}
              style={actionButtonStyle("destructive", busy)}
            >
              {busy ? "Wird gelöscht…" : "Account endgültig löschen"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
