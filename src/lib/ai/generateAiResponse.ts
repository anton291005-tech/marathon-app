import { getAiConfig } from "./config";
import { mockBrainGenerate } from "./mockBrain";
import { openAiGenerate } from "./openaiBrain";
import type { AiAssistantResponse, AiContext } from "./types";

export async function generateAiResponse(userInput: string, context: AiContext): Promise<AiAssistantResponse> {
  const config = getAiConfig();
  if (config.enabled && config.provider === "openai") {
    try {
      return await openAiGenerate(userInput, context, config);
    } catch {
      const fallback = await mockBrainGenerate(userInput, context);
      return {
        ...fallback,
        message: `${fallback.message} (Cloud-Antwort war nicht verfuegbar, lokaler Coach aktiv.)`,
      };
    }
  }
  return mockBrainGenerate(userInput, context);
}
