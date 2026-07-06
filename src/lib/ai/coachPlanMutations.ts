/**
 * Structured read/write mutations for AI Coach confirmations (patch overlay + full V2 replace).
 */
import { parseSessionDateLabel } from "../../appSmartFeatures";
import { rebuildPlanFromWorkouts } from "../../core/deriveWeeksFromWorkouts";
import { normalizeTrainingPlan } from "../../planV2/normalizeTrainingPlan";
import type { Intensity, TrainingPlanV2, WeekV2, WorkoutSport, WorkoutV2 } from "../../planV2/types";
import { type TrainingPhase, normalizeTrainingPhase, trainingPhaseLabelDe } from "../../planV2/trainingPhase";
import type { AiContext, AiPlanSession, PlanPatch } from "./types";

const RUNNING_TYPES = new Set(["easy", "interval", "tempo", "long", "race"]);

function getSessionDate(session: AiPlanSession): Date | null {
  return parseSessionDateLabel(session.date);
}

function startOfLocalDay(from: Date): Date {
  return new Date(from.getFullYear(), from.getMonth(), from.getDate());
}

function getTodayFromContext(context: AiContext): Date {
  return startOfLocalDay(new Date(context.todayIso));
}

function buildLowImpactAlt(index: number, original: AiPlanSession): Partial<AiPlanSession> {
  const cycle = index % 3;
  if (cycle === 0) {
    return {
      type: "bike",
      km: 0,
      title: "Cross-Training: Rad oder Ergometer (locker)",
      desc: `Ersatz für "${original.title}": 45–60 min sehr locker, ohne Laufstellung.`,
      pace: "sehr locker",
    };
  }
  if (cycle === 1) {
    return {
      type: "bike",
      km: 0,
      title: "Cross-Training: Schwimmen optional",
      desc: `Ersatz für "${original.title}": 40–45 min sehr leicht oder lockeres Rad.`,
      pace: "leicht aktiv",
    };
  }
  return {
    type: "rest",
    km: 0,
    title: "Ruhetag (sanfte Alternative zum Laufen)",
    desc: "Kein Laufbelastungstraining — gehen/Mobilität wenn es sich gut anfühlt.",
    pace: null,
  };
}

/** Replace running workouts in next `weekCount` × 7 days with low-impact options. */
export function buildInjuryNoRunningPatches(context: AiContext, weekCount: number): PlanPatch[] {
  const today = getTodayFromContext(context);
  const end = new Date(today);
  end.setDate(end.getDate() + Math.max(1, Math.min(8, Math.round(weekCount))) * 7);

  let idx = 0;
  const patches: PlanPatch[] = [];

  const all = context.plan.flatMap((w) => w.s);
  for (const session of all) {
    if (!RUNNING_TYPES.has(session.type)) continue;
    const d = getSessionDate(session);
    if (!d) continue;
    const sd = startOfLocalDay(d);
    if (sd < today || sd > end) continue;

    patches.push({
      sessionId: session.id,
      changes: buildLowImpactAlt(idx++, session),
      reason: `${weekCount}-Wochen Pause vom Laufen: sanfte Alternativen`,
    });
  }
  return patches;
}

export function buildRemoveAllBikePatches(context: AiContext): PlanPatch[] {
  return context.plan
    .flatMap((w) => w.s)
    .filter((s) => s.type === "bike")
    .map((session) => ({
      sessionId: session.id,
      changes: {
        type: "rest" as const,
        km: 0,
        title: "Frei (Rennrad-Einheit entfernt)",
        desc: "Auf Wunsch entfernt — optional leichtes Gehen/Mobilität.",
        pace: null,
      },
      reason: "Rennrad-Einheit aus Marathonplan gestrichen",
    }));
}

function mondayOfWeekContaining(day: Date): Date {
  const d = startOfLocalDay(day);
  const dow = d.getDay();
  const shift = (dow + 6) % 7;
  d.setDate(d.getDate() - shift);
  return d;
}

/** Calendar week AFTER the one containing `today` (Monday..Sunday window). */
function nextCalendarMondayAfterThisWeek(context: AiContext): Date {
  const thisMon = mondayOfWeekContaining(getTodayFromContext(context));
  const next = new Date(thisMon);
  next.setDate(next.getDate() + 7);
  return next;
}

function isDateInCalendarWeek(day: Date, weekStartMonday: Date): boolean {
  const start = startOfLocalDay(weekStartMonday);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  return day >= start && day < end;
}

export function buildBoostNextWeekVolumePatches(context: AiContext, pct: number): PlanPatch[] {
  const pctSafe = Number.isFinite(pct) ? Math.min(35, Math.max(5, pct)) : 15;
  const factor = 1 + pctSafe / 100;
  const nextMonday = nextCalendarMondayAfterThisWeek(context);
  const patches: PlanPatch[] = [];

  for (const session of context.plan.flatMap((w) => w.s)) {
    if (!RUNNING_TYPES.has(session.type)) continue;
    if (typeof session.km !== "number" || !Number.isFinite(session.km) || session.km <= 0) continue;
    const d = getSessionDate(session);
    if (!d) continue;
    if (!isDateInCalendarWeek(startOfLocalDay(d), nextMonday)) continue;

    const nextKm = Math.max(1, Math.round(session.km * factor * 10) / 10);
    patches.push({
      sessionId: session.id,
      changes: {
        km: nextKm,
        title: `${session.title}${session.title.includes("km") ? "" : ""} (+${pctSafe}% Volumen)`,
        desc: session.desc
          ? `${session.desc} — Volumen für nächste Woche um ~${pctSafe}% erhöht.`
          : `Volumen für nächste Woche um ~${pctSafe}% erhöht.`,
      },
      reason: `Nächste Woche +${pctSafe}% Volumen`,
    });
  }
  return patches;
}

function findRaceDate(context: AiContext, raceDateOverrideIso?: string | null): Date | null {
  if (raceDateOverrideIso) {
    const r = new Date(raceDateOverrideIso);
    if (Number.isFinite(r.getTime())) return startOfLocalDay(r);
  }
  if (context.raceDateIso) {
    const r = new Date(context.raceDateIso);
    if (Number.isFinite(r.getTime())) return startOfLocalDay(r);
  }
  const races = context.plan
    .flatMap((w) => w.s)
    .filter((s) => s.type === "race")
    .map((s) => getSessionDate(s))
    .filter((d): d is Date => !!d);
  if (!races.length) return null;
  races.sort((a, b) => a.getTime() - b.getTime());
  return startOfLocalDay(races[races.length - 1]);
}

/** Exposed so coach UI layer can reuse the same precedence as taper (preferences / plan sessions). */
export function findRaceAnchorIsoFromContext(context: AiContext): string | null {
  const d = findRaceDate(context);
  return d ? isoDateLocalNoon(d) : null;
}

export function isoDateLocalNoon(day: Date): string {
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), 12, 0, 0).toISOString();
}

const HARD = new Set(["interval", "tempo", "race"]);

export type TaperWindowPatchesResult = {
  patches: PlanPatch[];
  adjustedCount: number;
  restDaysSet: number;
  summaryLine: string;
  shortLeadWarning?: string;
};

function wholeDaysBetween(earlier: Date, later: Date): number {
  const a = startOfLocalDay(earlier).getTime();
  const b = startOfLocalDay(later).getTime();
  return Math.round((b - a) / 86400000);
}

/**
 * Computes taper patches anchored at `raceDateOverride` when provided (message intent),
 * else `AiContext.raceDateIso`, else last `race` session in the plan.
 * Never removes sessions — only adjusts volume/type/intensity labels.
 *
 * Bands (calendar days strictly before race, sessions on/today onward):
 * - Days 1–2 before race: sehr leicht, max ~30 % Basisvolumen
 * - Days 3–7: −50 % Volumen, keine Intervalle/Langläufe
 * - Days 8–10: −30 % (≈ 70 % Volumen), Qualität möglich
 * Short lead (<7 d): Nur letzte 2 Tage + übrige Tage −50 %; wenn <3 d: nur minimal Ruhe/leicht (+ Hinweis).
 */
export function buildTaperWindowPatches(
  context: AiContext,
  raceDateOverrideIso?: string | null,
): TaperWindowPatchesResult {
  const race = findRaceDate(context, raceDateOverrideIso);
  if (!race) {
    return { patches: [], adjustedCount: 0, restDaysSet: 0, summaryLine: "0 Einheiten angepasst, 0 Ruhetage gesetzt" };
  }

  const today = getTodayFromContext(context);
  const leadDays = wholeDaysBetween(today, race);
  const shortLeadWarning: string | undefined =
    leadDays < 3 ? "Sehr kurze Vorlaufzeit — minimaler Taper möglich." : undefined;

  const pickBand = (db: number): { pct: number; stripQuality: boolean } | null => {
    if (db < 1 || db > 10) return null;
    if (leadDays < 3) return { pct: 0.3, stripQuality: true };
    if (leadDays < 7) {
      if (db <= 2) return { pct: 0.3, stripQuality: true };
      return { pct: 0.5, stripQuality: true };
    }
    if (db <= 2) return { pct: 0.3, stripQuality: true };
    if (db <= 7) return { pct: 0.5, stripQuality: true };
    return { pct: 0.7, stripQuality: false };
  };

  const patches: PlanPatch[] = [];
  let restDaysSet = 0;

  for (const session of context.plan.flatMap((w) => w.s)) {
    const parsed = getSessionDate(session);
    if (!parsed) continue;
    const sd = startOfLocalDay(parsed);
    if (sd < today || sd >= race) continue;

    const db = wholeDaysBetween(sd, race);
    const band = pickBand(db);
    if (!band) continue;

    if (session.type === "rest" || session.type === "strength") continue;
    if (session.type === "bike" && (!session.km || session.km <= 0)) continue;

    const baseKm = typeof session.km === "number" && Number.isFinite(session.km) ? session.km : 0;

    if (
      leadDays < 3 &&
      band.stripQuality &&
      (session.type === "interval" || session.type === "tempo") &&
      baseKm >= 14
    ) {
      patches.push({
        sessionId: session.id,
        changes: {
          type: "rest",
          km: 0,
          title: `Taper: Ruhetag statt «${session.title}»`,
          desc:
            `${session.desc ? `${session.desc} — ` : ""}` +
            "Minimaler Taper vor dem Wettkampf: harte Einheit zurückgenommen.",
          pace: null,
        },
        reason: `Taper ${db} Tag(e) vor dem Wettkampf`,
      });
      restDaysSet += 1;
      continue;
    }

    let nextType = session.type;
    let nextKm = Math.max(baseKm > 0 ? 3 : 0, Math.round(baseKm * band.pct * 10) / 10);

    if (band.stripQuality) {
      if (HARD.has(session.type) || session.type === "long") {
        nextType = "easy";
      }
      if (band.pct <= 0.35 && HARD.has(session.type)) {
        nextKm = Math.max(baseKm > 0 ? 3 : 0, Math.round(baseKm * 0.3 * 10) / 10);
      }
    } else {
      // Tage 8–10 vor dem Wettkampf: Qualität erlauben, aber Volumen runter (~70 %).
      nextKm = Math.max(
        HARD.has(session.type) || session.type === "long" ? 4 : baseKm > 0 ? 3 : 0,
        Math.round(baseKm * band.pct * 10) / 10,
      );
    }

    let pace: string | null = HARD.has(nextType) ? "kontrolliert" : nextType === "long" ? "leicht locker" : "sehr locker";
    if (nextType === "bike") pace = session.pace ?? "sehr locker";

    const descTail = `Taper: etwa ${Math.round(band.pct * 100)} % Basisvolumen · ${db} Tag(e) vor dem Wettkampf.`;

    const patch: PlanPatch = {
      sessionId: session.id,
      changes: {
        type: nextType !== session.type ? nextType : undefined,
        ...(baseKm > 0 || session.type === "bike" ? { km: nextKm > 0 ? nextKm : 0 } : {}),
        title: `${session.title} (${Math.round((1 - band.pct) * 100)} % weniger — Taper)`,
        desc: `${session.desc ? `${session.desc} — ` : ""}${descTail.trim()}`,
        pace,
      },
      reason: `Taper (${db} Tage vor WK)`,
    };

    patches.push(patch);

    const hitRest = patch.changes.type === "rest";
    if (hitRest) restDaysSet += 1;
  }

  const adjustedCount = patches.length;
  const summaryLine =
    `${adjustedCount} Einheit${adjustedCount !== 1 ? "en" : ""} angepasst, ${restDaysSet} Ruhetag${restDaysSet !== 1 ? "e" : ""} gesetzt`;

  return {
    patches,
    adjustedCount,
    restDaysSet,
    summaryLine,
    shortLeadWarning,
  };
}

export function findMissedYesterdaySession(context: AiContext): AiPlanSession | null {
  const today = getTodayFromContext(context);
  const y = new Date(today);
  y.setDate(y.getDate() - 1);
  const all = context.plan.flatMap((w) => w.s);
  for (const s of all) {
    const d = getSessionDate(s);
    if (!d) continue;
    if (startOfLocalDay(d).getTime() !== y.getTime()) continue;
    if (s.type === "rest") continue;
    return s;
  }
  return null;
}

export function buildMissedWorkoutPatches(context: AiContext): PlanPatch[] {
  const missed = findMissedYesterdaySession(context);
  if (!missed) return [];
  if (context.logs?.[missed.id]?.done) return [];

  const todaySession = context.plan
    .flatMap((w) => w.s)
    .find((s) => {
      const d = getSessionDate(s);
      return d && startOfLocalDay(d).getTime() === getTodayFromContext(context).getTime() && s.type !== "rest";
    });

  if (!todaySession || todaySession.type === "rest") return [];

  if (RUNNING_TYPES.has(todaySession.type) && typeof todaySession.km === "number" && todaySession.km > 0) {
    const add = HARD.has(missed.type) ? Math.round(Math.min(missed.km || 8, 8) * 0.35) : Math.round((missed.km || 10) * 0.35);
    const nextKm = Math.round((todaySession.km + add) * 10) / 10;
    return [
      {
        sessionId: todaySession.id,
        changes: {
          km: nextKm,
          type: HARD.has(todaySession.type) ? ("easy" as const) : todaySession.type,
          title:
            HARD.has(todaySession.type) || HARD.has(missed.type)
              ? `${todaySession.title} (Ausgleich ohne Zusatz-Intensität)`
              : `${todaySession.title} (teilweise integriert)`,
          desc: `Gestern fehlte „${missed.title}“: anteilig in heute eingebunden (+~${add} km), ohne neue Harteinheit.`,
        },
        reason: "Gestriges Training anteilig nachgeholt",
      },
    ];
  }
  return [];
}

const DE_MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];

function formatDeDate(d: Date): string {
  return `${d.getDate()}. ${DE_MONTHS[d.getMonth()]}`;
}

function isoDateOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function intensityFor(sessionType: string): Intensity {
  if (sessionType === "interval" || sessionType === "tempo" || sessionType === "race") return "high";
  if (sessionType === "long") return "medium";
  return "low";
}

function sportFor(sessionType: string): WorkoutSport {
  if (sessionType === "bike") return "bike";
  if (sessionType === "swim") return "swim";
  if (sessionType === "strength") return "strength";
  if (sessionType === "rest") return "rest";
  return "run";
}

function parseWeeklyKmTarget(range: string | undefined): number {
  if (!range) return 50;
  if (range.includes("0–20")) return 15;
  if (range.includes("20–40")) return 30;
  if (range.includes("40–60")) return 50;
  if (range.includes("60–80")) return 70;
  if (range.includes("80+")) return 90;
  return 50;
}

interface RaceConfig {
  raceKm: number;
  raceTitle: string;
  peakLongRunKm: number;
  taperLongRunKm: number;
  planWeeksIdeal: number;
  maxTrainingDaysPerWeek: number;
  restDaysPattern: number[];
}

function getRaceConfig(
  distanceKm: number | null | undefined,
  goal: "finish" | "time" = "time",
): RaceConfig {
  const d = distanceKm ?? 42.2;
  const isFinish = goal === "finish";

  if (d <= 5) {
    return {
      raceKm: 5,
      raceTitle: "🏁 5 km",
      peakLongRunKm: 12,
      taperLongRunKm: 8,
      planWeeksIdeal: 8,
      maxTrainingDaysPerWeek: isFinish ? 3 : 5,
      restDaysPattern: isFinish ? [1, 3, 5] : [1, 5],
    };
  }
  if (d <= 10) {
    return {
      raceKm: 10,
      raceTitle: "🏁 10 km",
      peakLongRunKm: 18,
      taperLongRunKm: 12,
      planWeeksIdeal: 10,
      maxTrainingDaysPerWeek: isFinish ? 3 : 5,
      restDaysPattern: isFinish ? [1, 3, 5] : [1, 5],
    };
  }
  if (d <= 15) {
    return {
      raceKm: 15,
      raceTitle: "🏁 15 km",
      peakLongRunKm: 22,
      taperLongRunKm: 14,
      planWeeksIdeal: 12,
      maxTrainingDaysPerWeek: isFinish ? 4 : 5,
      restDaysPattern: isFinish ? [1, 5] : [1],
    };
  }
  if (d <= 21.2) {
    return {
      raceKm: 21.1,
      raceTitle: "🏁 Halbmarathon",
      peakLongRunKm: 26,
      taperLongRunKm: 16,
      planWeeksIdeal: 16,
      maxTrainingDaysPerWeek: isFinish ? 4 : 6,
      restDaysPattern: isFinish ? [1, 5] : [1],
    };
  }
  return {
    raceKm: 42.2,
    raceTitle: "🏁 Marathon",
    peakLongRunKm: 32,
    taperLongRunKm: 18,
    planWeeksIdeal: 20,
    maxTrainingDaysPerWeek: isFinish ? 4 : 6,
    restDaysPattern: isFinish ? [1, 5] : [1],
  };
}

const DEFAULT_RACE_CONFIG = getRaceConfig(42.2);

export interface AiPlanRules {
  restDays?: number[];
  strengthDays?: number[];
  bikeDays?: number[];
  swimDays?: number[];
  /** @deprecated use bikeDays / swimDays */
  crossTrainingDays?: number[];
  maxTrainingDaysPerWeek?: number;
  longRunDay?: number;
  intervalDay?: number;
  tempoDay?: number;
  easyDays?: number[];
  /** @deprecated use weeklyKmMultiplier */
  volumeAdjustment?: number;
  weeklyKmMultiplier?: number;
  analysis?: string;
}

/** Claude plan structure phase block — drives week meta + volume progression when present. */
export interface PlanPhaseSpec {
  name: string;
  weeks: number;
  label: string;
  focus: string;
}

interface WeekPhaseInfo {
  phase: TrainingPhase;
  label: string;
  focus: string;
  weekInPhase: number;
  weeksInPhase: number;
}

function derivePhaseFromDur(dur: number): TrainingPhase {
  const midDur = dur - 3;
  if (midDur <= 10) return "taper";
  if (midDur <= 21) return "peak";
  if (midDur <= 56) return "build";
  return "base";
}

function countWeeksInPlan(
  start: Date,
  end: Date,
  weekKeyOverrides?: Map<string, string>,
): number {
  let weekCount = 0;
  let lastWeekKey = "";
  const day = new Date(start);
  while (day.getTime() <= end.getTime()) {
    const mon = mondayOfWeekContaining(day);
    const monIso = isoDateOf(mon);
    const startIso = weekKeyOverrides?.get(monIso) ?? monIso;
    if (startIso !== lastWeekKey) {
      weekCount += 1;
      lastWeekKey = startIso;
    }
    day.setDate(day.getDate() + 1);
  }
  return weekCount;
}

function getPhaseProgress01(weekInPhase: number, weeksInPhase: number): number {
  if (weeksInPhase <= 1) return 0;
  return Math.max(0, Math.min(1, (weekInPhase - 1) / (weeksInPhase - 1)));
}

function buildWeekPhaseSchedule(
  totalWeeks: number,
  claudePhases: PlanPhaseSpec[],
): WeekPhaseInfo[] {
  const blocks = claudePhases.map((p) => ({
    phase: normalizeTrainingPhase(p.name),
    label: p.label?.trim() || trainingPhaseLabelDe(normalizeTrainingPhase(p.name)),
    focus: p.focus?.trim() || "",
    weeks: Math.max(1, Math.round(p.weeks)),
  }));

  const totalClaudeWeeks = blocks.reduce((sum, block) => sum + block.weeks, 0) || 1;
  const schedule: WeekPhaseInfo[] = [];

  for (let weekIdx = 1; weekIdx <= totalWeeks; weekIdx += 1) {
    // Map plan weeks 1..totalWeeks linearly onto Claude phase timeline (base → taper).
    const claudePos = ((weekIdx - 0.5) / totalWeeks) * totalClaudeWeeks;
    let accumulated = 0;
    let block = blocks[blocks.length - 1];
    let weekInPhase = 1;

    for (const candidate of blocks) {
      if (claudePos <= accumulated + candidate.weeks) {
        block = candidate;
        weekInPhase = Math.max(1, Math.min(candidate.weeks, Math.ceil(claudePos - accumulated)));
        break;
      }
      accumulated += candidate.weeks;
    }

    schedule.push({
      phase: block.phase,
      label: block.label,
      focus: block.focus,
      weekInPhase,
      weeksInPhase: block.weeks,
    });
  }

  return schedule;
}

function getPhaseVolumeMultiplier(
  phase: TrainingPhase,
  weekInPhase: number,
  weeksInPhase: number,
  isRecoveryWeek: boolean,
): number {
  const progress = getPhaseProgress01(weekInPhase, weeksInPhase);

  let base: number;
  switch (phase) {
    case "taper":
      base = 0.65 - progress * 0.35;
      break;
    case "peak":
      base = 1.05 + progress * 0.1;
      break;
    case "build":
      base = 0.92 + progress * 0.18;
      break;
    default:
      base = 0.78 + progress * 0.17;
      break;
  }

  if (isRecoveryWeek && phase !== "taper") {
    base *= 0.72;
  }

  return base;
}


function scaleRunningKm(km: number, combinedScale: number): number {
  if (km <= 0 || combinedScale === 1) return km;
  return Math.round(km * combinedScale * 10) / 10;
}

/**
 * 4-week volume wave: 3 progressive weeks + 1 recovery week (×0.70).
 * Disabled during taper (≤21 days to race) — phase logic handles volume there.
 */
function getWeekVolumeWave(weekNumber: number, dur: number): number {
  if (dur <= 21) return 1;
  const cycleWeek = ((weekNumber - 1) % 4) + 1;
  switch (cycleWeek) {
    case 1:
      return 1.0;
    case 2:
      return 1.05;
    case 3:
      return 1.1;
    case 4:
      return 0.7;
    default:
      return 1;
  }
}

function isRecoveryWeekInWave(weekNumber: number, dur: number): boolean {
  if (dur <= 21) return false;
  return ((weekNumber - 1) % 4) + 1 === 4;
}

function phaseAwareSessionType(
  dow: number,
  dur: number,
  aiRules?: AiPlanRules,
  weekPhase?: TrainingPhase,
): string {
  if (aiRules) {
    const longRunDay = aiRules.longRunDay ?? 0;
    const intervalDay = aiRules.intervalDay ?? 2;
    const tempoDay = aiRules.tempoDay ?? 4;
    if (dow === longRunDay) return "long";
    if (dow === intervalDay) return "interval";
    if (dow === tempoDay) return "tempo";
    return "easy";
  }

  const phase = weekPhase ?? derivePhaseFromDur(dur);

  if (phase === "taper") {
    if (dow === 2) return "interval";
    if (dow === 0) return "long";
    return "easy";
  }
  if (phase === "peak") {
    if (dow === 2) return "interval";
    if (dow === 4) return "tempo";
    if (dow === 0) return "long";
    if (dow === 5) return "bike";
    return "easy";
  }

  const inBuild = phase === "build";
  if (dow === 2) return "interval";
  if (dow === 4) return inBuild ? "tempo" : "easy";
  if (dow === 0) return "long";
  if (dow === 5 && phase === "base") return "strength";
  if (dow === 6 && phase === "base") return "bike";
  return "easy";
}

interface TrainingSessionMeta {
  title: string;
  km: number;
  pace: string;
  descSuffix: string;
}

function buildSessionMeta(
  sessionType: string,
  dur: number,
  weekNumber: number,
  sessionProgress01: number,
  finalScale: number,
  raceConfig: RaceConfig,
  weekPhase?: TrainingPhase,
): TrainingSessionMeta {
  let title = "";
  let km = 10;
  let pace = "locker";
  let descSuffix = "";

  const phase = weekPhase ?? derivePhaseFromDur(dur);

  if (phase === "taper") {
    if (sessionType === "interval") {
      km = scaleRunningKm(8 + Math.round(sessionProgress01 * 3), finalScale);
      pace = "frisch aber kurz";
    } else if (sessionType === "long") {
      km = scaleRunningKm(raceConfig.taperLongRunKm, finalScale);
      pace = "leicht locker";
    } else if (sessionType === "easy") {
      const base = dur <= 3 ? Math.max(5, 8 - (10 - dur)) : 10;
      km = scaleRunningKm(base, finalScale);
    } else {
      km = 0;
    }
    title = sessionType === "rest" ? "Ruhetag" : `${sessionType} (Taper) W${weekNumber}`;
    descSuffix = " Phase: Rennnah / Taper — Volumen runter.";
  } else if (phase === "peak") {
    if (sessionType === "bike" || sessionType === "rest") km = 0;
    else if (sessionType === "interval") {
      km = scaleRunningKm(12 + Math.round(sessionProgress01 * 6), finalScale);
    } else if (sessionType === "tempo") {
      km = scaleRunningKm(14 + Math.round(sessionProgress01 * 5), finalScale);
    } else if (sessionType === "long") {
      const baseLong = 14 + sessionProgress01 * (raceConfig.peakLongRunKm - 14);
      km = Math.min(raceConfig.peakLongRunKm, scaleRunningKm(Math.round(baseLong), finalScale));
    } else {
      km = scaleRunningKm(8 + Math.round(sessionProgress01 * 5), finalScale);
    }
    title =
      sessionType === "bike"
        ? "Rennrad optional"
        : sessionType === "rest"
          ? "Ruhetag"
          : sessionType === "long"
            ? `Long Run W${weekNumber}`
            : sessionType === "interval"
              ? `Intervall / Qualität`
              : sessionType === "tempo"
                ? `Schwellenbereich`
                : `Easy Run`;
    descSuffix = " Phase: Wettkampfspezifikation / Peak-Stich.";
    pace =
      sessionType === "easy"
        ? "locker bis moderat"
        : sessionType === "interval"
          ? "je nach Block"
          : sessionType === "tempo"
            ? "„redet noch“ Schwelle"
            : sessionType === "long"
              ? "aerobe Grundlage"
              : "locker";
  } else {
    const inBuild = phase === "build";
    if (sessionType === "bike" || sessionType === "rest" || sessionType === "strength") km = 0;
    else if (sessionType === "interval") {
      km = scaleRunningKm(10 + Math.round(sessionProgress01 * 6), finalScale);
    } else if (sessionType === "tempo") {
      km = scaleRunningKm(12 + Math.round(sessionProgress01 * 5), finalScale);
    } else if (sessionType === "long") {
      const longBase = inBuild ? 12 : 10;
      const baseLong = longBase + sessionProgress01 * (raceConfig.peakLongRunKm - longBase);
      km = Math.min(raceConfig.peakLongRunKm, scaleRunningKm(Math.round(baseLong), finalScale));
    } else {
      km = scaleRunningKm(7 + Math.round(sessionProgress01 * 5), finalScale);
    }
    title =
      sessionType === "bike"
        ? "Rennrad Basics"
        : sessionType === "rest"
          ? "Ruhetag"
          : sessionType === "strength"
            ? "Krafttraining"
            : sessionType === "long"
              ? `Long Run W${weekNumber}`
              : sessionType === "interval"
                ? `Intervall`
                : sessionType === "tempo"
                  ? `Schwelle`
                  : `Easy Run`;
    descSuffix = inBuild ? " Phase: Höhere Belastung / Peak." : " Phase: Basis & aerobe Entwicklung.";
  }

  return { title, km, pace, descSuffix };
}

function restWorkoutForDay(ymd: string, iso: string, desc = "Aktive Erholung oder komplette Pause."): WorkoutV2 {
  return {
    id: `coach-gen-${ymd}-rest`,
    dateIso: iso,
    sport: "rest",
    sessionType: "rest",
    title: "Ruhetag",
    km: 0,
    desc,
    pace: null,
    structured: null,
    intensity: "low",
  };
}

function strengthWorkoutForDay(ymd: string, iso: string): WorkoutV2 {
  return {
    id: `coach-gen-${ymd}-strength`,
    dateIso: iso,
    sport: "rest",
    sessionType: "strength",
    title: "💪 Krafttraining",
    km: 0,
    desc: "Rumpf, Beine, funktionelle Übungen.",
    pace: null,
    structured: null,
    intensity: "low",
  };
}

function bikeWorkoutForDay(ymd: string, iso: string): WorkoutV2 {
  return {
    id: `coach-gen-${ymd}-bike`,
    dateIso: iso,
    sport: "bike",
    sessionType: "bike",
    title: "🚴 Radfahren",
    km: 0,
    desc: "Lockeres Radfahren, aktive Erholung.",
    pace: null,
    structured: null,
    intensity: "low",
  };
}

function swimWorkoutForDay(ymd: string, iso: string): WorkoutV2 {
  return {
    id: `coach-gen-${ymd}-swim`,
    dateIso: iso,
    sport: "rest",
    sessionType: "swim",
    title: "🏊 Schwimmen",
    km: 0,
    desc: "Lockeres Schwimmen, Ganzkörper.",
    pace: null,
    structured: null,
    intensity: "low",
  };
}

function raceWorkoutForDay(
  ymd: string,
  iso: string,
  race: Date,
  raceConfig: RaceConfig,
): WorkoutV2 {
  return {
    id: `coach-gen-${ymd}-race`,
    dateIso: iso,
    sport: "run",
    sessionType: "race",
    title: raceConfig.raceTitle,
    km: raceConfig.raceKm,
    desc: `Renntermin ${formatDeDate(race)} — Ziel-/Taktiktempo passt sich deinem Fitnessstand an.`,
    pace: "Zielbereich unter Einstellungen / Prognosekarte nutzen.",
    structured: null,
    intensity: "high",
  };
}

function workoutForTrainingDay(
  day: Date,
  race: Date,
  weekNumber: number,
  progress01: number,
  volumeScale = 1,
  restDayDow?: number,
  raceConfig: RaceConfig = DEFAULT_RACE_CONFIG,
  weeklyKmScale = 1,
  aiRules?: AiPlanRules,
  weekPhaseInfo?: WeekPhaseInfo,
): WorkoutV2 {
  const ymd = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
  const iso = new Date(`${ymd}T12:00:00`).toISOString();
  const dur = Math.max(0, Math.round((race.getTime() - day.getTime()) / 86400000));
  const dow = day.getDay();
  const combinedScale = volumeScale * weeklyKmScale;
  const ruleKmScale = aiRules?.weeklyKmMultiplier ?? aiRules?.volumeAdjustment ?? 1;
  const isRecoveryWeek = weekPhaseInfo
    ? isRecoveryWeekInWave(weekNumber, weekPhaseInfo.phase === "taper" ? 10 : 100)
    : isRecoveryWeekInWave(weekNumber, dur);
  const volumeWaveScale = weekPhaseInfo
    ? getPhaseVolumeMultiplier(
        weekPhaseInfo.phase,
        weekPhaseInfo.weekInPhase,
        weekPhaseInfo.weeksInPhase,
        isRecoveryWeek,
      )
    : getWeekVolumeWave(weekNumber, dur);
  const finalScale = combinedScale * ruleKmScale * volumeWaveScale;

  // 1. Race day always first
  if (dur === 0) {
    return raceWorkoutForDay(ymd, iso, race, raceConfig);
  }

  // 2. AI rules enforced programmatically on every session
  if (aiRules) {
    const restDays = new Set(aiRules.restDays ?? []);
    if (restDays.has(dow)) {
      return restWorkoutForDay(ymd, iso);
    }
    if (aiRules.strengthDays?.includes(dow)) {
      return strengthWorkoutForDay(ymd, iso);
    }
    if (aiRules.bikeDays?.includes(dow)) {
      return bikeWorkoutForDay(ymd, iso);
    }
    if (aiRules.swimDays?.includes(dow)) {
      return swimWorkoutForDay(ymd, iso);
    }
    if (aiRules.crossTrainingDays?.includes(dow)) {
      return bikeWorkoutForDay(ymd, iso);
    }
  } else {
    const allRestDays = new Set<number>();
    if (restDayDow !== undefined) {
      allRestDays.add(restDayDow);
    } else {
      raceConfig.restDaysPattern.forEach((d) => allRestDays.add(d));
    }
    if (allRestDays.has(dow)) {
      return restWorkoutForDay(ymd, iso);
    }
  }

  const sessionType = phaseAwareSessionType(dow, dur, aiRules, weekPhaseInfo?.phase);
  const sessionProgress01 = weekPhaseInfo
    ? getPhaseProgress01(weekPhaseInfo.weekInPhase, weekPhaseInfo.weeksInPhase)
    : progress01;
  const { title, km, pace, descSuffix } = buildSessionMeta(
    sessionType,
    dur,
    weekNumber,
    sessionProgress01,
    finalScale,
    raceConfig,
    weekPhaseInfo?.phase,
  );
  const desc = `Coach-Plan (${dur} Tage bis Rennen).${descSuffix}`;

  if (sessionType === "easy" && km > 0) {
    const minMeaningfulKm = raceConfig.raceKm <= 10 ? 5 : 6;
    if (km < minMeaningfulKm) {
      return restWorkoutForDay(ymd, iso, "Aktive Erholung.");
    }
  }

  const sport = sportFor(sessionType);
  return {
    id: `coach-gen-${ymd}-${sessionType}`,
    dateIso: iso,
    sport,
    sessionType,
    title,
    km,
    desc,
    pace: sport === "rest" || sport === "bike" || sessionType === "strength" || sessionType === "rest" ? null : pace,
    structured: null,
    intensity: intensityFor(sessionType),
  };
}

/** Full plan from `start` (typically today, local) through race `raceDay` inclusive. */
export function generateMarathonPlanV2ToRace(
  start: Date,
  raceDay: Date,
  goal?: "finish" | "time",
  raceDistanceKm?: number | null,
  weeklyKmRange?: string,
  restDayDow?: number,
  aiRules?: AiPlanRules,
  claudePhases?: PlanPhaseSpec[],
): TrainingPlanV2 {
  const volumeScale = goal === "finish" ? 0.8 : 1;
  const raceConfig = getRaceConfig(raceDistanceKm, goal ?? "time");
  const weeklyKmTarget = parseWeeklyKmTarget(weeklyKmRange);
  const baselineKmTarget = 50;
  const weeklyKmScale = weeklyKmTarget / baselineKmTarget;
  const resolvedRestDayDow = restDayDow;
  // eslint-disable-next-line no-console
  console.log("[PLAN-GEN] start", {
    start,
    raceDay,
    raceDistanceKm,
    weeklyKmRange,
    weeklyKmScale,
    restDayDow: resolvedRestDayDow ?? "pattern-only",
    restDaysPattern: raceConfig.restDaysPattern,
    aiRules: aiRules ?? null,
  });
  let s = startOfLocalDay(start);
  let r = startOfLocalDay(raceDay);
  if (r.getTime() < s.getTime()) {
    const t = r;
    r = s;
    s = t;
  }
  const totalDays = Math.round((r.getTime() - s.getTime()) / 86400000) + 1;

  const workouts: WorkoutV2[] = [];
  const metaByWeekStart = new Map<string, WeekV2["meta"]>();

  // Mid-week start fix: if the plan doesn't start on a Monday, use the actual
  // start date as the first week's key so the UI doesn't show empty Mon/Tue slots.
  const firstWeekMon = mondayOfWeekContaining(s);
  const firstWeekMonIso = isoDateOf(firstWeekMon);
  const firstWeekStartIso = s.getDay() !== 1 ? isoDateOf(s) : firstWeekMonIso;
  const weekKeyOverrides =
    firstWeekStartIso !== firstWeekMonIso
      ? new Map([[firstWeekMonIso, firstWeekStartIso]])
      : undefined;

  const totalWeeks = countWeeksInPlan(s, r, weekKeyOverrides);
  const weekPhaseSchedule =
    claudePhases?.length && totalWeeks > 0
      ? buildWeekPhaseSchedule(totalWeeks, claudePhases)
      : null;

  const day = new Date(s);
  let weekIdx = 0;
  let lastWeekKey = "";
  let currentWeekPhaseInfo: WeekPhaseInfo | undefined;
  while (day.getTime() <= r.getTime()) {
    const dur = Math.round((r.getTime() - day.getTime()) / 86400000);
    const progress01 = totalDays > 1 ? 1 - dur / (totalDays - 1) : 1;

    const mon = mondayOfWeekContaining(day);
    const monIso = isoDateOf(mon);
    // Apply the first-week override so the key matches what deriveWeeksFromWorkouts will use
    const startIso = weekKeyOverrides?.get(monIso) ?? monIso;
    if (startIso !== lastWeekKey) {
      lastWeekKey = startIso;
      weekIdx += 1;
      currentWeekPhaseInfo = weekPhaseSchedule?.[weekIdx - 1];

      let phase: TrainingPhase = currentWeekPhaseInfo?.phase ?? "base";
      let focus = currentWeekPhaseInfo?.focus || "Basis-/Aufbau";
      if (!currentWeekPhaseInfo) {
        const midDur = dur - 3;
        if (midDur <= 10) phase = "taper";
        else if (midDur <= 21) phase = "peak";
        else if (midDur <= 56) phase = "build";

        if (dur <= 10) focus = "Renn-/Taper-Phase — frisch sein";
        else if (dur <= 28) focus = "Spezifikation & längere Reize kontrolliert";
        else if (dur <= 56) focus = "Aufbau/Peak nach Verfügbarkeit";
        else focus = "Aerobe Basis schaffen";
      }

      const isRecoveryWeek = currentWeekPhaseInfo
        ? isRecoveryWeekInWave(weekIdx, currentWeekPhaseInfo.phase === "taper" ? 10 : 100)
        : isRecoveryWeekInWave(weekIdx, dur);
      // For the first week on a mid-week start, show the actual start date in the header
      const displayDate = startIso === firstWeekStartIso && firstWeekStartIso !== firstWeekMonIso ? s : mon;

      const displayLabel = currentWeekPhaseInfo?.label ?? trainingPhaseLabelDe(phase);
      metaByWeekStart.set(startIso, {
        wn: weekIdx,
        phase,
        label: isRecoveryWeek ? `${displayLabel} W${weekIdx} ⬇️` : `${displayLabel} W${weekIdx}`,
        dates: `${formatDeDate(displayDate)} ff.`,
        focus: isRecoveryWeek
          ? "⬇️ Entlastungswoche – Volumen reduziert, Adaptationen festigen"
          : focus,
        isRecoveryWeek,
      });
    }

    workouts.push(
      workoutForTrainingDay(
        new Date(day),
        r,
        weekIdx,
        progress01,
        volumeScale,
        resolvedRestDayDow,
        raceConfig,
        weeklyKmScale,
        aiRules,
        currentWeekPhaseInfo,
      ),
    );
    day.setDate(day.getDate() + 1);
  }

  // eslint-disable-next-line no-console
  console.log("[PLAN-GEN] workoutForTrainingDay loop done", { workoutCount: workouts.length });
  // eslint-disable-next-line no-console
  console.log("[PLAN-GEN] calling rebuildPlanFromWorkouts", { workoutCount: workouts.length });
  const plan = rebuildPlanFromWorkouts({ workouts, metaByWeekStart, weekKeyOverrides });
  // eslint-disable-next-line no-console
  console.log("[PLAN-GEN] done", { workoutCount: plan.workouts?.length ?? workouts.length });
  return normalizeTrainingPlan(plan);
}
