import { handleAgentResponse } from "./handleAgentResponse";
import { AGENT_WEAK_MESSAGE } from "./agentFallback";

describe("handleAgentResponse - swapTrainingDays tool_call branch", () => {
  test("gültige dayA/dayB bauen eine swap_training_days-Action zur Bestätigung (kein sofortiges Ausführen)", async () => {
    const res = { type: "tool_call", action: "swapTrainingDays", parameters: { dayA: "Dienstag", dayB: "Donnerstag" } };
    const result = await handleAgentResponse(res, {});

    expect(result.mode).toBe("coach");
    expect(result.message).toBe("Ich tausche die Einheiten am Dienstag und Donnerstag. Bitte bestätige.");
    expect(result.action).toEqual({
      type: "swap_training_days",
      payload: { dayA: "Dienstag", dayB: "Donnerstag" },
      preview: {
        title: "Trainingstage tauschen",
        items: ["Dienstag ↔ Donnerstag"],
        confirmLabel: "Tauschen",
        cancelLabel: "Abbrechen",
      },
    });
  });

  test("fehlendes dayB -> kein action-Objekt, Fallback-Nachricht statt Absturz", async () => {
    const res = { type: "tool_call", action: "swapTrainingDays", parameters: { dayA: "Dienstag" } };
    const result = await handleAgentResponse(res, {});

    expect(result.action).toBeUndefined();
    expect(result.message).toContain(AGENT_WEAK_MESSAGE);
  });

  test("fehlendes dayA -> kein action-Objekt, Fallback-Nachricht statt Absturz", async () => {
    const res = { type: "tool_call", action: "swapTrainingDays", parameters: { dayB: "Donnerstag" } };
    const result = await handleAgentResponse(res, {});

    expect(result.action).toBeUndefined();
    expect(result.message).toContain(AGENT_WEAK_MESSAGE);
  });

  test("unbekannter tool_call-Actionname fällt auf den generischen Fallback zurück", async () => {
    const res = { type: "tool_call", action: "someUnknownTool", parameters: {} };
    const result = await handleAgentResponse(res, {});

    expect(result.action).toBeUndefined();
    expect(result.message).toContain(AGENT_WEAK_MESSAGE);
  });

  test("_state wird nicht gelesen (kein planEngine-Zugriff im Live-Pfad)", async () => {
    const res = { type: "tool_call", action: "swapTrainingDays", parameters: { dayA: "Mo", dayB: "Di" } };
    // Absichtlich kein planEngine im state: der echte Live-Pfad baut nur eine Bestätigungs-Action,
    // führt den Tausch nicht selbst aus (das übernimmt AiCoachPanel/handleSwapWorkoutsV2 danach).
    const result = await handleAgentResponse(res, undefined);
    expect(result.action?.type).toBe("swap_training_days");
  });
});
