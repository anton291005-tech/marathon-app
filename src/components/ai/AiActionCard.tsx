import { ArrowLeftRight, ArrowRight, Navigation, SlidersHorizontal } from "lucide-react";
import type { AiAssistantAction } from "../../lib/ai/types";
import { ICON_SIZE_S, ICON_STROKE } from "../../ui/icons";

type Props = {
  action: AiAssistantAction;
  disabled?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  onEdit: () => void;
};

/** „Titel: Sa → Fr (17. Okt)" als Vorher/Nachher-Zeile; alles andere bleibt eine Textzeile. */
function splitChange(item: string): [string, string] | null {
  const parts = item.split(" → ");
  return parts.length === 2 && parts[0].trim() && parts[1].trim() ? [parts[0], parts[1]] : null;
}

/**
 * Vom Coach vorgeschlagene Änderung, wirkt erst nach Bestätigung
 * (docs/design-system/components.md, „ActionCard").
 */
export default function AiActionCard({ action, disabled, onConfirm, onCancel, onEdit }: Props) {
  const preview = action.preview;
  if (!preview) return null;
  const isNavigation = action.type === "navigate_to_screen";
  const hideEdit = isNavigation || action.type === "reassign_week_calendar_batch";
  const kind = isNavigation
    ? { label: "Navigation", Icon: Navigation }
    : action.type === "update_user_preferences"
      ? { label: "Einstellung", Icon: SlidersHorizontal }
      : { label: "Planänderung", Icon: ArrowLeftRight };

  return (
    <div className="mr-action">
      <span className="mr-chip mr-chip--accent mr-chip--plain">
        <kind.Icon aria-hidden size={14} strokeWidth={ICON_STROKE} />
        {kind.label}
      </span>
      <div className="mr-action__title">{preview.title}</div>
      {preview.items.length > 0 ? (
        <div className="mr-diff">
          {preview.items.map((item) => {
            const change = splitChange(item);
            return change ? (
              <div key={item} className="mr-diff__row">
                <span className="mr-diff__old">{change[0]}</span>
                <ArrowRight aria-label="wird zu" size={ICON_SIZE_S} strokeWidth={ICON_STROKE} />
                <span>{change[1]}</span>
              </div>
            ) : (
              <div key={item} className="mr-diff__row mr-diff__row--plain">
                {item}
              </div>
            );
          })}
        </div>
      ) : null}

      <div className="mr-action__buttons">
        <button type="button" className="mr-btn mr-btn--primary mr-btn--mid" onClick={onConfirm} disabled={disabled}>
          {preview.confirmLabel || (isNavigation ? "Öffnen" : "Übernehmen")}
        </button>
        {!hideEdit && (
          <button type="button" className="mr-btn mr-btn--secondary mr-btn--mid" onClick={onEdit} disabled={disabled}>
            {preview.secondaryLabel || "Bearbeiten"}
          </button>
        )}
        <button type="button" className="mr-btn mr-btn--secondary mr-btn--mid" onClick={onCancel} disabled={disabled}>
          {preview.cancelLabel || "Verwerfen"}
        </button>
      </div>
    </div>
  );
}
