import "../../i18n";
import { useState } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import AiCoachPanel from "./AiCoachPanel";
import type { AiAssistantAction } from "../../lib/ai/types";
import type { UiChatMessage } from "./AiMessageList";

/** Hält den kontrollierten messages-State wirklich im DOM aktuell (im Gegensatz zu einem jest.fn()-Mock). */
function ControlledAiCoachPanel(
  props: Omit<React.ComponentProps<typeof AiCoachPanel>, "messages" | "setMessages"> & {
    initialMessages: UiChatMessage[];
  },
) {
  const { initialMessages, ...rest } = props;
  const [messages, setMessages] = useState<UiChatMessage[]>(initialMessages);
  return <AiCoachPanel {...rest} messages={messages} setMessages={setMessages} />;
}

function buildSwapActionMessage(dayA: string, dayB: string): UiChatMessage {
  return {
    id: "msg-swap-1",
    role: "assistant",
    type: "action",
    action: {
      type: "swap_training_days",
      payload: { dayA, dayB },
      preview: {
        title: "Trainingstage tauschen",
        items: [`${dayA} ↔ ${dayB}`],
        confirmLabel: "Tauschen",
        cancelLabel: "Abbrechen",
      },
    } as AiAssistantAction,
  };
}

describe("AiCoachPanel - onConfirmAction für swap_training_days", () => {
  test("bestätigter Tausch findet Workouts per Datum-Präfix und ruft onSwapWorkoutsV2 mit deren IDs auf", () => {
    const onSwapWorkoutsV2 = jest.fn().mockReturnValue({ ok: true, message: "Tausch übernommen." });
    const getContext = jest.fn().mockReturnValue({
      planV2: {
        version: 2,
        workouts: [
          { id: "w-tue", dateIso: "2026-08-11T12:00:00.000Z", sport: "run", sessionType: "easy", title: "Easy", km: 6 },
          { id: "w-thu", dateIso: "2026-08-13T12:00:00.000Z", sport: "run", sessionType: "easy", title: "Easy", km: 6 },
        ],
        weeks: [],
      },
    });

    render(
      <ControlledAiCoachPanel
        getContext={getContext}
        onApplyPlanPatches={jest.fn()}
        onNavigate={jest.fn()}
        onSwapWorkoutsV2={onSwapWorkoutsV2}
        initialMessages={[buildSwapActionMessage("2026-08-11", "2026-08-13")]}
      />,
    );

    fireEvent.click(screen.getByText("Tauschen"));

    expect(onSwapWorkoutsV2).toHaveBeenCalledTimes(1);
    expect(onSwapWorkoutsV2).toHaveBeenCalledWith("w-tue", "w-thu");
  });

  test("kein passendes Workout am Zieldatum -> onSwapWorkoutsV2 wird NICHT aufgerufen", () => {
    const onSwapWorkoutsV2 = jest.fn();
    const getContext = jest.fn().mockReturnValue({ planV2: { version: 2, workouts: [], weeks: [] } });

    render(
      <ControlledAiCoachPanel
        getContext={getContext}
        onApplyPlanPatches={jest.fn()}
        onNavigate={jest.fn()}
        onSwapWorkoutsV2={onSwapWorkoutsV2}
        initialMessages={[buildSwapActionMessage("2026-08-11", "2026-08-13")]}
      />,
    );

    fireEvent.click(screen.getByText("Tauschen"));

    expect(onSwapWorkoutsV2).not.toHaveBeenCalled();
    expect(screen.getByText(/Tausch nicht möglich/)).toBeInTheDocument();
  });

  test("kein onSwapWorkoutsV2-Prop übergeben -> Fehlermeldung statt Absturz", () => {
    const getContext = jest.fn().mockReturnValue({
      planV2: {
        version: 2,
        workouts: [
          { id: "w-tue", dateIso: "2026-08-11T12:00:00.000Z", sport: "run", sessionType: "easy", title: "Easy", km: 6 },
          { id: "w-thu", dateIso: "2026-08-13T12:00:00.000Z", sport: "run", sessionType: "easy", title: "Easy", km: 6 },
        ],
        weeks: [],
      },
    });

    render(
      <ControlledAiCoachPanel
        getContext={getContext}
        onApplyPlanPatches={jest.fn()}
        onNavigate={jest.fn()}
        initialMessages={[buildSwapActionMessage("2026-08-11", "2026-08-13")]}
      />,
    );

    fireEvent.click(screen.getByText("Tauschen"));

    expect(screen.getByText(/Tausch nicht möglich/)).toBeInTheDocument();
  });
});
