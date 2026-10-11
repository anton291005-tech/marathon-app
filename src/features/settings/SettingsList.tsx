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
        <div role="status" style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.45, padding: "8px 16px 0" }}>
          {footer}
        </div>
      ) : null}
    </section>
  );
}

type RowProps = {
  label: string;
  /** Aktueller Wert rechts in der Zeile. */
  value?: string | null;
  /** Aktion oder Wechsel auf eine Detailseite. Ohne `onClick` und `href` ist die Zeile reine Anzeige. */
  onClick?: () => void;
  /** Link (extern oder `mailto:`); `external` öffnet ihn außerhalb der App. */
  href?: string;
  external?: boolean;
  /** Chevron nur für Zeilen, die eine Detailseite öffnen (Standard bei `onClick`). */
  chevron?: boolean;
  tone?: "default" | "destructive";
  disabled?: boolean;
};

/** Farbe für die einzige zulässige rote Stelle der Einstellungen: Konto löschen. */
export const SETTINGS_DESTRUCTIVE_COLOR = "#f87171";

const rowStyle: CSSProperties = {
  width: "100%",
  minHeight: SETTINGS_ROW_MIN_HEIGHT_PX,
  display: "flex",
  alignItems: "center",
  gap: 12,
  padding: "8px 16px",
  margin: 0,
  background: "transparent",
  border: "none",
  textAlign: "left",
  textDecoration: "none",
  boxSizing: "border-box",
  font: "inherit",
};

/** Listenzeile: Titel links, aktueller Wert rechts; je nach Props Anzeige, Aktion, Link oder Seitenwechsel. */
export function SettingsRow({ label, value, onClick, href, external = false, chevron, tone = "default", disabled = false }: RowProps) {
  const showChevron = chevron ?? (onClick != null && href == null);
  const content = (
    <>
      <span
        style={{
          flex: "1 1 auto",
          minWidth: 0,
          fontSize: 16,
          fontWeight: 500,
          color: tone === "destructive" ? SETTINGS_DESTRUCTIVE_COLOR : "var(--text-primary)",
          lineHeight: 1.25,
        }}
      >
        {label}
      </span>
      {value ? (
        <span
          style={{
            flex: "0 1 auto",
            minWidth: 0,
            maxWidth: "62%",
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
      {showChevron ? (
        <span aria-hidden style={{ flexShrink: 0, fontSize: 20, lineHeight: 1, color: "var(--text-muted)" }}>
          ›
        </span>
      ) : null}
    </>
  );
  if (href != null) {
    return (
      <a
        href={href}
        {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
        style={{ ...rowStyle, cursor: "pointer" }}
      >
        {content}
      </a>
    );
  }
  if (onClick != null) {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        style={{ ...rowStyle, cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.55 : 1 }}
      >
        {content}
      </button>
    );
  }
  return <div style={rowStyle}>{content}</div>;
}
