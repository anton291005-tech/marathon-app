import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowUp } from "lucide-react";
import AiMessageList, { type UiChatMessage } from "./AiMessageList";
import { executeAiAction } from "../../lib/ai/actions";
import { runCoachAgent } from "../../lib/ai/coachAgent";
import { toRemoteCoachPayload } from "../../lib/ai/getAiContext";
import type { AiAssistantAction, AiContext, PlanPatch } from "../../lib/ai/types";
import { getAppNowEpochMs } from "../../core/time/timeSystem";

type SwapResult = { ok: boolean; message: string; warningText?: string | null } | void;

type Props = {
  getContext: () => AiContext;
  onApplyPlanPatches: (message: string, action: AiAssistantAction, patches: PlanPatch[]) => void;
  onNavigate: (targetScreen: string, section?: string) => void;
  onSwapWorkoutsV2?: (sourceId: string, targetId: string, overrideAccepted?: boolean) => SwapResult;
  onReplaceTrainingPlanV2?: (plan: unknown) => void;
  onApplyPreferencesPatch?: (patch: unknown) => void;
  messages?: UiChatMessage[];
  setMessages?: React.Dispatch<React.SetStateAction<UiChatMessage[]>>;
};

const QUICK_ACTIONS = [
  "Plan anpassen",
  "Ersatztraining",
  "Rennen verschieben",
  "Start verschieben",
  "Zur Einstellung navigieren",
];

function createId() {
  return `${getAppNowEpochMs()}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function AiCoachPanel({
  getContext,
  onApplyPlanPatches,
  onNavigate,
  onSwapWorkoutsV2,
  onReplaceTrainingPlanV2: _onReplaceTrainingPlanV2,
  onApplyPreferencesPatch,
  messages: controlledMessages,
  setMessages: setControlledMessages,
}: Props) {
  const { t } = useTranslation();
  const [internalMessages, setInternalMessages] = useState<UiChatMessage[]>([
    {
      id: createId(),
      role: "assistant",
      type: "text",
      text: "Ich bin dein Coach. Ich schlage Änderungen erst als Vorschau vor, bevor etwas übernommen wird.",
    },
  ]);
  const messages = controlledMessages ?? internalMessages;
  const setMessages = setControlledMessages ?? setInternalMessages;
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

      const turns = messages
        .filter((m) => m.type === "text" && m.text?.trim())
        .slice(-6)
        .map((m) => ({ role: m.role as "user" | "assistant", text: m.text!.trim() }));

      const appState = {
        ...toRemoteCoachPayload({ ...context, conversationTurns: turns }),
        goals: context.goals,
        maxHeartRateBpm: context.maxHeartRateBpm ?? null,
        recoverySummary: context.recoverySummary ?? null,
        conversationTurns: turns,
        availableScreens: context.availableScreens,
      };

      const data = await runCoachAgent(userInput, appState);

      console.log("[AiCoachPanel] AI response:", data); // eslint-disable-line no-console

      const message =
        typeof (data as Record<string, unknown>)?.message === "string"
          ? ((data as Record<string, unknown>).message as string).trim()
          : "";
      const action = (data as Record<string, unknown>)?.action as AiAssistantAction | undefined;

      removeMessageById(loadingId);
      pushMessage({
        id: createId(),
        role: "assistant",
        type: "text",
        text: message || "Keine Antwort",
      });

      if (action) {
        pushMessage({
          id: createId(),
          role: "assistant",
          type: "action",
          action,
        });
      }
    } catch (err) {
      console.error("[AiCoachPanel] unhandled error:", err); // eslint-disable-line no-console
      removeMessageById(loadingId);
      pushMessage({
        id: createId(),
        role: "assistant",
        type: "error",
        text: t("coach.unavailable"),
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
    removeMessageById(messageId);

    if (action.type === "swap_training_days") {
      const ctx = getContext();
      const dayA = typeof action.payload?.dayA === "string" ? action.payload.dayA.trim() : "";
      const dayB = typeof action.payload?.dayB === "string" ? action.payload.dayB.trim() : "";
      const workouts = ctx.planV2?.workouts ?? [];
      const wA = workouts.find((w) => typeof w.dateIso === "string" && w.dateIso.startsWith(dayA));
      const wB = workouts.find((w) => typeof w.dateIso === "string" && w.dateIso.startsWith(dayB));

      if (!onSwapWorkoutsV2 || !wA || !wB) {
        pushMessage({
          id: createId(),
          role: "assistant",
          type: "text",
          text: "Tausch nicht möglich — prüfe die beiden Tage im Wochenplan oder formuliere konkrete ISO-Daten.",
        });
        return;
      }

      onSwapWorkoutsV2(wA.id, wB.id);
      pushMessage({
        id: createId(),
        role: "assistant",
        type: "text",
        text: "Trainingstage getauscht.",
      });
      return;
    }

    if (action.type === "update_user_preferences") {
      onApplyPreferencesPatch?.(action.payload);
      pushMessage({
        id: createId(),
        role: "assistant",
        type: "text",
        text: "Einstellungen aktualisiert.",
      });
      return;
    }

    const result = executeAiAction(action, getContext());
    if (result.navigation) {
      onNavigate(result.navigation.targetScreen, result.navigation.section);
      pushMessage({
        id: createId(),
        role: "assistant",
        type: "text",
        text: "Navigation geöffnet.",
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
        text: `${patchCount} Anpassung(en) übernommen.`,
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
      text: "Alles klar, ich habe nichts geändert.",
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
              : action.type === "swap_training_days"
                ? "Tag-Tausch"
            : "Vorschlag";
    pushMessage({
      id: createId(),
      role: "assistant",
      type: "text",
      text: `Gerne. Beschreibe mir bitte kurz, wie ich die ${typeLabel}-Vorschau anpassen soll.`,
    });
  };

  return (
    <div className="mr-coach">
      <div className="mr-coach__top">
        <header className="mr-screen-head mr-screen-head--sub">
          <div className="mr-screen-head__text">
            <h1 className="mr-screen-head__title">Coach</h1>
            <div className="mr-screen-head__meta">Kennt deinen Plan, deine Läufe und deine Erholung.</div>
          </div>
        </header>
        <div className="mr-quick">
          {QUICK_ACTIONS.map((chip) => (
            <button type="button" key={chip} className="mr-quick__chip" onClick={() => sendMessage(chip)} disabled={busy}>
              {chip}
            </button>
          ))}
        </div>
      </div>

      <div ref={scrollRef} className="mr-coach__scroll">
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

      <div className="mr-composer">
        <input
          className="mr-composer__input"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void sendMessage();
            }
          }}
          disabled={busy}
          placeholder={t("coach.placeholder")}
          aria-label="Nachricht an den Coach"
        />
        <button
          type="button"
          className="mr-composer__send"
          onClick={() => void sendMessage()}
          disabled={!canSend}
          aria-label={t("coach.send")}
        >
          <ArrowUp aria-hidden size={20} strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}
