import { Children, type CSSProperties, type ReactNode } from "react";

/** Gemeinsame Mindesthöhe einer Listenzeile (iOS-gruppierte Liste). */
export const SETTINGS_ROW_MIN_HEIGHT_PX = 52;

const groupTitleStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "var(--text-muted)",
  padding: "0 16px",
  marginBottom: 8,
};

const groupCardStyle: CSSProperties = {
  background: "var(--bg-card)",
  border: "1px solid var(--border-default)",
  borderRadius: 16,
  overflow: "hidden",
};

type GroupProps = {
  title?: string;
  footer?: string;
  /** Freier Inhalt (Formularfelder, Buttons) statt Zeilen: Karte mit Innenabstand, ohne Trennlinien. */
  padded?: boolean;
  children: ReactNode;
};

/** Gruppe einer iOS-artigen Liste: gedämpfte Überschrift, Karte, Zeilen mit eingerückter Trennlinie. */
export function SettingsGroup({ title, footer, padded = false, children }: GroupProps) {
  const rows = padded ? [] : Children.toArray(children);
  return (
    <section>
      {title ? <div style={groupTitleStyle}>{title}</div> : null}
      <div style={padded ? { ...groupCardStyle, padding: "0 16px 14px" } : groupCardStyle}>
        {padded
          ? children
          : rows.map((row, index) => (
              <div key={index}>
                {index > 0 ? (
                  <div aria-hidden style={{ height: 1, marginLeft: 16, background: "var(--border-default)" }} />
                ) : null}
                {row}
              </div>
            ))}
      </div>
      {footer ? (
        <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.45, padding: "8px 16px 0" }}>{footer}</div>
      ) : null}
    </section>
  );
}

type RowProps = {
  label: string;
  /** Aktueller Wert rechts neben dem Chevron. */
  value?: string | null;
  onClick: () => void;
};

/** Zeile, die eine Detailseite öffnet: Titel links, aktueller Wert + Chevron rechts. */
export function SettingsRow({ label, value, onClick }: RowProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: "100%",
        minHeight: SETTINGS_ROW_MIN_HEIGHT_PX,
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "8px 16px",
        margin: 0,
        background: "transparent",
        border: "none",
        cursor: "pointer",
        textAlign: "left",
        boxSizing: "border-box",
        font: "inherit",
      }}
    >
      <span style={{ flex: "1 1 auto", minWidth: 0, fontSize: 16, fontWeight: 500, color: "var(--text-primary)", lineHeight: 1.25 }}>
        {label}
      </span>
      {value ? (
        <span
          style={{
            flex: "0 1 auto",
            minWidth: 0,
            maxWidth: "55%",
            fontSize: 15,
            color: "var(--text-secondary)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {value}
        </span>
      ) : null}
      <span aria-hidden style={{ flexShrink: 0, fontSize: 20, lineHeight: 1, color: "var(--text-muted)" }}>
        ›
      </span>
    </button>
  );
}
