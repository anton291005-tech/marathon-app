import { MessageCircle } from "lucide-react";
import AiActionCard from "./AiActionCard";
import { ICON_STROKE } from "../../ui/icons";
import type { AiAssistantAction } from "../../lib/ai/types";

export type UiChatMessage = {
  id: string;
  role: "user" | "assistant";
  type: "text" | "action" | "loading" | "error";
  text?: string;
  action?: AiAssistantAction;
  /** Bei type "error": zuletzt fehlgeschlagene Nutzereingabe für Retry */
  retryPrompt?: string;
};

type Props = {
  messages: UiChatMessage[];
  busy?: boolean;
  onConfirmAction: (messageId: string, action: AiAssistantAction) => void;
  onCancelAction: (messageId: string) => void;
  onEditAction: (messageId: string, action: AiAssistantAction) => void;
  onRetryError?: (messageId: string, userPrompt: string) => void;
};

export default function AiMessageList({
  messages,
  busy,
  onConfirmAction,
  onCancelAction,
  onEditAction,
  onRetryError,
}: Props) {
  return (
    <div className="mr-chat">
      {messages.map((message) => {
        if (message.type === "action" && message.action) {
          return (
            <AiActionCard
              key={message.id}
              action={message.action}
              disabled={busy}
              onConfirm={() => onConfirmAction(message.id, message.action as AiAssistantAction)}
              onCancel={() => onCancelAction(message.id)}
              onEdit={() => onEditAction(message.id, message.action as AiAssistantAction)}
            />
          );
        }
        if (message.role === "user") {
          return (
            <div key={message.id} className="mr-msg--user">
              {message.text}
            </div>
          );
        }
        const isError = message.type === "error";
        return (
          <div key={message.id} className="mr-msg--coach">
            <div className="mr-msg__who">
              <MessageCircle aria-hidden size={14} strokeWidth={ICON_STROKE} />
              Coach
            </div>
            {message.type === "loading" ? (
              <p className="mr-msg__text mr-msg__text--muted">Coach denkt…</p>
            ) : (
              <>
                <p className={isError ? "mr-msg__text mr-msg__text--error" : "mr-msg__text"}>{message.text}</p>
                {isError && message.retryPrompt && message.retryPrompt.trim() && onRetryError ? (
                  <button
                    type="button"
                    className="mr-btn mr-btn--secondary mr-btn--small"
                    onClick={() => onRetryError(message.id, message.retryPrompt as string)}
                    disabled={!!busy}
                  >
                    Erneut versuchen
                  </button>
                ) : null}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
