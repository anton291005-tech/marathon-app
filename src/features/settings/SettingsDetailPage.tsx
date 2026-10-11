import type { CSSProperties, ReactNode } from "react";

const PAGE_MOTION_CSS = `
  @keyframes settingsPagePush {
    0% { opacity: 0; transform: translate3d(24px,0,0); }
    100% { opacity: 1; transform: translate3d(0,0,0); }
  }
  @keyframes settingsPagePop {
    0% { opacity: 0; transform: translate3d(-24px,0,0); }
    100% { opacity: 1; transform: translate3d(0,0,0); }
  }
  .settings-page-push { animation: settingsPagePush .26s cubic-bezier(0.22, 1, 0.36, 1); }
  .settings-page-pop { animation: settingsPagePop .26s cubic-bezier(0.22, 1, 0.36, 1); }
  @media (prefers-reduced-motion: reduce) {
    .settings-page-push, .settings-page-pop { animation: none; }
  }
`;

type FrameProps = {
  /** Wechselt mit der Seite: der Scroll-Bereich wird neu aufgebaut und beginnt wieder oben. */
  pageKey: string;
  motion: -1 | 0 | 1;
  /** Stil des äußeren Rahmens (Tab-Wechsel-Animation des App-Rahmens). */
  style?: CSSProperties;
  children: ReactNode;
};

/**
 * Rahmen des Einstellungen-Tabs: füllt den Inhaltsbereich und scrollt in sich.
 * Bewusst im normalen Fluss (kein `position: fixed`) — der Platz für die Tab-Bar kommt vom
 * gemeinsamen Inhalts-Wrapper (`layout/bottomNavLayout.ts`), und dessen Dev-Guard sieht diese Seiten.
 */
export function SettingsPageFrame({ pageKey, motion, style, children }: FrameProps) {
  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", ...style }}>
      <style>{PAGE_MOTION_CSS}</style>
      <div
        key={pageKey}
        className={motion > 0 ? "settings-page-push" : motion < 0 ? "settings-page-pop" : undefined}
        style={{
          flex: 1,
          minHeight: 0,
          overflowX: "hidden",
          overflowY: "auto",
          WebkitOverflowScrolling: "touch",
          padding: "12px 16px 32px",
          boxSizing: "border-box",
        }}
      >
        {children}
      </div>
    </div>
  );
}

type PageProps = {
  title: string;
  /** Titel der Seite, zu der „Zurück" führt. */
  backLabel: string;
  onBack: () => void;
  children: ReactNode;
};

/** Detailseite: Kopfzeile mit Zurück und Titel, darunter die Gruppen der Seite. */
export function SettingsDetailPage({ title, backLabel, onBack, children }: PageProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <header style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto minmax(0,1fr)", alignItems: "center", minHeight: 44 }}>
        <button
          type="button"
          onClick={onBack}
          aria-label={`Zurück zu ${backLabel}`}
          style={{
            justifySelf: "start",
            display: "flex",
            alignItems: "center",
            gap: 4,
            minHeight: 44,
            maxWidth: "100%",
            padding: "0 8px 0 0",
            margin: 0,
            background: "transparent",
            border: "none",
            cursor: "pointer",
            color: "var(--text-secondary)",
            font: "inherit",
            fontSize: 16,
          }}
        >
          <span aria-hidden style={{ fontSize: 26, lineHeight: 1, marginTop: -3 }}>
            ‹
          </span>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{backLabel}</span>
        </button>
        <h1 style={{ margin: 0, padding: "0 8px", fontSize: 17, fontWeight: 600, color: "var(--text-primary)", textAlign: "center", whiteSpace: "nowrap" }}>
          {title}
        </h1>
        <span aria-hidden />
      </header>
      {children}
    </div>
  );
}
