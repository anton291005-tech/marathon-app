type Props = {
  email: string | null;
  /** Fertige Zeile aus `buildSettingsGoalLine`; `null` = kein aktives Ziel. */
  goalLine: string | null;
  onOpen: () => void;
};

/** Profilkarte über der Bereichsliste: Konto-E-Mail und aktives Ziel, Tap öffnet „Profil". */
export function SettingsProfileCard({ email, goalLine, onOpen }: Props) {
  const initial = email ? email.trim().charAt(0).toUpperCase() : "";
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label="Profil öffnen"
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "16px",
        margin: 0,
        background: "var(--bg-card)",
        border: "1px solid var(--border-default)",
        borderRadius: 16,
        cursor: "pointer",
        textAlign: "left",
        boxSizing: "border-box",
        font: "inherit",
      }}
    >
      <span
        aria-hidden
        style={{
          flexShrink: 0,
          width: 52,
          height: 52,
          borderRadius: "50%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--bg-surface)",
          border: "1px solid var(--border-default)",
          color: "var(--text-primary)",
          fontSize: 20,
          fontWeight: 600,
        }}
      >
        {initial || "·"}
      </span>
      <span style={{ flex: "1 1 auto", minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
        <span
          style={{
            fontSize: 17,
            fontWeight: 600,
            color: "var(--text-primary)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {email || "Nicht angemeldet"}
        </span>
        <span style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.35 }}>
          {goalLine ?? "Kein aktives Ziel"}
        </span>
      </span>
      <span aria-hidden style={{ flexShrink: 0, fontSize: 20, lineHeight: 1, color: "var(--text-muted)" }}>
        ›
      </span>
    </button>
  );
}
