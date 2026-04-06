import { parseSessionDateLabel } from "../../appSmartFeatures";
import type {
  AiActionExecution,
  AiActionPreview,
  AiAssistantAction,
  AiContext,
  AiPlanSession,
  AiPlanWeek,
  PlanPatch,
} from "./types";

const HARD_TYPES = new Set(["interval", "tempo", "race"]);
const DE_WEEKDAYS = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
const DE_MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];

function getSessionDate(session: AiPlanSession): Date | null {
  return parseSessionDateLabel(session.date);
}

function sortByDateAscending(a: AiPlanSession, b: AiPlanSession): number {
  const aDate = getSessionDate(a)?.getTime() ?? Number.MAX_SAFE_INTEGER;
  const bDate = getSessionDate(b)?.getTime() ?? Number.MAX_SAFE_INTEGER;
  return aDate - bDate;
}

function getUpcomingSessions(context: AiContext, onlyOpen = true): AiPlanSession[] {
  const now = new Date(context.todayIso);
  const all = context.plan.flatMap((week) => week.s);
  return all
    .filter((session) => {
      const date = getSessionDate(session);
      if (!date) return false;
      if (date < now) return false;
      if (!onlyOpen) return true;
      return !context.logs?.[session.id]?.done;
    })
    .sort(sortByDateAscending);
}

function formatDateLabel(date: Date): string {
  return `${date.getDate()}. ${DE_MONTHS[date.getMonth()]}`;
}

function shiftSessionDate(session: AiPlanSession, shiftDays: number): Partial<AiPlanSession> {
  const date = getSessionDate(session);
  if (!date) return {};
  const shifted = new Date(date);
  shifted.setDate(shifted.getDate() + shiftDays);
  return {
    day: DE_WEEKDAYS[shifted.getDay()],
    date: formatDateLabel(shifted),
  };
}

function buildIllnessPatches(context: AiContext): PlanPatch[] {
  const upcoming = getUpcomingSessions(context).filter((session) => session.type !== "rest").slice(0, 4);
  if (upcoming.length === 0) return [];
  const patches: PlanPatch[] = [];
  const first = upcoming[0];
  const second = upcoming[1];
  const third = upcoming[2];
  const fourth = upcoming[3];
  if (first) {
    patches.push({
      sessionId: first.id,
      changes: {
        type: "rest",
        km: 0,
        title: "Ruhetag (Krankheit)",
        desc: "Fokus auf Erholung und Schlaf. Kein Leistungsdruck.",
        pace: null,
      },
      reason: "Konservative Entlastung zu Beginn",
    });
  }
  if (second && HARD_TYPES.has(second.type)) {
    patches.push({
      sessionId: second.id,
      changes: {
        type: "easy",
        km: Math.max(5, Math.min(8, Math.round((second.km || 8) * 0.55))),
        title: "Lockerer Wiedereinstieg",
        desc: "Nur wenn symptomfrei: sehr locker laufen, Puls niedrig halten.",
        pace: "sehr locker",
      },
      reason: "Harte Einheit durch lockere Belastung ersetzt",
    });
  }
  if (third) {
    patches.push({
      sessionId: third.id,
      changes: {
        type: "easy",
        km: Math.max(6, Math.min(10, Math.round((third.km || 10) * 0.7))),
        title: "Easy Run (kontrolliert)",
        desc: "Locker-moderat, nur steigern wenn es sich stabil anfühlt.",
        pace: "locker",
      },
      reason: "Sanfter Aufbau nach Krankheit",
    });
  }
  if (fourth && HARD_TYPES.has(fourth.type)) {
    patches.push({
      sessionId: fourth.id,
      changes: {
        type: "tempo",
        km: Math.max(8, Math.min(12, Math.round((fourth.km || 12) * 0.75))),
        title: "Kontrollierter Temporeiz",
        desc: "Nur moderater Reiz, keine volle Härte.",
        pace: "kontrolliert",
      },
      reason: "Wiedereinstieg statt Vollgas",
    });
  }
  return patches;
}

function buildBikeReplacementPatches(context: AiContext): PlanPatch[] {
  const upcoming = getUpcomingSessions(context);
  const bike = upcoming.find((session) => session.type === "bike");
  if (!bike) return [];
  return [
    {
      sessionId: bike.id,
      changes: {
        type: "easy",
        km: 7,
        title: "Ersatzlauf 40 min locker",
        desc: "Rennrad-Einheit ersetzt durch entspannten Lauf im Wohlfühltempo.",
        pace: "5:20-5:40/km",
      },
      reason: "Bike-Einheit wurde ersetzt",
    },
  ];
}

function buildShiftRaceDatePatches(context: AiContext, payload: Record<string, any>): PlanPatch[] {
  const shiftDays = Number(payload?.shiftDays ?? 7);
  const upcoming = getUpcomingSessions(context, false);
  return upcoming.map((session) => ({
    sessionId: session.id,
    changes: shiftSessionDate(session, shiftDays),
    reason: `Renntermin um ${shiftDays} Tage verschoben`,
  }));
}

function buildShiftPlanStartDatePatches(context: AiContext, payload: Record<string, any>): PlanPatch[] {
  const requestedOffset = Number(payload?.requestedStartOffsetDays ?? payload?.shiftDays ?? 4);
  const shiftDays = Number.isFinite(requestedOffset) ? Math.max(1, Math.min(21, requestedOffset)) : 4;
  const upcoming = getUpcomingSessions(context);
  if (!upcoming.length) return [];

  const patches = upcoming.map((session) => ({
    sessionId: session.id,
    changes: shiftSessionDate(session, shiftDays),
    reason: `Trainingsstart um ${shiftDays} Tage verschoben`,
  }));

  const firstTraining = upcoming.find((session) => session.type !== "rest");
  if (firstTraining) {
    patches.push({
      sessionId: firstTraining.id,
      changes: {
        type: "rest",
        km: 0,
        title: "Zusatz-Ruhetag (verspaeteter Start)",
        desc: "Start bewusst konservativ halten und Belastung langsam aufbauen.",
        pace: null,
      },
      reason: "Verspaeteter Einstieg",
    });
  }

  const firstHard = upcoming.find((session) => HARD_TYPES.has(session.type));
  if (firstHard) {
    patches.push({
      sessionId: firstHard.id,
      changes: {
        type: "easy",
        km: Math.max(6, Math.min(10, Math.round((firstHard.km || 10) * 0.7))),
        title: "Easy Run statt harter Einheit",
        desc: "Wiedereinstieg ruhig halten, danach normal in den Rhythmus.",
        pace: "locker",
      },
      reason: "Erste harte Einheit ersetzt",
    });
  }

  return patches;
}

function resolveActionPatches(action: AiAssistantAction, context: AiContext): PlanPatch[] {
  if (action.type === "adjust_plan_for_illness") return buildIllnessPatches(context);
  if (action.type === "replace_bike_with_run") return buildBikeReplacementPatches(context);
  if (action.type === "shift_race_date") return buildShiftRaceDatePatches(context, action.payload);
  if (action.type === "shift_plan_start_date") return buildShiftPlanStartDatePatches(context, action.payload);
  return [];
}

function toPreviewItems(context: AiContext, patches: PlanPatch[]): string[] {
  if (patches.length === 0) return ["Keine konkrete Änderung gefunden. Ich bleibe bei einem konservativen Vorschlag."];
  const byId = new Map(context.plan.flatMap((week) => week.s).map((session) => [session.id, session] as const));
  return patches.slice(0, 5).map((patch) => {
    const base = byId.get(patch.sessionId);
    const day = patch.changes.day || base?.day || "Tag";
    const beforeTitle = base?.title || "Einheit";
    const afterTitle = patch.changes.title || beforeTitle;
    if (patch.changes.date) {
      return `${day}: ${afterTitle} (${patch.changes.date})`;
    }
    return `${day}: ${afterTitle} statt ${beforeTitle}`;
  });
}

export function buildActionPreview(action: AiAssistantAction, context: AiContext): AiActionPreview | undefined {
  if (action.type === "navigate_to_screen") {
    const target = action.payload?.targetScreenLabel || action.payload?.targetScreen || "Bereich";
    const section = action.payload?.sectionLabel || action.payload?.section || null;
    return {
      title: "Navigation",
      items: [section ? `Ziel: ${target} (${section})` : `Ziel: ${target}`],
      confirmLabel: "Oeffnen",
      cancelLabel: "Abbrechen",
    };
  }
  if (action.type === "explain_feature") return undefined;
  if (action.type === "shift_plan_start_date") {
    const shiftDays = Number(action.payload?.requestedStartOffsetDays ?? action.payload?.shiftDays ?? 4);
    const items = [
      `Trainingsstart um ${Number.isFinite(shiftDays) ? shiftDays : 4} Tage verschoben`,
      "Erste harte Einheit wird durch lockeren Wiedereinstieg ersetzt",
      "Planstruktur bleibt erhalten",
    ];
    return {
      title: "Vorgeschlagene Anpassung",
      items,
      confirmLabel: "Uebernehmen",
      secondaryLabel: "Bearbeiten",
      cancelLabel: "Abbrechen",
    };
  }
  const patches = resolveActionPatches(action, context);
  return {
    title: "Vorgeschlagene Anpassung",
    items: toPreviewItems(context, patches),
    confirmLabel: "Uebernehmen",
    secondaryLabel: "Bearbeiten",
    cancelLabel: "Abbrechen",
  };
}

export function executeAiAction(action: AiAssistantAction, context: AiContext): AiActionExecution {
  if (action.type === "navigate_to_screen") {
    const targetScreen = action.payload?.targetScreen || "home";
    return {
      mode: "navigator",
      message: "Navigation wird geoeffnet.",
      navigation: {
        targetScreen,
        section: action.payload?.section || undefined,
      },
    };
  }
  if (action.type === "explain_feature") {
    return {
      mode: "support",
      message: "Ich habe nur erklaert und nichts am Plan veraendert.",
    };
  }
  const planPatches = resolveActionPatches(action, context);
  if (!planPatches.length) {
    return {
      mode: "coach",
      message: "Ich habe keine sichere Aenderung gefunden. Lass uns den Wunsch genauer eingrenzen.",
    };
  }
  return {
    mode: "coach",
    message: `${planPatches.length} Plananpassung(en) vorbereitet.`,
    planPatches,
  };
}

export function applyPlanPatches(plan: AiPlanWeek[], patches: PlanPatch[]): AiPlanWeek[] {
  if (!patches.length) return plan;
  const patchById = new Map(patches.map((patch) => [patch.sessionId, patch.changes]));
  return plan.map((week) => ({
    ...week,
    s: week.s.map((session) => {
      const changes = patchById.get(session.id);
      if (!changes) return session;
      return { ...session, ...changes };
    }),
  }));
}
