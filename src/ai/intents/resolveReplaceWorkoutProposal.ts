import type { AiAssistantAction, AiContext, AiPlanSession, SessionType } from "../../lib/ai/types";
import { buildReplaceWorkoutCoachFeedbackGerman } from "../../lib/ai/coachDeterministicResponses";
import {
  buildReplacementWorkout,
  calendarIsoFromSession,
  findClosestSessionByType,
  pickSourceSessionForReplace,
} from "../../lib/ai/buildReplacementWorkout";
import type { ReplaceWorkoutExtraction } from "./extractReplaceWorkoutIntent";
import { extractReplaceWorkoutIntent } from "./extractReplaceWorkoutIntent";

const WEEKDAY_TO_DOW: Record<string, number> = {
  sonntag: 0,
  montag: 1,
  dienstag: 2,
  mittwoch: 3,
  donnerstag: 4,
  freitag: 5,
  samstag: 6,
};

function ymdFromDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDaysIso(isoDay: string, delta: number): string {
  const d = new Date(`${isoDay.slice(0, 10)}T12:00:00`);
  d.setDate(d.getDate() + delta);
  return ymdFromDate(d);
}

function upcomingWeekdayIso(fromIso: string, weekdayToken: string | undefined): string | null {
  if (!weekdayToken) return null;
  const want = WEEKDAY_TO_DOW[weekdayToken];
  if (want === undefined) return null;
  const base = new Date(`${fromIso.slice(0, 10)}T12:00:00`);
  for (let i = 0; i < 21; i++) {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    if (d.getDay() === want) return ymdFromDate(d);
  }
  return null;
}

export function resolveReplaceCalendarIso(ext: ReplaceWorkoutExtraction, todayIso: string): string {
  const base = todayIso.slice(0, 10);
  const fixed = ext.sourceIsoHint?.slice(0, 10);
  if (fixed) return fixed;

  switch (ext.sourceAnchor) {
    case "tomorrow":
      return addDaysIso(base, 1);
    case "day_after_tomorrow":
      return addDaysIso(base, 2);
    case "iso":
      return upcomingWeekdayIso(base, ext.sourceWeekdayToken) ?? base;
    case "today":
    case "unspecified":
    default:
      return base;
  }
}

const DE_WD_SHORT: Record<number, string> = {
  0: "So",
  1: "Mo",
  2: "Di",
  3: "Mi",
  4: "Do",
  5: "Fr",
  6: "Sa",
};

function formatDeSessionHeading(isoYmd: string): string {
  const d = new Date(`${isoYmd.slice(0, 10)}T12:00:00`);
  if (!Number.isFinite(d.getTime())) return isoYmd;
  const wd = DE_WD_SHORT[d.getDay()] ?? "";
  const DD = String(d.getDate()).padStart(2, "0");
  const MM = String(d.getMonth() + 1).padStart(2, "0");
  return `${wd} ${DD}.${MM}.`;
}

/** When no fixed calendar day: find sessions matching type hints in [today … today+7]. */
function findSourceInWindowByHints(
  plan: AiContext["plan"],
  todayIso: string,
  typeHints: string[],
):
  | { kind: "single"; dateIso: string; session: AiPlanSession }
  | { kind: "ambiguous"; text: string }
  | { kind: "none"; text: string } {
  const base = todayIso.slice(0, 10);
  const hints = typeHints.map((h) => h.toLowerCase());
  if (!hints.length) return { kind: "none", text: "Für welchen Tag meinst du das Training?" };

  const matched: AiPlanSession[] = [];
  for (let i = 0; i <= 7; i++) {
    const cand = addDaysIso(base, i);
    const s = pickSourceSessionForReplace({ plan, dateIso: cand, typeHints: hints });
    if (s) matched.push(s);
  }

  if (matched.length === 0) {
    return {
      kind: "none",
      text: "An welchem Datum steht die gewünschte Einheit? Nenn z. B. «heute», «morgen» oder ein konkretes Datum.",
    };
  }
  if (matched.length === 1) {
    const iso = calendarIsoFromSession(matched[0]);
    if (!iso) return { kind: "none", text: "Ich kann das Datum der Einheit nicht lesen — bitte nenne den Tag erneut mit Datum." };
    return { kind: "single", dateIso: iso, session: matched[0] };
  }

  const uniq = new Map<string, AiPlanSession>();
  for (const s of matched) {
    const k = calendarIsoFromSession(s) ?? s.id;
    if (!uniq.has(k)) uniq.set(k, s);
  }
  const list = Array.from(uniq.values());
  if (list.length === 1) {
    const s = list[0]!;
    const iso = calendarIsoFromSession(s);
    if (!iso) return { kind: "none", text: "Ich kann das Datum der Einheit nicht lesen — bitte nenne den Tag erneut mit Datum." };
    return { kind: "single", dateIso: iso, session: s };
  }

  const label = (t: string) => {
    if (t === "interval") return "Intervalltraining";
    if (t === "tempo") return "Tempotraining";
    if (t === "long") return "Long Run";
    return "Training";
  };
  const typeLabel = hints.includes("interval") ? label("interval") : hints.includes("tempo") ? label("tempo") : "Passende Einheit";

  const headings = list
    .map((s) => calendarIsoFromSession(s))
    .filter(Boolean)
    .map((iso) => formatDeSessionHeading(iso as string));

  const pretty = headings.length ? headings.join(" und ") : list.map((s) => s.day).join(" und ");
  return {
    kind: "ambiguous",
    text: `Du hast ${typeLabel} ${pretty} — welches meinst du?`,
  };
}

function hintFoundLabelGerman(hints: string[]): string {
  const h = hints.map((x) => x.toLowerCase());
  if (h.includes("interval")) return "Intervalltraining";
  if (h.includes("tempo")) return "Tempotraining";
  if (h.includes("long")) return "Long Run";
  if (h.includes("bike")) return "Rennrad-Training";
  if (h.includes("strength")) return "Krafttraining";
  if (h.includes("easy")) return "Easy Run";
  return "Training";
}

export type ResolveReplaceWorkoutResult =
  | { status: "clarify"; text: string }
  | { status: "error"; text: string }
  | {
      status: "ok";
      sourceDateIso: string;
      sourceSession: AiPlanSession | null;
      previewAfter: AiPlanSession;
      coachFeedback: string;
      confidence: ReplaceWorkoutExtraction["confidence"];
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

export function resolveReplaceWorkoutProposal(raw: string, context: AiContext): ResolveReplaceWorkoutResult {
  const extraction = extractReplaceWorkoutIntent(raw, { todayIso: context.todayIso });
  if (extraction.needsClarification && extraction.clarifyingQuestion) {
    return { status: "clarify", text: extraction.clarifyingQuestion };
  }

  const targetType = extraction.targetType;
  if (!targetType) {
    return {
      status: "clarify",
      text: "Womit genau soll ich die Einheit ersetzen (z. B. 10 km easy, Ruhetag, Intervall)?",
    };
  }

  let dateIso = resolveReplaceCalendarIso(extraction, context.todayIso);
  let sourceSession: AiPlanSession | null = null;
  let foundInWindowLine = "";

  const useWindow =
    extraction.sourceAnchor === "unspecified" &&
    !extraction.sourceIsoHint &&
    extraction.sourceTypeHints.length > 0;

  if (useWindow) {
    const w = findSourceInWindowByHints(context.plan, context.todayIso, extraction.sourceTypeHints);
    if (w.kind === "ambiguous" || w.kind === "none") {
      return { status: "clarify", text: w.text };
    }
    dateIso = w.dateIso;
    sourceSession = w.session;
    foundInWindowLine = `Ich habe dein ${hintFoundLabelGerman(extraction.sourceTypeHints)} am ${formatDeSessionHeading(w.dateIso)} gefunden. `;
  } else {
    sourceSession = pickSourceSessionForReplace({
      plan: context.plan,
      dateIso,
      typeHints: extraction.sourceTypeHints,
    });
  }

  if (!sourceSession) {
    return {
      status: "error",
      text:
        "An diesem Tag finde ich keine Einheit im Plan — ich kann hier nur bestehende Sessions ersetzen. Nenne einen Tag mit eingetragenem Training oder leg die Einheit zuerst in der Wochenansicht an.",
    };
  }

  const templateSession =
    findClosestSessionByType(context.plan, targetType, dateIso) ??
    (sourceSession.type === targetType ? sourceSession : null);

  const built = buildReplacementWorkout({
    extraction,
    sourceSession,
    templateSession,
    targetCalendarIso: dateIso,
  });

  if (built.needsClarification && built.clarifyingQuestion) {
    return { status: "clarify", text: built.clarifyingQuestion };
  }

  const mergedPreview = mergePreviewSession(sourceSession, built.fields);
  let coachFeedback = buildReplaceWorkoutCoachFeedbackGerman({
    before: sourceSession,
    afterType: mergedPreview.type,
    afterTitle: mergedPreview.title,
    raceDateIso: context.raceDateIso,
    sessionDateIso: dateIso,
    todayIso: context.todayIso,
  });
  coachFeedback = `${foundInWindowLine}${coachFeedback}`;
  if (built.usedPlanTemplateFallbackNote && mergedPreview.type === "easy") {
    coachFeedback =
      `${coachFeedback} Ich habe einen Standard-Easy-Run von ${mergedPreview.km} km erstellt, da kein ähnliches Training im Plan war.`;
  }

  const action: AiAssistantAction = {
    type: "replace_workout",
    payload: {
      sessionId: sourceSession.id,
      targetDateIso: dateIso,
      newSession: built.fields,
    },
  };

  return {
    status: "ok",
    sourceDateIso: dateIso,
    sourceSession,
    previewAfter: mergedPreview,
    coachFeedback,
    confidence: extraction.confidence,
    action,
  };
}
