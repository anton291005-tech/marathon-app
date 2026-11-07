/**
 * Structured mutations for AI Coach confirmations (patch overlay). Pläne erzeugt nur noch der Plan-Kern (`src/planCore`,
 * Umbauplan Schritt 11); der frühere Client-Generator `generateMarathonPlanV2ToRace` ist entfernt.
 */
import { parseSessionDateLabel } from "../../appSmartFeatures";
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
  const magnitude = Number.isFinite(pct) ? Math.min(35, Math.max(5, Math.abs(pct))) : 15;
  const pctSafe = pct < 0 ? -magnitude : magnitude;
  const factor = 1 + pctSafe / 100;
  const isReduction = pctSafe < 0;
  const verb = isReduction ? "reduziert" : "erhöht";
  const signStr = isReduction ? `${pctSafe}` : `+${pctSafe}`;
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
        title: `${session.title} (${signStr}% Volumen)`,
        desc: session.desc
          ? `${session.desc} — Volumen für nächste Woche um ~${Math.abs(pctSafe)}% ${verb}.`
          : `Volumen für nächste Woche um ~${Math.abs(pctSafe)}% ${verb}.`,
      },
      reason: `Nächste Woche ${signStr}% Volumen`,
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
