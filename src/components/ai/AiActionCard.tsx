import type { AiAssistantAction } from "../../lib/ai/types";

type Props = {
  action: AiAssistantAction;
  disabled?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  onEdit: () => void;
};

export default function AiActionCard({ action, disabled, onConfirm, onCancel, onEdit }: Props) {
  const preview = action.preview;
  if (!preview) return null;
  const isNavigation = action.type === "navigate_to_screen";

  return (
    <div
      style={{
        background: "linear-gradient(180deg, rgba(14,20,36,0.96), rgba(8,12,24,0.96))",
        border: "1px solid rgba(148,163,184,0.2)",
        borderRadius: 16,
        padding: 14,
      }}
    >
      <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: "#7c8aa5", fontWeight: 700 }}>
        {preview.title}
      </div>
      <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 7 }}>
        {preview.items.map((item) => (
          <div key={item} style={{ color: "#dbe7ff", fontSize: 13, lineHeight: 1.5 }}>
            {item}
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <button
          onClick={onConfirm}
          disabled={disabled}
          style={{
            flex: 1.2,
            background: "linear-gradient(135deg,#10b981,#3b82f6)",
            color: "#fff",
            border: "none",
            borderRadius: 11,
            padding: "10px 12px",
            fontWeight: 700,
            cursor: disabled ? "not-allowed" : "pointer",
            opacity: disabled ? 0.7 : 1,
          }}
        >
          {preview.confirmLabel || (isNavigation ? "Oeffnen" : "Uebernehmen")}
        </button>

        {!isNavigation && (
          <button
            onClick={onEdit}
            disabled={disabled}
            style={{
              flex: 1,
              background: "rgba(56,189,248,0.12)",
              color: "#bae6fd",
              border: "1px solid rgba(56,189,248,0.32)",
              borderRadius: 11,
              padding: "10px 12px",
              fontWeight: 700,
              cursor: disabled ? "not-allowed" : "pointer",
              opacity: disabled ? 0.7 : 1,
            }}
          >
            {preview.secondaryLabel || "Bearbeiten"}
          </button>
        )}

        <button
          onClick={onCancel}
          disabled={disabled}
          style={{
            flex: 1,
            background: "rgba(15,23,42,0.82)",
            color: "#94a3b8",
            border: "1px solid rgba(148,163,184,0.18)",
            borderRadius: 11,
            padding: "10px 12px",
            fontWeight: 700,
            cursor: disabled ? "not-allowed" : "pointer",
            opacity: disabled ? 0.7 : 1,
          }}
        >
          {preview.cancelLabel || "Abbrechen"}
        </button>
      </div>
    </div>
  );
}
