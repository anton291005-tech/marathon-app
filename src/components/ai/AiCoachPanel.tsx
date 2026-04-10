import { useMemo, useRef, useState } from "react";
import AiMessageList, { type UiChatMessage } from "./AiMessageList";
import { executeAiAction } from "../../lib/ai/actions";
import { generateAiResponse } from "../../lib/ai/generateAiResponse";
import type { AiAssistantAction, AiContext, PlanPatch } from "../../lib/ai/types";

type Props = {
  getContext: () => AiContext;
  onApplyPlanPatches: (message: string, action: AiAssistantAction, patches: PlanPatch[]) => void;
  onNavigate: (targetScreen: string, section?: string) => void;
};

const QUICK_ACTIONS = [
  "Plan anpassen",
  "Ersatztraining",
  "Rennen verschieben",
  "Start verschieben",
  "Zur Einstellung navigieren",
];

function createId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function AiCoachPanel({ getContext, onApplyPlanPatches, onNavigate }: Props) {
  const [messages, setMessages] = useState<UiChatMessage[]>([
    {
      id: createId(),
      role: "assistant",
      type: "text",
      text: "Ich bin dein AI Coach. Ich schlage Aenderungen erst als Vorschau vor, bevor etwas uebernommen wird.",
    },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const canSend = useMemo(() => input.trim().length > 0 && !busy, [input, busy]);

  const pushMessage = (msg: UiChatMessage) => {
    setMessages((prev) => [...prev, msg]);
    requestAnimationFrame(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
    });
  };

  const removeMessageById = (id: string) => {
    setMessages((prev) => prev.filter((msg) => msg.id !== id));
  };

  const sendToAI = async (userInput: string, loadingId: string) => {
    try {
      const context = getContext();
      console.log("[AiCoachPanel] sending to AI, input:", userInput); // eslint-disable-line no-console

      // generateAiResponse calls the real API when REACT_APP_AI_PROVIDER=openai,
      // and automatically falls back to the local mock brain if the API fails.
      const data = await generateAiResponse(userInput, context);

      console.log("[AiCoachPanel] AI response:", data); // eslint-disable-line no-console

      removeMessageById(loadingId);
      pushMessage({
        id: createId(),
        role: "assistant",
        type: "text",
        text: typeof data?.message === "string" && data.message.trim()
          ? data.message
          : "Keine Antwort",
      });

      if (data?.action) {
        pushMessage({
          id: createId(),
          role: "assistant",
          type: "action",
          action: data.action,
        });
      }
    } catch (err) {
      console.error("[AiCoachPanel] unhandled error:", err); // eslint-disable-line no-console
      removeMessageById(loadingId);
      pushMessage({
        id: createId(),
        role: "assistant",
        type: "error",
        text: "Coach gerade nicht erreichbar. Bitte versuche es gleich nochmal.",
        retryPrompt: userInput,
      });
    }
  };

  const retryFromError = async (errorMessageId: string, userPrompt: string) => {
    const prompt = userPrompt.trim();
    if (!prompt || busyRef.current) return;
    removeMessageById(errorMessageId);
    const loadingId = createId();
    pushMessage({ id: loadingId, role: "assistant", type: "loading", text: "" });
    busyRef.current = true;
    setBusy(true);
    try {
      await sendToAI(prompt, loadingId);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const sendMessage = async (rawText?: string) => {
    const text = (rawText ?? input).trim();
    if (!text || busyRef.current) return;
    if (!rawText) setInput("");
    pushMessage({ id: createId(), role: "user", type: "text", text });
    console.log("USER INPUT:", text);
    const loadingId = createId();
    pushMessage({ id: loadingId, role: "assistant", type: "loading", text: "" });
    busyRef.current = true;
    setBusy(true);
    try {
      await sendToAI(text, loadingId);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const onConfirmAction = (messageId: string, action: AiAssistantAction) => {
    const result = executeAiAction(action, getContext());
    removeMessageById(messageId);
    if (result.navigation) {
      onNavigate(result.navigation.targetScreen, result.navigation.section);
      pushMessage({
        id: createId(),
        role: "assistant",
        type: "text",
        text: "Navigation geoeffnet.",
      });
      return;
    }
    const patchCount = result.planPatches?.length || 0;
    if (patchCount > 0) {
      onApplyPlanPatches(result.message, action, result.planPatches || []);
      pushMessage({
        id: createId(),
        role: "assistant",
        type: "text",
        text: `${patchCount} Anpassung(en) uebernommen.`,
      });
      return;
    }
    pushMessage({
      id: createId(),
      role: "assistant",
      type: "text",
      text: result.message,
    });
  };

  const onCancelAction = (messageId: string) => {
    removeMessageById(messageId);
    pushMessage({
      id: createId(),
      role: "assistant",
      type: "text",
      text: "Alles klar, ich habe nichts geaendert.",
    });
  };

  const onEditAction = (_messageId: string, action: AiAssistantAction) => {
    const typeLabel =
      action.type === "adjust_plan_for_illness"
        ? "Krankheits-Anpassung"
        : action.type === "replace_bike_with_run"
          ? "Ersatztraining"
          : action.type === "shift_race_date"
            ? "Rennverschiebung"
            : action.type === "shift_plan_start_date"
              ? "Startverschiebung"
            : "Vorschlag";
    pushMessage({
      id: createId(),
      role: "assistant",
      type: "text",
      text: `Gerne. Beschreibe mir bitte kurz, wie ich die ${typeLabel}-Vorschau anpassen soll.`,
    });
  };

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        padding: "0 0 4px",
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
    >
      <div
        style={{
          background: "rgba(8,12,24,0.85)",
          border: "1px solid rgba(148,163,184,0.14)",
          borderRadius: 16,
          padding: "7px 10px 6px",
          flexShrink: 0,
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 800, color: "#fff" }}>AI Coach</div>
        <div style={{ marginTop: 2, fontSize: 11, color: "#94a3b8", lineHeight: 1.4 }}>
          Coach + Navigator. Plananpassungen werden immer erst als Action Card zur Bestaetigung gezeigt.
        </div>
        <div style={{ display: "flex", gap: 5, marginTop: 6, flexWrap: "wrap" }}>
          {QUICK_ACTIONS.map((chip) => (
            <button
              key={chip}
              onClick={() => sendMessage(chip)}
              disabled={busy}
              style={{
                background: "rgba(30,41,59,0.8)",
                border: "1px solid rgba(148,163,184,0.2)",
                color: "#cbd5e1",
                borderRadius: 999,
                padding: "5px 8px",
                fontSize: 11,
                fontWeight: 700,
                cursor: busy ? "not-allowed" : "pointer",
                opacity: busy ? 0.7 : 1,
              }}
            >
              {chip}
            </button>
          ))}
        </div>
      </div>

      <div
        ref={scrollRef}
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 5,
          background: "rgba(4,6,14,0.5)",
          border: "1px solid rgba(148,163,184,0.12)",
          borderRadius: 16,
          padding: 7,
        }}
      >
        <AiMessageList
          messages={messages}
          busy={busy}
          onConfirmAction={onConfirmAction}
          onCancelAction={onCancelAction}
          onEditAction={onEditAction}
          onRetryError={(messageId, userPrompt) => {
            void retryFromError(messageId, userPrompt);
          }}
        />
      </div>

      <div style={{ display: "flex", gap: 6, flexShrink: 0, alignItems: "stretch" }}>
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void sendMessage();
            }
          }}
          disabled={busy}
          placeholder="Frage deinen Coach..."
          style={{
            flex: 1,
            minHeight: 40,
            background: "#070b16",
            border: "1px solid rgba(148,163,184,0.22)",
            borderRadius: 10,
            padding: "8px 10px",
            color: "#e2e8f0",
            fontSize: 14,
            opacity: busy ? 0.65 : 1,
            boxSizing: "border-box",
          }}
        />
        <button
          onClick={() => void sendMessage()}
          disabled={!canSend}
          style={{
            background: "linear-gradient(135deg,#10b981,#3b82f6)",
            border: "none",
            color: "#fff",
            borderRadius: 10,
            padding: "0 12px",
            minHeight: 40,
            fontSize: 13,
            fontWeight: 800,
            cursor: canSend ? "pointer" : "not-allowed",
            opacity: canSend ? 1 : 0.7,
          }}
        >
          Senden
        </button>
      </div>
    </div>
  );
}
