import type { AiAssistantAction, AiContext, AiPlanSession, SessionType } from "../../lib/ai/types";
import { convertWorkoutToRun } from "../../lib/ai/convertWorkout";
import { calendarIsoFromSession, pickSourceSessionForReplace } from "../../lib/ai/buildReplacementWorkout";
import type { WorkoutV2 } from "../../planV2/types";
import {
  buildAfterConversionPlanFromPartial,
  buildConversionAthleteFacingWarnings,
} from "../validation/validateConversion";
import { extractReplaceWorkoutIntent } from "./extractReplaceWorkoutIntent";
import { resolveReplaceCalendarIso } from "./resolveReplaceWorkoutProposal";

export type ResolveConvertWorkoutResult =
  | { status: "clarify"; text: string }
  | { status: "error"; text: string }
  | {
      status: "ok";
      sourceDateIso: string;
      sourceSession: AiPlanSession & { sport: "bike"; sessionType: string };
      previewAfter: AiPlanSession & { sport: "run"; sessionType: string };
      coachFeedback: string;
      confidence: "high" | "medium";
      warnings?: string[];
      action: AiAssistantAction;
    };

function mergePreviewSession(base: AiPlanSession | null, changes: Partial<AiPlanSession>): AiPlanSession {
  const id = base?.id ?? "preview";
  const day = base?.day ?? "—";
  const date = base?.date ?? "—";
  return {
    id,
    day,
    date,
    type: (changes.type ?? base?.type ?? "easy") as SessionType,
    title: changes.title ?? base?.title ?? "Training",
    km: typeof changes.km === "number" ? changes.km : base?.km ?? 0,
    desc: changes.desc ?? base?.desc ?? null,
    pace: changes.pace !== undefined ? changes.pace : base?.pace ?? null,
  };
}

function aiSessionToWorkoutV2(session: AiPlanSession, dateIso: string): WorkoutV2 {
  return {
    id: session.id,
    dateIso: `${dateIso.slice(0, 10)}T12:00:00.000`,
    sport: session.type === "bike" ? "bike" : "run",
    sessionType: session.type,
    title: session.title,
    km: typeof session.km === "number" ? session.km : 0,
    desc: session.desc ?? null,
    pace: session.pace ?? null,
  };
}

function pickBikeSessionOnDay(
  plan: AiContext["plan"],
  dateIso: string,
): { kind: "single"; session: AiPlanSession } | { kind: "ambiguous"; text: string } | { kind: "none" } {
  const daySessions = plan.flatMap((w) => w.s).filter((s) => calendarIsoFromSession(s) === dateIso);
  const bikes = daySessions.filter((s) => s.type === "bike");
  if (bikes.length === 0) return { kind: "none" };
  if (bikes.length === 1) return { kind: "single", session: bikes[0]! };
  return {
    kind: "ambiguous",
    text: "An diesem Tag stehen mehrere Rennrad-Einheiten im Plan — welche soll ich umwandeln?",
  };
}

export function resolveConvertWorkoutProposal(raw: string, context: AiContext): ResolveConvertWorkoutResult {
  const extraction = extractReplaceWorkoutIntent(raw, { todayIso: context.todayIso });
  const dateIso = resolveReplaceCalendarIso(extraction, context.todayIso);

  const bikePick = pickBikeSessionOnDay(context.plan, dateIso);
  if (bikePick.kind === "ambiguous") {
    return { status: "clarify", text: bikePick.text };
  }

  let sourceSession: AiPlanSession | null =
    bikePick.kind === "single" ? bikePick.session : null;

  if (!sourceSession) {
    sourceSession = pickSourceSessionForReplace({
      plan: context.plan,
      dateIso,
      typeHints: ["bike"],
    });
  }

  if (!sourceSession && extraction.sourceAnchor === "unspecified" && !extraction.sourceIsoHint) {
    const todayPick = pickBikeSessionOnDay(context.plan, context.todayIso.slice(0, 10));
    if (todayPick.kind === "ambiguous") {
      return { status: "clarify", text: todayPick.text };
    }
    if (todayPick.kind === "single") {
      sourceSession = todayPick.session;
    }
  }

  if (!sourceSession || sourceSession.type !== "bike") {
    return {
      status: "clarify",
      text: "Welche Rennrad-Einheit soll ich umwandeln? Nenn z. B. «heute», «morgen» oder ein konkretes Datum.",
    };
  }

  const workoutV2 =
    context.planV2?.workouts.find((w) => w.id === sourceSession!.id) ??
    aiSessionToWorkoutV2(sourceSession, dateIso);

  if (workoutV2.sport !== "bike" && workoutV2.sessionType !== "bike") {
    return {
      status: "error",
      text: "An diesem Tag finde ich keine Rennrad-Einheit zum Konvertieren.",
    };
  }

  let conversion;
  try {
    conversion = convertWorkoutToRun(workoutV2);
  } catch {
    return {
      status: "error",
      text: "Die Einheit konnte nicht in ein äquivalentes Lauftraining umgerechnet werden.",
    };
  }

  const targetSessionType = conversion.proposed.sessionType;
  if (!targetSessionType || !["easy", "tempo", "interval"].includes(targetSessionType)) {
    return {
      status: "error",
      text: "Die Umrechnung ergab keinen gültigen Lauftyp — bitte formuliere den Wunsch noch einmal.",
    };
  }

  const mergedPreview = mergePreviewSession(sourceSession, {
    type: targetSessionType as SessionType,
    km: conversion.proposed.km,
    title: conversion.proposed.title,
    desc: conversion.proposed.desc ?? undefined,
    pace: conversion.proposed.pace ?? undefined,
  });

  const before = {
    ...sourceSession,
    sport: "bike" as const,
    sessionType: sourceSession.type,
  };
  const after = {
    ...mergedPreview,
    sport: "run" as const,
    sessionType: mergedPreview.type,
  };

  const action: AiAssistantAction = {
    type: "convert_workout_to_run",
    payload: {
      sessionId: sourceSession.id,
      targetSessionType,
      targetKm: conversion.proposed.km,
      targetPace: conversion.proposed.pace,
      targetTitle: conversion.proposed.title,
      targetDesc: conversion.proposed.desc,
      explanation: conversion.explanation,
    },
  };

  let coachFeedback = conversion.explanation;
  let warnings: string[] = [];
  if (context.planV2) {
    const afterPlan = buildAfterConversionPlanFromPartial(context.planV2, sourceSession.id, conversion.proposed);
    warnings = buildConversionAthleteFacingWarnings(context.planV2, afterPlan, sourceSession.id);
    if (warnings.length) {
      coachFeedback = `${conversion.explanation}\n\n${warnings.join("\n")}`;
    }
  }

  return {
    status: "ok",
    sourceDateIso: dateIso,
    sourceSession: before,
    previewAfter: after,
    coachFeedback,
    confidence: extraction.sourceIsoHint || extraction.sourceAnchor !== "unspecified" ? "high" : "medium",
    warnings,
    action,
  };
}
