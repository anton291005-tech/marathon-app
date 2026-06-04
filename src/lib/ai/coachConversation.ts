import type { AiCoachConversationTurn } from "./types";

export type { AiCoachConversationTurn };

/** UI-Messages ohne Actions/Swaps — nur durchgehender Konversationstext für LLM-/Support-Layer. */
export function buildCoachConversationTurns(messages: AiCoachConversationInput[], limit = 10): AiCoachConversationTurn[] {
  const out: AiCoachConversationTurn[] = [];
  for (const m of messages) {
    if (!m || m.type === "loading" || m.type === "error") continue;
    if (m.type !== "text" || !m.text?.trim()) continue;
    if (m.role !== "user" && m.role !== "assistant") continue;
    out.push({ role: m.role, text: m.text.trim() });
  }
  return out.slice(-limit);
}

type AiCoachConversationInput = {
  role: "user" | "assistant";
  type?: string;
  text?: string;
};
