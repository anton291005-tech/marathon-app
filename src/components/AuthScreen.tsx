import { useCallback, useEffect, useState, type CSSProperties, type FormEvent } from "react";
import { useAuth } from "../contexts/AuthContext";
import { clearMarathonLocalStorage } from "../persistence/clearMarathonLocalStorage";

type AuthMode = "signin" | "signup" | "reset";

const RESEND_COOLDOWN_SEC = 60;

const linkButtonStyle: CSSProperties = {
  background: "none",
  border: "none",
  padding: 0,
  color: "#7dd3fc",
  fontWeight: 600,
  cursor: "pointer",
  textDecoration: "underline",
  fontSize: "inherit",
};

const inputStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "12px 14px",
  fontSize: 15,
  borderRadius: 12,
  border: "1px solid rgba(148, 163, 184, 0.2)",
  background: "#070b16",
  color: "#e2e8f0",
  outline: "none",
};

const primaryButtonStyle: CSSProperties = {
  width: "100%",
  padding: "14px 16px",
  fontSize: 15,
  fontWeight: 700,
  border: "none",
  borderRadius: 14,
  color: "#fff",
  background: "linear-gradient(135deg, #10b981, #3b82f6)",
  boxShadow: "0 8px 24px rgba(59, 130, 246, 0.25)",
};

function isEmailNotConfirmedError(message: string | undefined): boolean {
  if (!message) return false;
  return message.toLowerCase().includes("email not confirmed");
}

export function AuthScreen() {
  const {
    signIn,
    signUp,
    signOut,
    resetPassword,
    unconfirmedEmail,
    clearUnconfirmedEmail,
    resendSignupConfirmation,
    passwordRecoveryPending,
    updatePassword,
    completePasswordRecovery,
  } = useAuth();
  const [mode, setMode] = useState<AuthMode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [showEmailConfirmation, setShowEmailConfirmation] = useState(false);
  const [loginNeedsConfirmation, setLoginNeedsConfirmation] = useState(false);
  const [resendCooldownSec, setResendCooldownSec] = useState(0);
  const [resendStatus, setResendStatus] = useState<string | null>(null);
  const [resendSubmitting, setResendSubmitting] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordConfirm, setNewPasswordConfirm] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const showConfirmationPanel =
    showEmailConfirmation || !!unconfirmedEmail || loginNeedsConfirmation;
  const confirmationEmail = (unconfirmedEmail ?? email).trim();

  useEffect(() => {
    if (resendCooldownSec <= 0) return;
    const id = window.setInterval(() => {
      setResendCooldownSec((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => window.clearInterval(id);
  }, [resendCooldownSec]);

  const startResendCooldown = useCallback(() => {
    setResendCooldownSec(RESEND_COOLDOWN_SEC);
  }, []);

  const handleResendConfirmation = useCallback(async () => {
    const targetEmail = confirmationEmail;
    if (!targetEmail || resendCooldownSec > 0 || resendSubmitting) return;

    setResendSubmitting(true);
    setResendStatus(null);
    try {
      const { error: resendError } = await resendSignupConfirmation(targetEmail);
      if (resendError) {
        setResendStatus(resendError.message);
      } else {
        setResendStatus("Bestätigungs-Mail wurde erneut gesendet.");
        startResendCooldown();
      }
    } finally {
      setResendSubmitting(false);
    }
  }, [
    confirmationEmail,
    resendCooldownSec,
    resendSubmitting,
    resendSignupConfirmation,
    startResendCooldown,
  ]);

  const goToLogin = useCallback(() => {
    setShowEmailConfirmation(false);
    setLoginNeedsConfirmation(false);
    clearUnconfirmedEmail();
    setResendStatus(null);
    setError(null);
    setMode("signin");
  }, [clearUnconfirmedEmail]);

  const switchMode = useCallback(
    (next: AuthMode) => {
      setMode(next);
      setError(null);
      setConfirmPassword("");
      setResetSent(false);
      setLoginNeedsConfirmation(false);
      if (next !== "signin") {
        setShowEmailConfirmation(false);
      }
    },
    [],
  );

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      setError(null);
      setLoginNeedsConfirmation(false);

      const trimmedEmail = email.trim();

      if (mode === "reset") {
        if (!trimmedEmail) {
          setError("Bitte E-Mail ausfüllen.");
          return;
        }
        setSubmitting(true);
        try {
          const { error: authError } = await resetPassword(trimmedEmail);
          if (authError) {
            setError(authError.message);
          } else {
            setResetSent(true);
          }
        } finally {
          setSubmitting(false);
        }
        return;
      }

      if (!trimmedEmail || !password) {
        setError("Bitte E-Mail und Passwort ausfüllen.");
        return;
      }

      if (mode === "signup" && password !== confirmPassword) {
        setError("Die Passwörter stimmen nicht überein.");
        return;
      }

      setSubmitting(true);
      try {
        if (mode === "signin") {
          const { error: authError } = await signIn(trimmedEmail, password);
          if (authError) {
            if (isEmailNotConfirmedError(authError.message)) {
              setError("Bitte bestätige zuerst deine E-Mail-Adresse.");
              setLoginNeedsConfirmation(true);
            } else {
              setError(authError.message);
            }
          }
        } else {
          const { data, error: authError } = await signUp(trimmedEmail, password);
          if (authError) {
            setError(authError.message);
          } else if (data.user?.email_confirmed_at) {
            // Dev / auto-confirm: session handled by AuthContext
          } else {
            clearMarathonLocalStorage();
            await signOut();
            setShowEmailConfirmation(true);
            setResendStatus(null);
          }
        }
      } finally {
        setSubmitting(false);
      }
    },
    [mode, email, password, confirmPassword, signIn, signUp, signOut, resetPassword],
  );

  const isSignUp = mode === "signup";
  const isReset = mode === "reset";
  const primaryLabel = isReset ? "Reset-Link senden" : isSignUp ? "Registrieren" : "Anmelden";
  const subtitle = showConfirmationPanel
    ? "E-Mail bestätigen"
    : isReset
      ? "Passwort zurücksetzen"
      : isSignUp
        ? "Konto erstellen"
        : "Anmelden, um fortzufahren";

  if (passwordRecoveryPending) {
    const passwordsMatch = newPassword === newPasswordConfirm;
    const canSave = newPassword.length >= 8 && passwordsMatch && !isSaving;
    return (
      <div
        style={{
          minHeight: "100dvh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxSizing: "border-box",
          padding: "24px 16px calc(24px + env(safe-area-inset-bottom, 0px))",
          background: "#0a0a0a",
          color: "#e2e8f0",
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif",
          WebkitFontSmoothing: "antialiased",
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: 400,
            borderRadius: 16,
            border: "1px solid rgba(148, 163, 184, 0.18)",
            background: "rgba(15, 23, 42, 0.65)",
            boxShadow: "0 24px 48px rgba(0, 0, 0, 0.35)",
            padding: "28px 24px 24px",
            boxSizing: "border-box",
          }}
        >
          <h1
            style={{
              margin: "0 0 6px",
              fontSize: 26,
              fontWeight: 800,
              letterSpacing: "-0.02em",
              textAlign: "center",
              color: "#f1f5f9",
            }}
          >
            MyRace
          </h1>
          <p
            style={{
              margin: "0 0 22px",
              fontSize: 13,
              color: "#94a3b8",
              textAlign: "center",
              lineHeight: 1.45,
            }}
          >
            Neues Passwort setzen
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <input
              type="password"
              placeholder="Neues Passwort (mind. 8 Zeichen)"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              style={inputStyle}
            />
            <input
              type="password"
              placeholder="Passwort bestätigen"
              value={newPasswordConfirm}
              onChange={(e) => setNewPasswordConfirm(e.target.value)}
              style={inputStyle}
            />
            {!passwordsMatch && newPasswordConfirm.length > 0 && (
              <p style={{ margin: 0, fontSize: 13, color: "#ef4444" }}>
                Passwörter stimmen nicht überein.
              </p>
            )}
            <button
              disabled={!canSave}
              style={{
                ...primaryButtonStyle,
                cursor: canSave ? "pointer" : "not-allowed",
                opacity: canSave ? 1 : 0.5,
                marginTop: 4,
              }}
              onClick={async () => {
                setIsSaving(true);
                setPasswordError(null);
                const { error: updateError } = await updatePassword(newPassword);
                if (updateError) {
                  setPasswordError(updateError.message);
                } else {
                  completePasswordRecovery();
                }
                setIsSaving(false);
              }}
            >
              {isSaving ? "Speichern..." : "Passwort speichern"}
            </button>
            {passwordError && (
              <p style={{ margin: 0, fontSize: 13, color: "#ef4444" }}>{passwordError}</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: "100dvh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxSizing: "border-box",
        padding: "24px 16px calc(24px + env(safe-area-inset-bottom, 0px))",
        background: "#0a0a0a",
        color: "#e2e8f0",
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif",
        WebkitFontSmoothing: "antialiased",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 400,
          borderRadius: 16,
          border: "1px solid rgba(148, 163, 184, 0.18)",
          background: "rgba(15, 23, 42, 0.65)",
          boxShadow: "0 24px 48px rgba(0, 0, 0, 0.35)",
          padding: "28px 24px 24px",
          boxSizing: "border-box",
        }}
      >
        <h1
          style={{
            margin: "0 0 6px",
            fontSize: 26,
            fontWeight: 800,
            letterSpacing: "-0.02em",
            textAlign: "center",
            color: "#f1f5f9",
          }}
        >
          MyRace
        </h1>
        <p
          style={{
            margin: "0 0 22px",
            fontSize: 13,
            color: "#94a3b8",
            textAlign: "center",
            lineHeight: 1.45,
          }}
        >
          {subtitle}
        </p>

        {showConfirmationPanel ? (
          <>
            <div
              role="status"
              style={{
                marginBottom: 18,
                padding: "12px 14px",
                borderRadius: 10,
                fontSize: 14,
                lineHeight: 1.5,
                color: "#e2e8f0",
                background: "rgba(59, 130, 246, 0.1)",
                border: "1px solid rgba(59, 130, 246, 0.28)",
                textAlign: "center",
              }}
            >
              Wir haben dir eine Bestätigungs-Mail geschickt.
              <br />
              Bitte öffne die Mail und klicke auf den Link.
            </div>
            {confirmationEmail ? (
              <p
                style={{
                  margin: "0 0 16px",
                  fontSize: 12,
                  color: "#94a3b8",
                  textAlign: "center",
                  wordBreak: "break-word",
                }}
              >
                {confirmationEmail}
              </p>
            ) : null}
            {resendStatus ? (
              <div
                role="status"
                style={{
                  marginBottom: 14,
                  padding: "10px 12px",
                  borderRadius: 10,
                  fontSize: 13,
                  lineHeight: 1.4,
                  color: resendStatus.includes("erneut") ? "#bbf7d0" : "#fecaca",
                  background: resendStatus.includes("erneut")
                    ? "rgba(16, 185, 129, 0.12)"
                    : "rgba(239, 68, 68, 0.12)",
                  border: resendStatus.includes("erneut")
                    ? "1px solid rgba(16, 185, 129, 0.28)"
                    : "1px solid rgba(239, 68, 68, 0.28)",
                  textAlign: "center",
                }}
              >
                {resendStatus}
              </div>
            ) : null}
            <button
              type="button"
              disabled={resendSubmitting || resendCooldownSec > 0 || !confirmationEmail}
              onClick={() => void handleResendConfirmation()}
              style={{
                ...primaryButtonStyle,
                marginBottom: 14,
                cursor:
                  resendSubmitting || resendCooldownSec > 0 || !confirmationEmail
                    ? "not-allowed"
                    : "pointer",
                opacity: resendSubmitting || resendCooldownSec > 0 ? 0.75 : 1,
              }}
            >
              {resendSubmitting
                ? "Bitte warten…"
                : resendCooldownSec > 0
                  ? `Erneut senden (${resendCooldownSec}s)`
                  : "Bestätigungs-Mail erneut senden"}
            </button>
            <p style={{ margin: 0, textAlign: "center", fontSize: 13, color: "#94a3b8" }}>
              <button type="button" onClick={goToLogin} style={linkButtonStyle}>
                Zurück zum Login
              </button>
            </p>
          </>
        ) : isReset && resetSent ? (
          <>
            <div
              role="status"
              style={{
                marginBottom: 18,
                padding: "12px 14px",
                borderRadius: 10,
                fontSize: 14,
                lineHeight: 1.45,
                color: "#bbf7d0",
                background: "rgba(16, 185, 129, 0.12)",
                border: "1px solid rgba(16, 185, 129, 0.28)",
                textAlign: "center",
              }}
            >
              E-Mail gesendet. Prüfe deinen Posteingang.
            </div>
            <p style={{ margin: 0, textAlign: "center", fontSize: 13, color: "#94a3b8" }}>
              <button type="button" onClick={() => switchMode("signin")} style={linkButtonStyle}>
                Zurück zum Login
              </button>
            </p>
          </>
        ) : (
          <>
            <form onSubmit={handleSubmit} noValidate>
              <label
                htmlFor="auth-email"
                style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#cbd5e1", marginBottom: 6 }}
              >
                E-Mail
              </label>
              <input
                id="auth-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(ev) => setEmail(ev.target.value)}
                disabled={submitting}
                style={{ ...inputStyle, marginBottom: isReset ? 18 : 14 }}
              />

              {!isReset ? (
                <>
                  <label
                    htmlFor="auth-password"
                    style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#cbd5e1", marginBottom: 6 }}
                  >
                    Passwort
                  </label>
                  <input
                    id="auth-password"
                    type="password"
                    autoComplete={isSignUp ? "new-password" : "current-password"}
                    value={password}
                    onChange={(ev) => setPassword(ev.target.value)}
                    disabled={submitting}
                    style={{ ...inputStyle, marginBottom: isSignUp ? 14 : 18 }}
                  />

                  {isSignUp ? (
                    <>
                      <label
                        htmlFor="auth-confirm"
                        style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#cbd5e1", marginBottom: 6 }}
                      >
                        Passwort bestätigen
                      </label>
                      <input
                        id="auth-confirm"
                        type="password"
                        autoComplete="new-password"
                        value={confirmPassword}
                        onChange={(ev) => setConfirmPassword(ev.target.value)}
                        disabled={submitting}
                        style={{ ...inputStyle, marginBottom: 18 }}
                      />
                    </>
                  ) : null}
                </>
              ) : null}

              {error ? (
                <div
                  role="alert"
                  style={{
                    marginBottom: 14,
                    padding: "10px 12px",
                    borderRadius: 10,
                    fontSize: 13,
                    lineHeight: 1.4,
                    color: "#fecaca",
                    background: "rgba(239, 68, 68, 0.12)",
                    border: "1px solid rgba(239, 68, 68, 0.28)",
                  }}
                >
                  {error}
                </div>
              ) : null}

              {loginNeedsConfirmation ? (
                <button
                  type="button"
                  disabled={resendSubmitting || resendCooldownSec > 0 || !confirmationEmail}
                  onClick={() => void handleResendConfirmation()}
                  style={{
                    ...primaryButtonStyle,
                    marginBottom: 14,
                    cursor:
                      resendSubmitting || resendCooldownSec > 0 ? "not-allowed" : "pointer",
                    opacity: resendSubmitting || resendCooldownSec > 0 ? 0.75 : 1,
                  }}
                >
                  {resendSubmitting
                    ? "Bitte warten…"
                    : resendCooldownSec > 0
                      ? `Erneut senden (${resendCooldownSec}s)`
                      : "Bestätigungs-Mail erneut senden"}
                </button>
              ) : null}

              <button
                type="submit"
                disabled={submitting}
                style={{
                  ...primaryButtonStyle,
                  cursor: submitting ? "not-allowed" : "pointer",
                  opacity: submitting ? 0.75 : 1,
                  background: submitting
                    ? "linear-gradient(135deg, rgba(16,185,129,0.65), rgba(59,130,246,0.65))"
                    : primaryButtonStyle.background,
                }}
              >
                {submitting ? "Bitte warten…" : primaryLabel}
              </button>
            </form>

            {mode === "signin" ? (
              <p style={{ margin: "14px 0 0", textAlign: "center", fontSize: 13, color: "#94a3b8" }}>
                <button
                  type="button"
                  onClick={() => switchMode("reset")}
                  disabled={submitting}
                  style={{
                    ...linkButtonStyle,
                    cursor: submitting ? "not-allowed" : "pointer",
                  }}
                >
                  Passwort vergessen?
                </button>
              </p>
            ) : null}

            {isReset ? (
              <p style={{ margin: "18px 0 0", textAlign: "center", fontSize: 13, color: "#94a3b8" }}>
                <button
                  type="button"
                  onClick={() => switchMode("signin")}
                  disabled={submitting}
                  style={{
                    ...linkButtonStyle,
                    cursor: submitting ? "not-allowed" : "pointer",
                  }}
                >
                  Zurück zum Login
                </button>
              </p>
            ) : (
              <p style={{ margin: "18px 0 0", textAlign: "center", fontSize: 13, color: "#94a3b8" }}>
                {isSignUp ? (
                  <>
                    Schon ein Konto?{" "}
                    <button
                      type="button"
                      onClick={() => switchMode("signin")}
                      disabled={submitting}
                      style={{
                        ...linkButtonStyle,
                        cursor: submitting ? "not-allowed" : "pointer",
                      }}
                    >
                      Anmelden
                    </button>
                  </>
                ) : (
                  <>
                    Noch kein Konto?{" "}
                    <button
                      type="button"
                      onClick={() => switchMode("signup")}
                      disabled={submitting}
                      style={{
                        ...linkButtonStyle,
                        cursor: submitting ? "not-allowed" : "pointer",
                      }}
                    >
                      Registrieren
                    </button>
                  </>
                )}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
