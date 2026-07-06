/**
 * Plan targets (pace, distance, HR zones) and Plan-vs-Ist deviation strings for UI.
 */

import type { PlanSession, PlanWeek, SessionLog } from "../marathonPrediction";
import { getDisplayPlannedDistanceKm, getSessionPlannedDistanceKm } from "../sessionDistance";
import { isSessionLogDone, parseSessionDateLabel } from "../appSmartFeatures";
import type { StoredHealthRun } from "../healthRuns";
import { storedHealthRunDistanceKmNumeric } from "../healthRuns";
import { parsePlannedPaceMinPerKm } from "./evaluateRun";
import { normalizeAppleHealthRun } from "./normalizeAppleHealthRun";

const RUNNING_TYPES = new Set(["easy", "long", "interval", "tempo", "race"]);

/** Home „Coach & Details“: nur feste Statuszeilen — keine dynamischen Sätze, kein AI-Text. */
const COACH_CARD_FIXED = {
  KORRIDOR: "Im Zielkorridor",
  SEHR_GUT: "Sehr gut",
  EINHEIT: "Einheit im geplanten Bereich umgesetzt",
  LAUF_ERKANNT: "Lauf erkannt",
  ASSIGN_HINT:
    "Apple Health Lauf erkannt — in Einstellungen „Training wählen“ zum Zuordnen.",
} as const;

export type HomeCoachFixed = {
  chip: string;
  lineA: string | null;
  lineB: string | null;
  /** Nur bei ausstehender Health-Zuordnung — fester Hinweistext */
  assignHint: string | null;
};

/** Festes UI-Präfix für verknüpfte Läufe (kein evaluationStatusLabel-Freitext). */
export function getWeekLinkedRunFixedPrefix(runEvaluationStatus: string | undefined): string {
  if (!runEvaluationStatus || runEvaluationStatus === "no_match") return "";
  return COACH_CARD_FIXED.KORRIDOR;
}

/**
 * Regelbasierte Coach-Kartenzeilen aus Auswertungskategorie / Kontext.
 * Keine dynamischen Sätze aus Modell oder Apple-Zusammenfassung.
 */
export function getHomeCoachAssessmentFixedCopy(args: {
  runEvaluationStatus?: string;
  trainingLoadStatus: "green" | "yellow" | "red";
  appleCoachKind: string;
  healthSuggestPending: boolean;
  dashboardDone: boolean;
  dashboardHealthDone: boolean;
  deferApplePreview: boolean;
}): HomeCoachFixed {
  const ev = args.runEvaluationStatus;
  const S = COACH_CARD_FIXED;
  const none = { lineA: null as string | null, lineB: null as string | null, assignHint: null as string | null };

  if (args.healthSuggestPending) {
    return { chip: S.LAUF_ERKANNT, ...none, assignHint: S.ASSIGN_HINT };
  }

  if (ev === "ideal" || ev === "ideal_distance_only") {
    return { chip: S.KORRIDOR, lineA: S.SEHR_GUT, lineB: S.EINHEIT, assignHint: null };
  }
  if (ev && ev !== "no_match") {
    return { chip: S.KORRIDOR, lineA: S.EINHEIT, lineB: null, assignHint: null };
  }
  if (ev === "no_match") {
    return { chip: S.KORRIDOR, ...none };
  }

  if (!args.deferApplePreview && args.appleCoachKind === "preview_compare") {
    return { chip: S.KORRIDOR, lineA: S.SEHR_GUT, lineB: S.EINHEIT, assignHint: null };
  }

  if (args.dashboardDone && args.dashboardHealthDone) {
    return { chip: S.KORRIDOR, lineA: S.SEHR_GUT, lineB: S.EINHEIT, assignHint: null };
  }

  if (args.trainingLoadStatus === "green") {
    return { chip: S.KORRIDOR, lineA: S.SEHR_GUT, lineB: S.EINHEIT, assignHint: null };
  }
  if (args.trainingLoadStatus === "yellow") {
    return { chip: S.KORRIDOR, lineA: S.SEHR_GUT, lineB: null, assignHint: null };
  }
  if (args.trainingLoadStatus === "red") {
    return { chip: S.KORRIDOR, ...none };
  }

  return { chip: S.KORRIDOR, ...none };
}

function sessionTime(session: PlanSession): number {
  const d = parseSessionDateLabel(session.date);
  return d ? d.getTime() : 0;
}

export type SessionTargetLines = {
  pulseLabel: string;
  paceLabel: string;
  distanceLabel: string | null;
};

/** Pace "m:ss" from decimal minutes/km */
export function formatPaceMinPerKmLabel(minPerKm: number): string {
  if (!Number.isFinite(minPerKm) || minPerKm <= 0) return "—";
  const m = Math.floor(minPerKm);
  const s = Math.round((minPerKm - m) * 60);
  const sec = Math.min(59, Math.max(0, s));
  return `${m}:${String(sec).padStart(2, "0")} min/km`;
}

export function parsePlannedPaceRangeMinPerKm(
  pace: string | null | undefined,
): { min: number; max: number } | null {
  const mid = parsePlannedPaceMinPerKm(pace);
  if (mid == null) return null;
  if (pace == null || typeof pace !== "string") return { min: mid, max: mid };
  const t = pace.trim();
  const rangeM = t.match(/(\d{1,2}):(\d{2})\s*[–-]\s*(\d{1,2}):(\d{2})/);
  if (rangeM) {
    const a = Number.parseInt(rangeM[1], 10) + Number.parseInt(rangeM[2], 10) / 60;
    const b = Number.parseInt(rangeM[3], 10) + Number.parseInt(rangeM[4], 10) / 60;
    return { min: Math.min(a, b), max: Math.max(a, b) };
  }
  return { min: mid, max: mid };
}

export function plannedPaceMidMinPerKm(session: PlanSession): number | null {
  const r = parsePlannedPaceRangeMinPerKm(session.pace);
  if (!r) return null;
  return Math.round(((r.min + r.max) / 2) * 100) / 100;
}

function isRecoveryWeek(week?: PlanWeek): boolean {
  if (!week?.focus) return false;
  const f = week.focus.toLowerCase();
  return f.includes("entlastung") || f.includes("recovery");
}

/** %HRmax band [low, high] for deviation mid = average */
function hrPctBandForSessionType(type: string, week?: PlanWeek): { lo: number; hi: number } | null {
  if (type === "easy" && isRecoveryWeek(week)) {
    return { lo: 0.5, hi: 0.6 };
  }
  switch (type) {
    case "easy":
    case "long":
      return { lo: 0.6, hi: 0.75 };
    case "interval":
    case "race":
      return { lo: 0.8, hi: 0.95 };
    case "tempo":
      return { lo: 0.76, hi: 0.88 };
    case "bike":
      return { lo: 0.55, hi: 0.72 };
    default:
      return null;
  }
}

/** BPM band for post-workout scoring (matches interval backfill semantics). */
export function plannedHrRangeForSessionType(
  sessionType: string,
  maxHrBpm?: number | null,
): { min: number; max: number } | null {
  const mh = typeof maxHrBpm === "number" && Number.isFinite(maxHrBpm) && maxHrBpm > 80 ? maxHrBpm : null;
  if (!mh) return null;
  const t = String(sessionType || "").toLowerCase();
  if (t === "easy" || t === "long") return { min: Math.round(mh * 0.65), max: Math.round(mh * 0.78) };
  if (t === "tempo") return { min: Math.round(mh * 0.82), max: Math.round(mh * 0.9) };
  if (t === "interval") return { min: Math.round(mh * 0.88), max: Math.round(mh * 0.95) };
  if (t === "race") return { min: Math.round(mh * 0.9), max: Math.round(mh * 0.97) };
  if (t === "bike") return { min: Math.round(mh * 0.6), max: Math.round(mh * 0.78) };
  return null;
}

/** Post-workout card: planned HR band + zone label from session type and optional HFmax. */
export function getPostWorkoutPlannedHr(
  session: Pick<PlanSession, "type">,
  maxHrBpm?: number | null,
): { hrBpm: { min: number; max: number } | null; hrZoneLabel: string | null } {
  const stub = { type: session.type } as PlanSession;
  return {
    hrBpm: plannedHrRangeForSessionType(session.type, maxHrBpm),
    hrZoneLabel: getSessionHrZoneShort(stub),
  };
}

export function hrZoneMidBpm(session: PlanSession, maxHr: number, week?: PlanWeek): number | null {
  if (!Number.isFinite(maxHr) || maxHr <= 0) return null;
  const band = hrPctBandForSessionType(session.type, week);
  if (!band) return null;
  return Math.round(((band.lo + band.hi) / 2) * maxHr);
}

/** Kurzform für eingeklappte Trainingsziele (z. B. „Zone 2“). */
export function getSessionHrZoneShort(session: PlanSession, week?: PlanWeek): string | null {
  if (session.type === "rest" || session.type === "strength") return null;
  if (session.type === "easy" && isRecoveryWeek(week)) return "Zone 1";
  switch (session.type) {
    case "easy":
    case "long":
    case "bike":
      return "Zone 2";
    case "interval":
    case "race":
      return "Zone 4–5";
    case "tempo":
      return "Zone 3–4";
    default:
      return null;
  }
}

/** %HFmax-Bänder je Zonen-Label — einzige Quelle der Wahrheit, von getSessionTargetLines() und getHrRangeForZone() geteilt. */
const HR_ZONE_PCT_BANDS: Record<string, { lo: number; hi: number }> = {
  "Zone 1": { lo: 0.5, hi: 0.6 },
  "Zone 2": { lo: 0.6, hi: 0.75 },
  "Zone 3–4": { lo: 0.76, hi: 0.88 },
  "Zone 4–5": { lo: 0.8, hi: 0.95 },
};

/**
 * Konkrete BPM-Range für ein Zonen-Label (z. B. „Zone 2“) + `maxHeartRateBpm`.
 * Liefert `null`, wenn die Zone unbekannt ist oder `maxHeartRateBpm` fehlt/ungültig ist
 * (kein Fake-Wert — die Zone wird dann ohne BPM-Range angezeigt).
 */
export function getHrRangeForZone(
  zoneLabel: string | null | undefined,
  maxHeartRateBpm?: number | null,
): { min: number; max: number } | null {
  if (!zoneLabel) return null;
  const band = HR_ZONE_PCT_BANDS[zoneLabel];
  if (!band) return null;
  const mh =
    typeof maxHeartRateBpm === "number" && Number.isFinite(maxHeartRateBpm) && maxHeartRateBpm > 0
      ? maxHeartRateBpm
      : null;
  if (!mh) return null;
  return { min: Math.round(band.lo * mh), max: Math.round(band.hi * mh) };
}

/**
 * Eine kompakte Vorschau: HF-Zone bevorzugt, sonst Tempo-Spanne / Freitext aus Plan.
 */
export function getSessionTargetPreviewOneLiner(session: PlanSession, week?: PlanWeek): string {
  if (session.type === "rest") return "Ruhe";
  if (session.type === "strength") return "Kraft";
  if (session.type === "bike") return "Rad / Ergometer";
  const hr = getSessionHrZoneShort(session, week);
  const pr = parsePlannedPaceRangeMinPerKm(session.pace);
  if (hr) return hr;
  if (pr) {
    return pr.min === pr.max
      ? formatPaceMinPerKmLabel(pr.min)
      : `${formatPaceMinPerKmLabel(pr.min)}–${formatPaceMinPerKmLabel(pr.max)}`;
  }
  if (session.pace && String(session.pace).trim()) return String(session.pace).trim();
  const displayPk = getDisplayPlannedDistanceKm(session);
  if (displayPk != null && displayPk > 0) {
    return `${Number.isInteger(displayPk) ? displayPk : displayPk.toFixed(1)} km`;
  }
  if (RUNNING_TYPES.has(session.type)) return "Zone 2";
  return "Ziel aktiv";
}

/** Coach copy + optional concrete bpm range */
/** Single HR target line for compact home/session headers. */
export function formatSessionHrTargetLine(
  session: PlanSession,
  maxHrBpm?: number,
  week?: PlanWeek,
): string {
  return getSessionTargetLines(session, maxHrBpm, week)?.pulseLabel ?? "";
}

export function getSessionTargetLines(
  session: PlanSession,
  maxHrBpm?: number,
  week?: PlanWeek,
): SessionTargetLines | null {
  if (session.type === "rest") return null;

  const mh =
    typeof maxHrBpm === "number" && Number.isFinite(maxHrBpm) && maxHrBpm > 0 ? maxHrBpm : undefined;
  const easyRecovery = session.type === "easy" && isRecoveryWeek(week);

  /** Rendert „Zone X (min–max bpm, lo–hi% HFmax)“ aus der geteilten Band-Tabelle — identisch zur bisherigen fest codierten Formatierung. */
  const zoneBandLabel = (zoneLabel: string, fallbackWhenNoMh: string): string => {
    const band = HR_ZONE_PCT_BANDS[zoneLabel];
    if (!band) return fallbackWhenNoMh;
    const loPct = Math.round(band.lo * 100);
    const hiPct = Math.round(band.hi * 100);
    const range = getHrRangeForZone(zoneLabel, mh);
    return range
      ? `Herzfrequenzbereich: ${zoneLabel} (${range.min}–${range.max} bpm, ${loPct}–${hiPct}% HFmax)`
      : fallbackWhenNoMh;
  };

  let pulseLabel = "";
  switch (session.type) {
    case "easy":
      if (easyRecovery) {
        pulseLabel = zoneBandLabel("Zone 1", "Herzfrequenzbereich: Zone 1 · sehr niedrige Intensität");
      } else {
        pulseLabel = zoneBandLabel("Zone 2", "Herzfrequenzbereich: Zone 2 (60–75% HFmax)");
      }
      break;
    case "long":
      pulseLabel = zoneBandLabel("Zone 2", "Herzfrequenzbereich: Zone 2 (60–75% HFmax)");
      break;
    case "interval":
      pulseLabel = zoneBandLabel("Zone 4–5", "Herzfrequenzbereich: Zone 4–5 (80–95% HFmax)");
      break;
    case "tempo":
      pulseLabel = zoneBandLabel("Zone 3–4", "Herzfrequenzbereich: Zone 3–4 (76–88% HFmax)");
      break;
    case "race":
      pulseLabel = zoneBandLabel("Zone 4–5", "Herzfrequenzbereich: Zone 4–5 (Rennen, 80–95% HFmax)");
      break;
    case "strength":
      pulseLabel = "Herzfrequenzbereich: moderat / nicht primär relevant";
      break;
    case "bike":
      pulseLabel = mh
        ? `Herzfrequenzbereich: leicht–moderat (${Math.round(0.55 * mh)}–${Math.round(0.72 * mh)} bpm, 55–72% HFmax)`
        : "Herzfrequenzbereich: leicht–moderat (55–72% HFmax)";
      break;
    default:
      pulseLabel = "Herzfrequenzbereich: nach Intensität der Einheit";
  }

  const pr = parsePlannedPaceRangeMinPerKm(session.pace);
  let paceLabel = "Tempoziel: —";
  if (session.type === "strength") {
    paceLabel = "Tempoziel: nicht primär (Krafteinheit)";
  } else if (pr) {
    paceLabel =
      pr.min === pr.max
        ? `Tempoziel: ${formatPaceMinPerKmLabel(pr.min)}`
        : `Tempoziel: ${formatPaceMinPerKmLabel(pr.min)}–${formatPaceMinPerKmLabel(pr.max)}`;
  } else if (session.pace && String(session.pace).trim()) {
    paceLabel = `Tempoziel: ${String(session.pace).trim()}`;
  }

  const displayDist = getDisplayPlannedDistanceKm(session);
  const distanceLabel =
    displayDist != null && displayDist > 0
      ? `Distanzziel: ${Number.isInteger(displayDist) ? displayDist : displayDist.toFixed(1)} km`
      : null;

  return { pulseLabel, paceLabel, distanceLabel };
}

export type PlanExecutionDeviationStrings = {
  hr?: string;
  pace?: string;
  distance?: string;
};

function signedInt(n: number): string {
  const r = Math.round(n);
  if (r > 0) return `+${r}`;
  return String(r);
}

/** One decimal km, trim .0 */
function signedKm(n: number): string {
  const r = Math.round(n * 10) / 10;
  const s = r > 0 ? `+${r}` : String(r);
  if (Math.abs(r - Math.round(r)) < 1e-6) return (r > 0 ? "+" : "") + String(Math.round(r));
  return s;
}

export function formatPlanExecutionDeviations(input: {
  session: PlanSession;
  log: SessionLog | undefined;
  stored: StoredHealthRun | null;
  maxHrBpm?: number;
  week?: PlanWeek;
}): PlanExecutionDeviationStrings | null {
  const { session, log, stored, maxHrBpm, week } = input;
  if (!log || !isSessionLogDone(log)) return null;
  if (!RUNNING_TYPES.has(session.type)) return null;

  const plannedKm = getSessionPlannedDistanceKm(session);
  let actualKm: number | null = null;
  const storedKm = stored ? storedHealthRunDistanceKmNumeric(stored) : undefined;
  if (storedKm != null && storedKm > 0) {
    actualKm = Math.round(storedKm * 100) / 100;
  } else if (log.assignedRun?.distanceKm != null && log.assignedRun.distanceKm > 0) {
    actualKm = log.assignedRun.distanceKm;
  } else {
    const p = parseFloat(String(log.actualKm || "").replace(",", "."));
    if (Number.isFinite(p) && p > 0) actualKm = p;
  }

  const out: PlanExecutionDeviationStrings = {};

  if (plannedKm > 0 && actualKm != null && actualKm > 0) {
    const dKm = Math.round((actualKm - plannedKm) * 10) / 10;
    if (Math.abs(dKm) >= 0.05) {
      out.distance = `Distanz: ${signedKm(dKm)} km`;
    }
  }

  const norm = stored ? normalizeAppleHealthRun(stored) : null;
  const plannedPaceMid = plannedPaceMidMinPerKm(session);
  if (norm && plannedPaceMid != null && norm.distanceKm >= 0.05 && norm.paceMinPerKm > 0) {
    const deltaSec = Math.round((norm.paceMinPerKm - plannedPaceMid) * 60);
    if (deltaSec !== 0) {
      out.pace = `Tempo: ${signedInt(deltaSec)}s/km`;
    }
  }

  const midBpm = maxHrBpm ? hrZoneMidBpm(session, maxHrBpm, week) : null;
  const actualBpm =
    norm?.avgHeartRate ??
    (typeof log.assignedRun?.avgHeartRateBpm === "number" ? log.assignedRun.avgHeartRateBpm : null);
  if (midBpm != null && actualBpm != null && actualBpm > 0) {
    const dHr = actualBpm - midBpm;
    if (Math.abs(dHr) >= 1) {
      out.hr = `Herzfrequenz: ${signedInt(dHr)} bpm`;
    }
  }

  if (!out.hr && !out.pace && !out.distance) return null;
  return out;
}

export function findMostRecentCompletedRunSession(input: {
  plan: PlanWeek[];
  logs: Record<string, SessionLog | undefined>;
  healthById: Map<string, StoredHealthRun>;
}): { session: PlanSession; log: SessionLog; stored: StoredHealthRun | null; week: PlanWeek | null } | null {
  const candidates: { session: PlanSession; log: SessionLog; t: number; week: PlanWeek | null }[] = [];
  for (const week of input.plan) {
    for (const session of week.s ?? []) {
      if (!RUNNING_TYPES.has(session.type)) continue;
      const log = input.logs[session.id];
      if (!log || !isSessionLogDone(log)) continue;
      const t = sessionTime(session);
      candidates.push({ session, log, t, week });
    }
  }
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.t - a.t);
  const best = candidates[0];
  const rid = best.log.assignedRun?.runId;
  const stored = rid ? input.healthById.get(rid) ?? null : null;
  return { session: best.session, log: best.log, stored, week: best.week };
}

export function buildHomePlanVsExecutionSummary(input: {
  plan: PlanWeek[];
  logs: Record<string, SessionLog | undefined>;
  healthById: Map<string, StoredHealthRun>;
  maxHrBpm?: number;
}): PlanExecutionDeviationStrings | null {
  const ctx = findMostRecentCompletedRunSession(input);
  if (!ctx) return null;
  return formatPlanExecutionDeviations({
    session: ctx.session,
    log: ctx.log,
    stored: ctx.stored,
    maxHrBpm: input.maxHrBpm,
    week: ctx.week ?? undefined,
  });
}
