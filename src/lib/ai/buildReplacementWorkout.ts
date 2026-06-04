import { parseSessionDateLabel } from "../../appSmartFeatures";
import type { ReplaceWorkoutExtraction } from "../../ai/intents/extractReplaceWorkoutIntent";
import type { AiPlanSession, AiPlanWeek, SessionType } from "./types";

export function calendarIsoFromSession(session: AiPlanSession): string | null {
  const d = parseSessionDateLabel(session.date);
  if (!d || !Number.isFinite(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function findClosestSessionByType(
  plan: AiPlanWeek[],
  targetType: SessionType,
  refIso: string,
): AiPlanSession | null {
  const ref = new Date(`${refIso}T12:00:00`);
  const refMs = ref.getTime();
  if (!Number.isFinite(refMs)) return null;

  const candidates = plan.flatMap((w) => w.s).filter((s) => s.type === targetType);
  if (!candidates.length) return null;

  /** Prefer next future session, then nearest past (not absolute distance). */
  candidates.sort((a, b) => {
    const da = parseSessionDateLabel(a.date)?.getTime() ?? 0;
    const db = parseSessionDateLabel(b.date)?.getTime() ?? 0;
    const aFuture = da >= refMs;
    const bFuture = db >= refMs;
    if (aFuture !== bFuture) return aFuture ? -1 : 1;
    if (aFuture) return da - db;
    return db - da;
  });
  return candidates[0] ?? null;
}

function paceForEasyExplicitKm(km: number): string {
  const paceMidMinPerKm = 5.35;
  const delta = 0.18;
  const fmt = (minPerKm: number) => {
    const totalSec = Math.round(minPerKm * 60);
    const mm = Math.floor(totalSec / 60);
    const ss = totalSec % 60;
    return `${mm}:${String(ss).padStart(2, "0")}`;
  };
  return `${fmt(paceMidMinPerKm - delta)}–${fmt(paceMidMinPerKm + delta)}/km`;
}

function defaultEasyDistanceKm(source: AiPlanSession | null, template: AiPlanSession | null): number {
  const capFromSource =
    source && source.type === "bike"
      ? 12
      : source && ["interval", "tempo", "long"].includes(source.type)
        ? 12
        : 10;
  const tpl = template?.km && template.km > 0 ? Math.round(template.km) : 8;
  return Math.min(capFromSource, Math.max(6, tpl));
}

function trimEasyClone(sourceKm: number | undefined, vagueEasy: boolean): number {
  if (!sourceKm || sourceKm <= 0) return 8;
  if (vagueEasy && sourceKm > 14) return Math.round(sourceKm * 0.55);
  return Math.round(sourceKm);
}

export type ReplacementSessionBuild = {
  fields: Partial<AiPlanSession>;
  needsClarification: boolean;
  clarifyingQuestion?: string;
  /** True when defaults were used because no comparable session existed in plan. */
  usedPlanTemplateFallbackNote?: boolean;
};

/**
 * Builds `Partial<AiPlanSession>` merged onto an existing row (id/day/date unchanged by caller).
 */
export function buildReplacementWorkout(args: {
  extraction: ReplaceWorkoutExtraction;
  sourceSession: AiPlanSession | null;
  templateSession: AiPlanSession | null;
  /** YYYY-MM-DD — used for template lookup + vague defaults */
  targetCalendarIso: string;
}): ReplacementSessionBuild {
  const { extraction, sourceSession, templateSession, targetCalendarIso } = args;

  if (extraction.needsClarification && extraction.clarifyingQuestion) {
    return {
      fields: {},
      needsClarification: true,
      clarifyingQuestion: extraction.clarifyingQuestion,
    };
  }

  const targetType = extraction.targetType;
  if (!targetType) {
    return {
      fields: {},
      needsClarification: true,
      clarifyingQuestion: "Meinst du einen lockeren Lauf oder eher Tempo/Intervalle?",
    };
  }

  const vagueEasy =
    extraction.raw.toLowerCase().includes("lieber") &&
    extraction.raw.toLowerCase().includes("locker") &&
    targetType === "easy";

  let km = extraction.targetDistanceKm;
  let durationMin = extraction.targetDurationMin;

  if (targetType === "easy") {
    if (!km && templateSession?.km) {
      const rawClone = trimEasyClone(templateSession.km, vagueEasy);
      km = Math.min(12, rawClone);
    }
    if (!km && sourceSession?.km && ["easy", "tempo", "interval", "long"].includes(sourceSession.type)) {
      km = trimEasyClone(sourceSession.km, vagueEasy);
    }
    if (!km) km = defaultEasyDistanceKm(sourceSession, templateSession);
    const usedPlanTemplateFallbackNote =
      !templateSession && !extraction.targetDistanceKm && !extraction.targetDurationMin;

    if (!durationMin) durationMin = Math.round((km / 6) * 60);

    const title = km ? `Easy Run ${km} km` : "Easy Run";
    const pace = extraction.targetDistanceKm ? paceForEasyExplicitKm(extraction.targetDistanceKm) : "5:15–5:45/km";
    const desc = `ca. ${durationMin} min · Zone 2 (~130–155 bpm wenn du HF grob kennst).`;

    const clarifyEasy =
      !templateSession &&
      !extraction.targetDistanceKm &&
      !extraction.targetDurationMin &&
      extraction.confidence === "low";

    if (clarifyEasy) {
      return {
        fields: {},
        needsClarification: true,
        clarifyingQuestion: "Wie weit oder wie lange willst du locker laufen?",
      };
    }

    return {
      fields: {
        type: "easy",
        km,
        title,
        pace,
        desc: desc || "Lockerer Dauerlauf.",
      },
      needsClarification: false,
      usedPlanTemplateFallbackNote,
    };
  }

  if (targetType === "long") {
    if (!km) km = templateSession?.km && templateSession.km >= 14 ? Math.round(templateSession.km) : 18;
    if (!durationMin) durationMin = Math.round((km / 5.7) * 60);
    return {
      fields: {
        type: "long",
        km,
        title: `Long Run ${km} km`,
        pace: "5:10–5:35/km",
        desc: `ca. ${durationMin} min · gleichmäßig easy.`,
      },
      needsClarification: false,
    };
  }

  if (targetType === "tempo") {
    if (!km) km = templateSession?.km && templateSession.km >= 8 ? Math.round(templateSession.km * 0.85) : 10;
    if (!durationMin) durationMin = Math.round((km / 4.5) * 60);
    return {
      fields: {
        type: "tempo",
        km,
        title: `Tempo ${km} km`,
        pace: "≈ Marathon-/halbmarathon-spezifisch kontrolliert",
        desc: `Einheit ~${durationMin} min — nur wenn du dich erholt fühlst.`,
      },
      needsClarification: false,
    };
  }

  if (targetType === "interval") {
    const structure = extraction.targetStructure;
    if (structure) {
      const mp = /^(\d+)x(\d+)m$/.exec(structure);
      const reps = mp ? Number(mp[1]) : 0;
      const meters = mp ? Number(mp[2]) : 0;
      const intervalKm = reps && meters ? (reps * meters) / 1000 : 10;
      const totalKm = intervalKm + 3;
      const title = `Intervall ${structure}`;
      const desc = `${structure} @ etwa 10km-Wettkampftempo, 400m Trabpause — Warm-up/Cool-down grob im Kilometer enthalten.`;
      return {
        fields: {
          type: "interval",
          km: Math.round(totalKm * 10) / 10,
          title,
          pace: "hart / kontrolliert",
          desc,
        },
        needsClarification: false,
      };
    }

    if (!km) km = templateSession?.km && templateSession.km > 0 ? Math.round(templateSession.km) : 10;
    if (!durationMin) durationMin = 65;
    return {
      fields: {
        type: "interval",
        km,
        title: templateSession?.title?.includes("Intervall") ? templateSession.title : `Intervall ~${km} km`,
        pace: "intervalle",
        desc: `Qualitätseinheit ~${durationMin} min — Details kannst du beim Bestätigen noch lesen.`,
      },
      needsClarification: false,
    };
  }

  if (targetType === "strength") {
    const mins = extraction.targetDurationMin ?? 45;
    return {
      fields: {
        type: "strength",
        km: 0,
        title: "Krafttraining (Gym)",
        pace: null,
        desc: `ca. ${mins} min Ganzkörper / funktionell.`,
      },
      needsClarification: false,
    };
  }

  if (targetType === "bike") {
    const mins = extraction.targetDurationMin ?? 60;
    return {
      fields: {
        type: "bike",
        km: 0,
        title: `Rennrad ${mins} min`,
        pace: "locker–moderat",
        desc: `Ausdauer auf dem Rad ~${mins} min · Zone 2.`,
      },
      needsClarification: false,
    };
  }

  if (targetType === "rest") {
    return {
      fields: {
        type: "rest",
        km: 0,
        title: "Ruhetag",
        pace: null,
        desc: "Regeneration — optional leichtes Mobilisationstraining.",
      },
      needsClarification: false,
    };
  }

  if (targetType === "race") {
    return {
      fields: {
        type: "race",
        km: km ?? 42,
        title: extraction.raw.toLowerCase().includes("halb") ? "Halbmarathon" : "Marathon / Race",
        pace: "wettkampftempo",
        desc: "Wettkampftag — nur wenn das wirklich dein Rennen ist.",
      },
      needsClarification: false,
    };
  }

  return {
    fields: {},
    needsClarification: true,
    clarifyingQuestion: "Welche Art Training soll es genau werden?",
  };
}

export function pickSourceSessionForReplace(args: {
  plan: AiPlanWeek[];
  dateIso: string;
  typeHints: string[];
}): AiPlanSession | null {
  const { plan, dateIso, typeHints } = args;
  const daySessions = plan.flatMap((w) => w.s).filter((s) => calendarIsoFromSession(s) === dateIso);
  if (!daySessions.length) return null;

  const hints = typeHints.map((h) => h.toLowerCase());
  if (hints.length) {
    const matched = daySessions.filter((s) => hints.includes(s.type));
    if (matched.length === 1) return matched[0];
    if (matched.length > 1) return null;
    return null;
  }

  const nonRest = daySessions.filter((s) => s.type !== "rest");
  if (nonRest.length === 1) return nonRest[0];
  if (daySessions.length === 1) return daySessions[0];
  return null;
}
