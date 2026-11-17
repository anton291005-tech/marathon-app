import { ArrowLeftRight, ArrowRight, Navigation, SlidersHorizontal } from "lucide-react";
import type { AiAssistantAction } from "../../lib/ai/types";
import { ICON_SIZE_S, ICON_STROKE } from "../../ui/icons";
import { REASSIGNMENT_NOTE_SEPARATOR } from "../../ai/mutations/reassignmentRow";

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
 * Linke Seite „Titel: Do – Grund" (`formatReassignmentRow`): durchgestrichen wird nur „Titel: Do", der Grund am
 * Ausgangstag bleibt lesbar. Nur Zeilen der Form „Titel: Tag – …" werden getrennt.
 */
function splitOld(left: string): [string, string | null] {
  const at = left.indexOf(REASSIGNMENT_NOTE_SEPARATOR);
  if (at <= 0 || left.lastIndexOf(":", at) < 0) return [left, null];
  return [left.slice(0, at), left.slice(at + REASSIGNMENT_NOTE_SEPARATOR.length)];
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
            const old = change ? splitOld(change[0]) : null;
            return change && old ? (
              <div key={item} className="mr-diff__row">
                <span>
                  <span className="mr-diff__old">{old[0]}</span>
                  {old[1] ? <span className="mr-diff__note"> – {old[1]}</span> : null}
                </span>
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
