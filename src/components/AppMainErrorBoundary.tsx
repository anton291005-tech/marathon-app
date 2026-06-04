import React from "react";
import { repairPersistedStateOnBoot } from "../app/boot/repairPersistedStateOnBoot";
import { clearMarathonLocalStorage } from "../persistence/clearMarathonLocalStorage";

type Props = { children: React.ReactNode };

type State = {
  hasError: boolean;
  message: string;
};

function formatError(err: unknown): string {
  if (err instanceof Error) return err.message || String(err);
  return String(err);
}

export class AppMainErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, message: "" };

  static getDerivedStateFromError(err: unknown): State {
    return { hasError: true, message: formatError(err) };
  }

  componentDidCatch(err: unknown, info: React.ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error("[AppMainErrorBoundary]", formatError(err), info.componentStack);
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleRepairAndReload = () => {
    try {
      repairPersistedStateOnBoot();
      clearMarathonLocalStorage();
    } catch {
      // still attempt reload
    }
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div
        style={{
          minHeight: "100dvh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 20,
          boxSizing: "border-box",
          background: "#070912",
          color: "#e2e8f0",
          fontFamily: "system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif",
        }}
      >
        <div
          style={{
            maxWidth: 520,
            width: "100%",
            border: "1px solid rgba(248,113,113,0.35)",
            borderRadius: 16,
            background: "rgba(40,14,14,0.25)",
            padding: "18px 16px 16px",
          }}
        >
          <div style={{ fontWeight: 900, fontSize: 16, marginBottom: 8 }}>MyRace konnte nicht starten</div>
          <div style={{ fontSize: 13, lineHeight: 1.5, opacity: 0.92, marginBottom: 12 }}>
            Ein Fehler ist beim Laden aufgetreten. Deine Trainingsdaten bleiben in der Regel erhalten — du kannst es
            erneut versuchen oder den lokalen Cache zurücksetzen.
          </div>
          {this.state.message ? (
            <div
              style={{
                fontSize: 11,
                opacity: 0.75,
                marginBottom: 14,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {this.state.message}
            </div>
          ) : null}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <button
              type="button"
              onClick={this.handleReload}
              style={{
                padding: "12px 14px",
                borderRadius: 12,
                border: "none",
                fontWeight: 700,
                cursor: "pointer",
                color: "#fff",
                background: "linear-gradient(135deg, #10b981, #3b82f6)",
              }}
            >
              Neu laden
            </button>
            <button
              type="button"
              onClick={this.handleRepairAndReload}
              style={{
                padding: "12px 14px",
                borderRadius: 12,
                border: "1px solid rgba(148,163,184,0.25)",
                fontWeight: 600,
                cursor: "pointer",
                color: "#cbd5e1",
                background: "rgba(15,23,42,0.55)",
              }}
            >
              Cache zurücksetzen & neu laden
            </button>
          </div>
        </div>
      </div>
    );
  }
}
