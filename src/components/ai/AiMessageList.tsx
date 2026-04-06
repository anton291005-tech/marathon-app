import AiActionCard from "./AiActionCard";
import type { AiAssistantAction } from "../../lib/ai/types";

export type UiChatMessage = {
  id: string;
  role: "user" | "assistant";
  type: "text" | "action" | "loading" | "error";
  text?: string;
  action?: AiAssistantAction;
};

type Props = {
  messages: UiChatMessage[];
  busy?: boolean;
  onConfirmAction: (messageId: string, action: AiAssistantAction) => void;
  onCancelAction: (messageId: string) => void;
  onEditAction: (messageId: string, action: AiAssistantAction) => void;
};

export default function AiMessageList({ messages, busy, onConfirmAction, onCancelAction, onEditAction }: Props) {
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
              color: isUser ? "#e0f2fe" : message.type === "error" ? "#fecaca" : "#dbeafe",
              borderRadius: 14,
              padding: "10px 12px",
              fontSize: 13,
              lineHeight: 1.5,
            }}
          >
            {message.type === "loading" ? "Antwort wird vorbereitet..." : message.text}
          </div>
        );
      })}
    </div>
  );
}
