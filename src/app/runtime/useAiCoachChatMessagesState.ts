import { useState, type Dispatch, type SetStateAction } from "react";
import type { UiChatMessage } from "../../components/ai/AiMessageList";
import { getAppNowEpochMs } from "../../core/time/timeSystem";

export type AiCoachChatMessagesSetter = Dispatch<SetStateAction<UiChatMessage[]>>;

/** Tuple mirror of historical `App.tsx` inline `useState<UiChatMessage[]>(…)`. */
export type AiCoachChatMessagesTuple = [UiChatMessage[], AiCoachChatMessagesSetter];

/** Initial AI coach thread — extracted from `App.tsx` without semantic change. */
export function useAiCoachChatMessagesState(): AiCoachChatMessagesTuple {
  return useState<UiChatMessage[]>([
    {
      id: `init-${getAppNowEpochMs()}`,
      role: "assistant",
      type: "text",
      text: "Ich bin dein Plan-Coach und helfe dir dabei, dein Training zu verbessern, anzupassen und optimal durch die Vorbereitung zu kommen.",
    },
  ]);
}
