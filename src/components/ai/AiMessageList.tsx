import AiActionCard from "./AiActionCard";
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
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {messages.map((message) => {
        const isUser = message.role === "user";
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
        const isError = message.type === "error";
        return (
          <div
            key={message.id}
            style={{
              alignSelf: isUser ? "flex-end" : "flex-start",
              maxWidth: "88%",
              background: isUser
                ? "linear-gradient(135deg, rgba(56,189,248,0.22), rgba(59,130,246,0.22))"
                : "rgba(15,23,42,0.82)",
              border: `1px solid ${isUser ? "rgba(56,189,248,0.35)" : "rgba(148,163,184,0.18)"}`,
              color: isUser ? "#e0f2fe" : "#dbeafe",
              borderRadius: 14,
              padding: "10px 12px",
              fontSize: 13,
              lineHeight: 1.5,
            }}
          >
            {message.type === "loading" ? (
              "Coach denkt…"
            ) : (
              <>
                {message.text}
                {isError &&
                message.retryPrompt &&
                message.retryPrompt.trim() &&
                onRetryError ? (
                  <div style={{ marginTop: 10 }}>
                    <button
                      type="button"
                      onClick={() => onRetryError(message.id, message.retryPrompt as string)}
                      disabled={!!busy}
                      style={{
                        background: busy ? "rgba(30,41,59,0.5)" : "rgba(30,41,59,0.8)",
                        border: "1px solid rgba(148,163,184,0.2)",
                        color: busy ? "#64748b" : "#cbd5e1",
                        borderRadius: 10,
                        padding: "8px 12px",
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: busy ? "not-allowed" : "pointer",
                      }}
                    >
                      Erneut versuchen
                    </button>
                  </div>
                ) : null}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
