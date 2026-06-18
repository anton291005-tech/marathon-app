import React from "react";
import { Capacitor } from "@capacitor/core";

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    this.setState({ errorInfo });
    // eslint-disable-next-line no-console
    console.error("[ErrorBoundary] Uncaught render error:", error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    if (this.props.fallback) {
      return this.props.fallback;
    }

    const isNative = Capacitor.isNativePlatform();
    const errorMessage = this.state.error?.message ?? "Unbekannter Fehler";
    const componentStack = this.state.errorInfo?.componentStack ?? "";

    return (
      <div
        style={{
          minHeight: "100vh",
          background: "#0b101c",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px",
          fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
          color: "#e2e8f0",
          boxSizing: "border-box",
        }}
      >
        <div
          style={{
            maxWidth: 400,
            width: "100%",
            background: "rgba(239,68,68,0.08)",
            border: "1px solid rgba(239,68,68,0.25)",
            borderRadius: 16,
            padding: "28px 24px",
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
          <div
            style={{
              fontSize: 18,
              fontWeight: 700,
              color: "#fca5a5",
              marginBottom: 8,
            }}
          >
            Unerwarteter Fehler
          </div>
          <div
            style={{
              fontSize: 13,
              color: "#94a3b8",
              marginBottom: 20,
              lineHeight: 1.5,
            }}
          >
            Ein unerwarteter Fehler ist aufgetreten. Bitte starte die App neu.
          </div>

          <div
            style={{
              background: "rgba(0,0,0,0.3)",
              borderRadius: 10,
              padding: "10px 14px",
              marginBottom: 20,
              textAlign: "left",
              fontSize: 11,
              color: "#f87171",
              fontFamily: "monospace",
              wordBreak: "break-word",
              maxHeight: 120,
              overflow: "hidden",
            }}
          >
            {errorMessage}
          </div>

          <button
            onClick={this.handleReset}
            style={{
              background: "#1e40af",
              color: "#fff",
              border: "none",
              borderRadius: 12,
              padding: "12px 28px",
              fontSize: 15,
              fontWeight: 700,
              cursor: "pointer",
              width: "100%",
              marginBottom: 10,
            }}
          >
            Erneut versuchen
          </button>

          {isNative && (
            <div style={{ fontSize: 11, color: "#475569", marginTop: 8 }}>
              Falls das Problem anhält: App beenden und neu starten.
            </div>
          )}
        </div>

        {!isNative && componentStack && (
          <details
            style={{
              marginTop: 20,
              maxWidth: 400,
              width: "100%",
              background: "rgba(15,23,42,0.8)",
              borderRadius: 10,
              padding: "12px 16px",
            }}
          >
            <summary
              style={{ cursor: "pointer", fontSize: 12, color: "#64748b", userSelect: "none" }}
            >
              Technische Details
            </summary>
            <pre
              style={{
                marginTop: 10,
                fontSize: 10,
                color: "#475569",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                maxHeight: 200,
                overflow: "auto",
              }}
            >
              {componentStack}
            </pre>
          </details>
        )}
      </div>
    );
  }
}
