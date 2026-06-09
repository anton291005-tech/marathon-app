import type { WorkoutV2 } from "../../planV2/types";

type SwapConfirmationCardProps = {
  workoutA: WorkoutV2;
  workoutB: WorkoutV2;
  onConfirm: () => void;
  onCancel: () => void;
};

const SESSION_TYPE_COLOR: Record<string, string> = {
  easy: "#10b981",
  interval: "#ef4444",
  intervals: "#ef4444",
  tempo: "#f59e0b",
  long: "#3b82f6",
  rest: "#6b7280",
  race: "#8b5cf6",
  strength: "#f97316",
  bike: "#06b6d4",
};

function sessionColor(sessionType: string): string {
  return SESSION_TYPE_COLOR[sessionType.toLowerCase()] ?? "#94a3b8";
}

function fmtDate(iso: string): string {
  if (!iso.match(/^\d{4}-\d{2}-\d{2}/)) return iso;
  const [, mm, dd] = iso.slice(0, 10).split("-");
  return `${dd}.${mm}.`;
}

function WorkoutRow({ workout }: { workout: WorkoutV2 }) {
  const color = sessionColor(workout.sessionType);
  return (
    <div
      style={{
        flex: 1,
        background: "rgba(15,23,42,0.6)",
        border: "1px solid rgba(148,163,184,0.15)",
        borderRadius: 10,
        padding: "10px 12px",
        display: "flex",
        flexDirection: "column",
        gap: 4,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: color,
            flexShrink: 0,
          }}
        />
        <span style={{ fontSize: 11, color: "#94a3b8", fontWeight: 600 }}>
          {fmtDate(workout.dateIso)}
        </span>
      </div>
      <div style={{ fontSize: 13, fontWeight: 700, color: "#e2e8f0", lineHeight: 1.3 }}>
        {workout.title}
      </div>
      {workout.km > 0 && (
        <div style={{ fontSize: 11, color: "#64748b" }}>{workout.km} km</div>
      )}
    </div>
  );
}

export default function SwapConfirmationCard({
  workoutA,
  workoutB,
  onConfirm,
  onCancel,
}: SwapConfirmationCardProps) {
  return (
    <div
      style={{
        background: "rgba(15,23,42,0.85)",
        border: "1px solid rgba(148,163,184,0.2)",
        borderRadius: 16,
        padding: 16,
        display: "flex",
        flexDirection: "column",
        gap: 12,
        animation: "slideUpFadeIn 0.22s ease-out both",
      }}
    >
      <style>{`
        @keyframes slideUpFadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <div style={{ fontSize: 15, fontWeight: 500, color: "#f1f5f9" }}>
        Training tauschen?
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "stretch" }}>
        <WorkoutRow workout={workoutA} />
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 18,
            color: "#64748b",
            flexShrink: 0,
          }}
        >
          ↔
        </div>
        <WorkoutRow workout={workoutB} />
      </div>

      <div style={{ fontSize: 12, color: "#64748b", lineHeight: 1.5 }}>
        Die Inhalte werden getauscht, die Termine bleiben.
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <button
          onClick={onCancel}
          style={{
            flex: 1,
            background: "transparent",
            border: "1px solid rgba(148,163,184,0.3)",
            color: "#94a3b8",
            borderRadius: 10,
            padding: "10px 0",
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Abbrechen
        </button>
        <button
          onClick={onConfirm}
          style={{
            flex: 1,
            background: "linear-gradient(135deg,#10b981,#3b82f6)",
            border: "none",
            color: "#fff",
            borderRadius: 10,
            padding: "10px 0",
            fontSize: 13,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Bestätigen
        </button>
      </div>
    </div>
  );
}
