/**
 * Konservativer Abgleich: geplante Laufeinheit (Kalendertag) vs. Apple-Health-Läufe am selben Tag.
 * Nur Lesen / Heuristik — keine Log-Mutation. Nutzt dieselbe Session-Typ-Logik wie matchRunToPlannedSession.
 */

import { normalizeCalendarDay, parseSessionDateLabel } from "../appSmartFeatures";
import type { PlanSession } from "../marathonPrediction";
import type { StoredHealthRun } from "../healthRuns";
import { normalizeAppleHealthRun } from "../trainingIntelligence/normalizeAppleHealthRun";
import { evaluateRun } from "../trainingIntelligence/evaluateRun";
import { generateRunEvaluationFeedback } from "../trainingIntelligence/generateRunEvaluationFeedback";

const RUNNING_TYPES = new Set(["easy", "long", "interval", "tempo", "race"]);

function sessionLocalYmd(session: PlanSession): string | null {
  const pd = parseSessionDateLabel(session.date);
  if (!pd) return null;
  const x = normalizeCalendarDay(pd);
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, "0");
  const d = String(x.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function localYmdFromRunStart(iso: string): string | null {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  const d = new Date(t);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function isRunningPlanSession(s: PlanSession): boolean {
  return RUNNING_TYPES.has(s.type);
}

export type TodayAppleCoachKind =
  | "skip_non_ios"
  | "health_unavailable"
  | "health_checking"
  | "not_connected"
  | "not_today_session"
  | "non_run_day"
  | "no_run_today"
  | "no_confident_match"
  | "preview_compare"
  | "defer_to_log";

/** Kompakte Zeilen für Startscreen / Coach-Karte (ohne neue UI-Flächen). */
export type TodayAppleCoachLines = {
  kind: TodayAppleCoachKind;
  /** Hauptzeile unter der Überschrift */
  summary: string;
  /** Optional zweite Zeile */
  detail?: string;
  /** Start: „Apple Health verbinden“ sinnvoll */
  showConnectHint?: boolean;
};

function kmFromStored(r: StoredHealthRun): number {
  return Math.max(0, (r.distanceMeters || 0) / 1000);
}

/**
 * @param todaySessionMode — nur bei `"today"` ist ein Tagesabgleich mit „heute“ gemeint (siehe getTodayNextSession).
 */
export function buildTodayAppleCoachLines(input: {
  platform: string;
  healthKitAvailable: boolean | null;
  isHealthConnected: boolean;
  healthRuns: StoredHealthRun[];
  plannedSession: PlanSession | null;
  todaySessionMode: "today" | "next" | null;
  /**
   * Keine Apple-Vorschau, wenn Log schon Health-Zuordnung / Suggest / Auswertungstext führt
   * (sonst doppelte oder widersprüchliche Hinweise).
   */
  deferAppleHealthPreview: boolean;
  todayCalendarYmd: string;
}): TodayAppleCoachLines {
  const {
    platform,
    healthKitAvailable,
    isHealthConnected,
    healthRuns,
    plannedSession,
    todaySessionMode,
    deferAppleHealthPreview,
    todayCalendarYmd,
  } = input;

  if (platform !== "ios") {
    return { kind: "skip_non_ios", summary: "" };
  }

  if (deferAppleHealthPreview) {
    return { kind: "defer_to_log", summary: "" };
  }

  if (healthKitAvailable === false) {
    return {
      kind: "health_unavailable",
      summary: "Apple Health ist auf diesem Gerät nicht verfügbar.",
    };
  }

  if (healthKitAvailable === null) {
    return { kind: "health_checking", summary: "Apple Health wird geprüft …" };
  }

  if (!isHealthConnected) {
    return {
      kind: "not_connected",
      summary: "Apple Health noch nicht verbunden.",
      detail: "Tippe unten auf „Apple Health verbinden“, um Läufe zu lesen.",
      showConnectHint: true,
    };
  }

  if (todaySessionMode !== "today" || !plannedSession) {
    return {
      kind: "not_today_session",
      summary: "Heute kein Laufvergleich nötig (Fokus: nächste Einheit oder kein Training heute).",
    };
  }

  if (!isRunningPlanSession(plannedSession)) {
    return {
      kind: "non_run_day",
      summary: "Heute kein Laufvergleich nötig (keine Laufeinheit geplant).",
    };
  }

  const sessionYmd = sessionLocalYmd(plannedSession);
  if (!sessionYmd || sessionYmd !== todayCalendarYmd) {
    return {
      kind: "not_today_session",
      summary: "Heute kein Laufvergleich nötig.",
    };
  }

  const sameDay = healthRuns.filter((r) => localYmdFromRunStart(r.startDate) === todayCalendarYmd);
  const candidates = sameDay.filter((r) => {
    const km = kmFromStored(r);
    const dur = Number(r.duration) || 0;
    return km >= 0.4 || dur >= 300;
  });

  if (candidates.length === 0) {
    return {
      kind: "no_run_today",
      summary: "Verbunden — heute kein Lauf-Workout in Apple Health.",
    };
  }

  const plannedKm = plannedSession.km > 0 ? plannedSession.km : 0;
  let pool = candidates;
  if (plannedKm > 0) {
    const lo = plannedKm * 0.72;
    const hi = plannedKm * 1.28;
    pool = candidates.filter((r) => {
      const k = kmFromStored(r);
      return k >= lo && k <= hi;
    });
  } else {
    pool = candidates.filter((r) => kmFromStored(r) >= 3);
  }

  if (plannedKm <= 0 && pool.length > 1) {
    return {
      kind: "no_confident_match",
      summary: "Verbunden — mehrere Läufe heute, ohne Plan-Kilometer kein sicherer Abgleich.",
    };
  }

  if (pool.length === 0) {
    return {
      kind: "no_confident_match",
      summary: "Verbunden — kein Lauf passt konservant zur heutigen Plan-Distanz.",
      detail: "In Einstellungen kannst du einen Lauf manuell zuordnen.",
    };
  }

  pool.sort((a, b) => {
    const da = plannedKm > 0 ? Math.abs(kmFromStored(a) - plannedKm) : kmFromStored(a);
    const db = plannedKm > 0 ? Math.abs(kmFromStored(b) - plannedKm) : kmFromStored(b);
    return da - db;
  });

  const best = pool[0];
  const second = pool[1];
  if (second && plannedKm > 0) {
    const d1 = Math.abs(kmFromStored(best) - plannedKm);
    const d2 = Math.abs(kmFromStored(second) - plannedKm);
    if (Math.abs(d1 - d2) < 0.35) {
      return {
        kind: "no_confident_match",
        summary: "Verbunden — mehrere ähnliche Läufe heute, kein sicherer Treffer.",
      };
    }
  }

  const norm = normalizeAppleHealthRun(best);
  const evaluation = evaluateRun(plannedSession, norm);
  const { text: feedback } = generateRunEvaluationFeedback(evaluation);
  const actualKm = Math.round(kmFromStored(best) * 10) / 10;
  const plannedLabel = plannedKm > 0 ? `${plannedKm} km` : "Plan";
  const durMin = Math.round((Number(best.duration) || 0) / 60);

  return {
    kind: "preview_compare",
    summary: `Apple Health: ${actualKm} km · geplant ${plannedLabel}.`,
    detail: `${feedback}${durMin > 0 ? ` · ca. ${durMin} Min.` : ""}`,
  };
}
