/**
 * Orchestrierung: Intent, Sicherheits-Leitplanken, Aufruf Mock- oder Cloud-Coach.
 * Planänderungen bleiben über strukturierte Actions + UI-Bestätigung (keine direkte Ausführung).
 */

import { getAiConfig } from "./config";
import { coachStructuredMarkdownAppendix } from "./getAiContext";
import { detectIntent, type Intent } from "./intentDetection";
import { mockBrainGenerate } from "./mockBrain";
import { openAiGenerate } from "./openaiBrain";
import type { AiAssistantResponse, AiContext } from "./types";

/** Client-side context: plan/logs for confirmations; remote coach receives full `toRemoteCoachPayload`. */
export type CoachContext = AiContext;

function buildCoachPreamble(context: AiContext): string {
  const parts: string[] = [];
  if (context.coachKnowledgeDigest?.trim()) parts.push(context.coachKnowledgeDigest.trim());
  if (context.coachRuntimePromptBlock?.trim()) parts.push(context.coachRuntimePromptBlock.trim());
  if (context.conversationTurns?.length) {
    const lines = context.conversationTurns.map((x) => `${x.role}: ${x.text}`);
    parts.push(`Bisheriger Chat (älteste→neueste):\n${lines.join("\n")}`);
  }
  return parts.join("\n\n");
}

export function buildSteeredUserMessage(userInput: string, intent: Intent, context: AiContext): string {
  const digest = buildCoachPreamble(context);
  const dataBlock = coachStructuredMarkdownAppendix(context);
  const rules = [
    digest ? `[KONTEXT]\n${digest}` : "",
    dataBlock ? `[TRAININGSDATEN]\n${dataBlock}` : "",
    `Klassifizierter Nutzer-Intent: ${intent}.`,
    "Regeln: Keine Diagnosen oder Krankheits-Behauptungen ohne klare Nutzerangaben.",
    "Keine Plan- oder Terminänderung behaupten, bevor der Nutzer zustimmt — bei Unklarheit kurz nachfragen.",
    "Ernährung allgemein sportnah beantworten; keine medizinische Einzelfallberatung.",
    "Verweise nie auf externe Hilfe (kein Kontakt außerhalb der App): löse hier mit Navigation, Plan-Aktionen mit Bestätigung oder klaren nächsten Schritten im Produkt.",
    "Nutze Laufzeit-Snapshot, Recovery-Domain UND die Daten unter [TRAININGSDATEN] (Plan + Logs + Health-Slice): zitiere Einheiten mit Datum/Typ/KM wo sinnvoll.",
    "Antwort bevorzugt auf Deutsch, präzise, freundlich.",
  ]
    .filter(Boolean)
    .join("\n");
  return `${rules}\n\nNutzer: ${userInput.trim()}`;
}

/**
 * Zentraler Einstieg für den AI-Coach (Chat). Nutzt Cloud-API wenn konfiguriert, sonst Mock.
 */
export async function generateCoachResponse(input: string, context: CoachContext): Promise<AiAssistantResponse> {
  const intent = detectIntent(input, context.conversationTurns);
  const config = getAiConfig();
  const steered = buildSteeredUserMessage(input, intent, context);

  if (config.enabled && config.provider === "openai") {
    try {
      return await openAiGenerate(steered, context, config);
    } catch {
      const fallback = await mockBrainGenerate(input, context, intent, steered);
      return {
        ...fallback,
        message: `${fallback.message} (Cloud-Antwort war nicht verfügbar, lokaler Coach aktiv.)`,
      };
    }
  }

  return mockBrainGenerate(input, context, intent, steered);
}
