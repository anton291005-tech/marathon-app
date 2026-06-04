import { useCallback, useState, type CSSProperties } from "react";
import type { TrainingPlanListItem } from "../lib/supabase/services/trainingPlanService";

export type PlanSwitcherProps = {
  plans: TrainingPlanListItem[];
  onSwitch: (planId: string) => void;
  onAddNew: () => void;
  onDelete: (planId: string) => void;
  maxPlans?: number;
};

const rowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
  padding: "10px 0",
  borderBottom: "1px solid rgba(148,163,184,0.1)",
};

const badgeActive: CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  color: "#6ee7b7",
  background: "rgba(16,185,129,0.15)",
  border: "1px solid rgba(16,185,129,0.35)",
  borderRadius: 8,
  padding: "3px 8px",
  flexShrink: 0,
};

const iconButtonStyle: CSSProperties = {
  background: "rgba(56,189,248,0.12)",
  border: "1px solid rgba(56,189,248,0.28)",
  borderRadius: 10,
  color: "#7dd3fc",
  cursor: "pointer",
  fontSize: 14,
  fontWeight: 700,
  width: 36,
  height: 36,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
};

const deleteButtonStyle: CSSProperties = {
  ...iconButtonStyle,
  background: "rgba(248,113,113,0.1)",
  border: "1px solid rgba(248,113,113,0.28)",
  color: "#fca5a5",
};

export function PlanSwitcher({
  plans,
  onSwitch,
  onAddNew,
  onDelete,
  maxPlans = 5,
}: PlanSwitcherProps) {
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const atMax = plans.length >= maxPlans;
  const canDelete = plans.length > 1;

  const handleConfirmDelete = useCallback(() => {
    if (!pendingDeleteId) return;
    onDelete(pendingDeleteId);
    setPendingDeleteId(null);
  }, [onDelete, pendingDeleteId]);

  return (
    <div style={{ marginTop: 12 }}>
      <div
        style={{
          fontSize: 11,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: "#7c8aa5",
          fontWeight: 700,
          marginBottom: 8,
        }}
      >
        Meine Trainingspläne ({plans.length}/{maxPlans})
      </div>

      {plans.length === 0 ? (
        <div style={{ fontSize: 12, color: "#64748b", lineHeight: 1.5 }}>
          Noch kein Trainingsplan gespeichert.
        </div>
      ) : (
        <div>
          {plans.map((plan) => (
            <div key={plan.id} style={rowStyle}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: plan.is_active ? 700 : 500,
                    color: plan.is_active ? "#f1f5f9" : "#cbd5e1",
                    lineHeight: 1.35,
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  {plan.is_active ? (
                    <span style={{ color: "#6ee7b7", fontSize: 13 }} aria-hidden>
                      ✓
                    </span>
                  ) : null}
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {plan.plan_name}
                  </span>
                </div>
              </div>
              {plan.is_active ? (
                <span style={badgeActive}>Aktiv</span>
              ) : (
                <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                  <button
                    type="button"
                    title="Plan aktivieren"
                    aria-label={`${plan.plan_name} aktivieren`}
                    style={iconButtonStyle}
                    onClick={() => onSwitch(plan.id)}
                  >
                    ►
                  </button>
                  {canDelete ? (
                    <button
                      type="button"
                      title="Plan löschen"
                      aria-label={`${plan.plan_name} löschen`}
                      style={deleteButtonStyle}
                      onClick={() => setPendingDeleteId(plan.id)}
                    >
                      🗑
                    </button>
                  ) : null}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <button
        type="button"
        disabled={atMax}
        title={atMax ? "Maximal 5 Trainingspläne" : undefined}
        onClick={onAddNew}
        style={{
          marginTop: 12,
          width: "100%",
          background: atMax ? "rgba(148,163,184,0.08)" : "rgba(56,189,248,0.18)",
          color: atMax ? "#64748b" : "#dbeafe",
          border: atMax
            ? "1px solid rgba(148,163,184,0.14)"
            : "1px solid rgba(56,189,248,0.28)",
          borderRadius: 12,
          padding: "10px 12px",
          cursor: atMax ? "not-allowed" : "pointer",
          fontSize: 12,
          fontWeight: 700,
        }}
      >
        + Neuer Trainingsplan
      </button>

      {pendingDeleteId ? (
        <div
          role="dialog"
          aria-labelledby="plan-delete-title"
          style={{
            marginTop: 12,
            padding: 12,
            borderRadius: 12,
            background: "rgba(15,23,42,0.95)",
            border: "1px solid rgba(248,113,113,0.35)",
          }}
        >
          <div id="plan-delete-title" style={{ fontSize: 13, fontWeight: 700, color: "#f1f5f9", marginBottom: 10 }}>
            Plan wirklich löschen?
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={() => setPendingDeleteId(null)}
              style={{
                flex: 1,
                background: "transparent",
                border: "1px solid rgba(148,163,184,0.25)",
                borderRadius: 10,
                color: "#94a3b8",
                padding: "8px 10px",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Abbrechen
            </button>
            <button
              type="button"
              onClick={handleConfirmDelete}
              style={{
                flex: 1,
                background: "rgba(248,113,113,0.2)",
                border: "1px solid rgba(248,113,113,0.4)",
                borderRadius: 10,
                color: "#fecaca",
                padding: "8px 10px",
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Löschen
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
