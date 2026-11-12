import type { NotificationSettings } from "../../services/notificationService";

type Props = { settings: NotificationSettings; onChange: (next: NotificationSettings) => void };

const pad = (n: number) => String(n).padStart(2, "0");

/** Einstellungszeile „Check-in-Erinnerung“ (Readiness Spec §6.1): an/aus und Uhrzeit, Standard 07:30. */
export function CheckInReminderSetting({ settings, onChange }: Props) {
  return (
    <div style={{ padding: "16px 0", borderBottom: "1px solid var(--border-default)" }} data-testid="checkin-reminder-setting">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: settings.enabled ? 14 : 0 }}>
        <div>
          <div style={{ color: "var(--text-primary)", fontWeight: 500 }}>Check-in-Erinnerung</div>
          <div style={{ color: "var(--text-secondary)", fontSize: 13, marginTop: 2 }}>
            {settings.enabled ? `Täglich um ${pad(settings.hour)}:${pad(settings.minute)} Uhr` : "Deaktiviert"}
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={settings.enabled}
          aria-label={settings.enabled ? "Check-in-Erinnerung deaktivieren" : "Check-in-Erinnerung aktivieren"}
          onClick={() => onChange({ ...settings, enabled: !settings.enabled })}
          style={{
            width: 52,
            height: 30,
            borderRadius: 15,
            border: "none",
            background: settings.enabled ? "#3b82f6" : "var(--bg-surface)",
            position: "relative",
            cursor: "pointer",
          }}
        >
          <div
            style={{ position: "absolute", top: 3, left: settings.enabled ? 24 : 3, width: 24, height: 24, borderRadius: "50%", background: "#fff" }}
          />
        </button>
      </div>
      {settings.enabled ? (
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 4 }}>
          <div style={{ color: "var(--text-secondary)", fontSize: 13 }}>Uhrzeit</div>
          <select
            aria-label="Stunde"
            value={settings.hour}
            onChange={(e) => onChange({ ...settings, hour: Number(e.target.value) })}
            style={{ background: "var(--bg-card)", color: "var(--text-primary)", border: "1px solid var(--border-default)", borderRadius: 8, padding: "6px 10px", fontSize: 14 }}
          >
            {Array.from({ length: 24 }, (_, i) => (
              <option key={i} value={i}>
                {pad(i)}
              </option>
            ))}
          </select>
          <select
            aria-label="Minute"
            value={settings.minute}
            onChange={(e) => onChange({ ...settings, minute: Number(e.target.value) })}
            style={{ background: "var(--bg-card)", color: "var(--text-primary)", border: "1px solid var(--border-default)", borderRadius: 8, padding: "6px 10px", fontSize: 14 }}
          >
            {[0, 15, 30, 45].map((m) => (
              <option key={m} value={m}>
                {pad(m)}
              </option>
            ))}
          </select>
        </div>
      ) : null}
    </div>
  );
}
