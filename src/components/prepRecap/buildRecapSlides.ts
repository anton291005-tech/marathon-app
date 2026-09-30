/**
 * Slides der Rückblick-Story — rein aus dem gespeicherten Snapshot, ohne React.
 *
 * Regeln:
 * - Eine Aussage pro Slide, eine Kernzahl (oder eine Visualisierung) pro Slide.
 * - Slides ohne Daten entfallen (der Snapshot setzt leere Blöcke auf null) — nie „0" oder „0 von X".
 * - Ein gelaufenes Rennen wird immer gefeiert. Die Zielvorgabe erscheint auf der Renn-Slide nur bei
 *   erreichtem Ziel (als Abstand); verpasst oder ohne Zeit steht sie dort gar nicht.
 * - Ist nur das Renndatum vorbei (kein Haken, keine Zeit), wird kein Lauf behauptet: keine Renn-Slide.
 */

import type { PrepRecapStats } from "../../prepRecap/buildPrepRecapSnapshot";
import {
  finishTimeSourceNote,
  formatFinishTime,
  formatRaceDateDe,
  formatRacePace,
  goalReachedLine,
  isGoalReached,
} from "../../prepRecap/raceResultPresentation";
import { trainingPhaseColor, trainingPhaseLabelDe } from "../../planV2/trainingPhase";

export type RecapSlideId =
  | "intro"
  | "volume"
  | "sessions"
  | "streak"
  | "longRuns"
  | "quality"
  | "strongestWeek"
  | "phases"
  | "body"
  | "race"
  | "outro";

export type RecapHero =
  | { kind: "number"; value: number; fractionDigits: number }
  | { kind: "duration"; seconds: number };

export type RecapCelebration = "base" | "goal";

export type RecapSlide = {
  id: RecapSlideId;
  eyebrow: string;
  hero: RecapHero | null;
  /** Kleine Einheit direkt an der Kernzahl (nur wo die Aussage sie nicht schon nennt). */
  heroUnit?: string;
  headline: string;
  subline: string | null;
  /** Kleine Kontextzeile unter der Aussage (Pace, Zielvorgabe, Quelle). */
  detail: string | null;
  celebration: RecapCelebration | null;
  phases?: Array<{ key: string; label: string; weeks: number; km: number | null; color: string }>;
  body?: Array<{ label: string; first: string; last: string }>;
  /** Nur Outro: kompakte Zusammenfassung. */
  summary?: string[];
};

export type RecapSlidesInput = {
  stats: PrepRecapStats;
  raceName: string | null;
  finishSeconds: number | null;
  finishConfirmed: boolean;
  /** Heute (YYYY-MM-DD) — entscheidet, ob das Outro noch von Erholung spricht. */
  todayYmd: string;
};

/** Bis so viele Tage nach dem Rennen spricht das Outro von Erholung (Tag 0 = Renntag). */
export const RECOVERY_WINDOW_DAYS = 14;

/** Ab so vielen Trainingstagen lohnt die Serie eine eigene Slide. */
export const MIN_STREAK_DAYS_FOR_SLIDE = 3;

const MARATHON_KM = 42.195;
const HALF_MARATHON_KM = 21.0975;

const numberFormatters = new Map<number, Intl.NumberFormat>();

export function formatRecapNumber(value: number, fractionDigits: number): string {
  let fmt = numberFormatters.get(fractionDigits);
  if (!fmt) {
    fmt = new Intl.NumberFormat("de-DE", {
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    });
    numberFormatters.set(fractionDigits, fmt);
  }
  return fmt.format(value);
}

export function formatRecapHero(hero: RecapHero): string {
  return hero.kind === "duration" ? formatFinishTime(hero.seconds) : formatRecapNumber(hero.value, hero.fractionDigits);
}

/** km als Kernzahl: ab 10 ganzzahlig, darunter eine Nachkommastelle (nur wenn nötig). */
function kmHero(km: number): RecapHero {
  if (km >= 10) return { kind: "number", value: Math.round(km), fractionDigits: 0 };
  const r = Math.round(km * 10) / 10;
  return { kind: "number", value: r, fractionDigits: Number.isInteger(r) ? 0 : 1 };
}

function formatKm(km: number): string {
  const r = Math.round(km * 10) / 10;
  return formatRecapNumber(r, Number.isInteger(r) ? 0 : 1);
}

function countHero(n: number): RecapHero {
  return { kind: "number", value: n, fractionDigits: 0 };
}

function isNear(km: number | null, target: number): boolean {
  return km != null && Math.abs(km - target) < 0.3;
}

export function finisherLabel(distanceKm: number | null): string {
  if (isNear(distanceKm, MARATHON_KM)) return "Marathon-Finisher";
  if (isNear(distanceKm, HALF_MARATHON_KM)) return "Halbmarathon-Finisher";
  return "Finisher";
}

function distanceHero(distanceKm: number | null): RecapHero | null {
  if (distanceKm == null || !(distanceKm > 0)) return null;
  if (isNear(distanceKm, MARATHON_KM)) return { kind: "number", value: MARATHON_KM, fractionDigits: 3 };
  const r = Math.round(distanceKm * 10) / 10;
  return { kind: "number", value: r, fractionDigits: Number.isInteger(r) ? 0 : 1 };
}

/** „1. Juni bis 27. September 2026" — Jahr nur einmal, wenn beide Tage im selben Jahr liegen. */
function dateRangeLabel(fromYmd: string, toYmd: string): string | null {
  const from = formatRaceDateDe(fromYmd);
  const to = formatRaceDateDe(toYmd);
  if (!from || !to) return to ?? null;
  const sameYear = fromYmd.slice(0, 4) === toYmd.slice(0, 4);
  return `${sameYear ? from.replace(/\s\d{4}$/, "") : from} bis ${to}.`;
}

function joinDetail(parts: Array<string | null | undefined>): string | null {
  const kept = parts.filter((p): p is string => typeof p === "string" && p.length > 0);
  return kept.length > 0 ? kept.join(" · ") : null;
}

function ymdToUtcDay(ymd: string): number | null {
  const m = ymd.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86_400_000;
}

/**
 * Liegt heute noch im Erholungsfenster nach dem Rennen (0 … RECOVERY_WINDOW_DAYS Tage danach)?
 * Der Rückblick ist Monate später noch aus den Einstellungen erreichbar — dann passt „Jetzt ist
 * Erholung dran." nicht mehr. Ungültige Daten → false (zeitloser Text ist immer richtig).
 */
export function isWithinRecoveryWindow(raceYmd: string, todayYmd: string): boolean {
  const race = ymdToUtcDay(raceYmd);
  const today = ymdToUtcDay(todayYmd);
  if (race == null || today == null) return false;
  const days = today - race;
  return days >= 0 && days <= RECOVERY_WINDOW_DAYS;
}

/** „1 Phase, ein Ziel." / „3 Phasen, ein Ziel." */
export function phasesHeadline(count: number): string {
  return `${count} ${count === 1 ? "Phase" : "Phasen"}, ein Ziel.`;
}

/** Hat der Athlet das Rennen gelaufen? Zeit bekannt oder Rennen abgehakt. */
export function recapRaceWasRun(stats: PrepRecapStats, finishSeconds: number | null): boolean {
  if (stats.race.completedBy === "plan_ended") return false;
  return finishSeconds != null || stats.race.completedBy === "race_done";
}

function introSlide(stats: PrepRecapStats, raceName: string | null): RecapSlide {
  const { weeks, race } = stats;
  const eyebrow = raceName ?? (race.completedBy === "plan_ended" ? "Dein Trainingsplan" : "Dein Rückblick");
  if (!weeks) {
    return {
      id: "intro",
      eyebrow,
      hero: null,
      headline: "Deine Vorbereitung",
      subline: formatRaceDateDe(race.ymd),
      detail: null,
      celebration: null,
    };
  }
  return {
    id: "intro",
    eyebrow,
    hero: countHero(weeks.count),
    headline: weeks.count === 1 ? "Woche Vorbereitung" : "Wochen Vorbereitung",
    subline: dateRangeLabel(weeks.firstYmd, race.ymd),
    detail: null,
    celebration: null,
  };
}

function volumeSlide(volume: NonNullable<PrepRecapStats["volume"]>): RecapSlide {
  const eq = volume.marathonEquivalents;
  let subline = "Kilometer für Kilometer bis an die Startlinie.";
  if (eq != null) {
    subline = eq === 1 ? "So weit wie ein ganzer Marathon." : `So weit wie ${formatRecapNumber(eq, Number.isInteger(eq) ? 0 : 1)} Marathons.`;
  }
  return {
    id: "volume",
    eyebrow: "Umfang",
    hero: kmHero(volume.actualKm),
    headline: "Kilometer gelaufen",
    subline,
    detail: null,
    celebration: null,
  };
}

function sessionsSlide(sessions: NonNullable<PrepRecapStats["sessions"]>): RecapSlide {
  const { done, planned } = sessions;
  const share = planned > 0 ? done / planned : 0;
  let subline = "Jede davon hat dich weitergebracht.";
  if (done >= planned) subline = "Alle geplanten Einheiten. Keine ausgelassen.";
  else if (share >= 0.8) subline = `${Math.floor(share * 100)} % deines Plans umgesetzt.`;
  return {
    id: "sessions",
    eyebrow: "Konstanz",
    hero: countHero(done),
    headline: done === 1 ? "Einheit durchgezogen" : "Einheiten durchgezogen",
    subline,
    detail: null,
    celebration: null,
  };
}

function raceSlide(input: RecapSlidesInput): RecapSlide | null {
  const { stats, raceName, finishSeconds, finishConfirmed } = input;
  const { race } = stats;
  if (!recapRaceWasRun(stats, finishSeconds)) return null;
  const eyebrow = raceName ?? "Renntag";
  const headline = finisherLabel(race.distanceKm);

  if (finishSeconds == null) {
    return {
      id: "race",
      eyebrow,
      hero: distanceHero(race.distanceKm),
      heroUnit: "km",
      headline,
      subline: "Die ganze Distanz. Bis ins Ziel.",
      detail: null,
      celebration: "base",
    };
  }

  const reached = isGoalReached(finishSeconds, race.goalSeconds);
  const pace = formatRacePace(finishSeconds, race.distanceKm);
  const sourceNote = finishTimeSourceNote({ seconds: finishSeconds, confirmed: finishConfirmed });
  return {
    id: "race",
    eyebrow,
    hero: { kind: "duration", seconds: finishSeconds },
    headline,
    subline: reached ? goalReachedLine(finishSeconds, race.goalSeconds) : "Die ganze Distanz. Bis ins Ziel.",
    // Ziel nur als Abstand bei erreichtem Ziel (subline); verpasst → keine Zielzeile.
    detail: joinDetail([pace, sourceNote]),
    celebration: reached ? "goal" : "base",
  };
}

function outroSlide(input: RecapSlidesInput): RecapSlide {
  const { stats, finishSeconds } = input;
  const summary: string[] = [];
  if (stats.weeks) summary.push(`${stats.weeks.count} ${stats.weeks.count === 1 ? "Woche" : "Wochen"}`);
  if (stats.volume) summary.push(`${formatRecapHero(kmHero(stats.volume.actualKm))} km`);
  if (finishSeconds != null) {
    const note = finishTimeSourceNote({ seconds: finishSeconds, confirmed: input.finishConfirmed });
    summary.push(note ? `${formatFinishTime(finishSeconds)} · ${note}` : formatFinishTime(finishSeconds));
  }

  const ran = recapRaceWasRun(stats, finishSeconds);
  const base = { id: "outro" as const, eyebrow: "Das bleibt", hero: null, detail: null, celebration: null, summary };
  if (ran && isWithinRecoveryWindow(stats.race.ymd, input.todayYmd)) {
    return {
      ...base,
      headline: "Jetzt ist Erholung dran.",
      subline: "Die nächsten Tage gehören der Regeneration. Du hast sie dir verdient.",
    };
  }
  if (ran) {
    // Eyebrow weicht aus, damit „Das bleibt" nicht doppelt über der Headline steht.
    return {
      ...base,
      eyebrow: "Deine Vorbereitung",
      headline: "Das bleibt.",
      subline: "Jede Woche davon steckt jetzt in deinen Beinen.",
    };
  }
  return {
    ...base,
    headline: stats.race.completedBy === "plan_ended" ? "Plan durchgezogen." : "Das war deine Vorbereitung.",
    subline: "Jede Woche davon steckt jetzt in deinen Beinen.",
  };
}

export function buildRecapSlides(input: RecapSlidesInput): RecapSlide[] {
  const { stats } = input;
  const slides: RecapSlide[] = [introSlide(stats, input.raceName)];

  if (stats.volume) slides.push(volumeSlide(stats.volume));
  if (stats.sessions) slides.push(sessionsSlide(stats.sessions));

  if (stats.streak && stats.streak.longestDays >= MIN_STREAK_DAYS_FOR_SLIDE) {
    slides.push({
      id: "streak",
      eyebrow: "Serie",
      hero: countHero(stats.streak.longestDays),
      headline: "Trainingstage in Folge",
      subline: "Deine längste Serie. Ruhetage zählen nicht dagegen.",
      detail: null,
      celebration: null,
    });
  }

  if (stats.longRuns) {
    const { done, longestKm } = stats.longRuns;
    slides.push({
      id: "longRuns",
      eyebrow: "Long Runs",
      hero: countHero(done),
      headline: done === 1 ? "Long Run absolviert" : "Long Runs absolviert",
      subline: longestKm != null ? `Dein längster Trainingslauf: ${formatKm(longestKm)} km.` : null,
      detail: null,
      celebration: null,
    });
  }

  if (stats.quality) {
    slides.push({
      id: "quality",
      eyebrow: "Qualität",
      hero: countHero(stats.quality.done),
      headline: stats.quality.done === 1 ? "Qualitätseinheit" : "Qualitätseinheiten",
      subline: "Tempo, Intervalle, Vorbereitungsrennen: Hier ist deine Rennpace entstanden.",
      detail: null,
      celebration: null,
    });
  }

  if (stats.strongestWeek) {
    slides.push({
      id: "strongestWeek",
      eyebrow: "Stärkste Woche",
      hero: kmHero(stats.strongestWeek.km),
      headline: `Kilometer in Woche ${stats.strongestWeek.weekNumber}`,
      subline: "Dein Höhepunkt im ganzen Block.",
      detail: null,
      celebration: null,
    });
  }

  if (stats.phases && stats.phases.length >= 2) {
    slides.push({
      id: "phases",
      eyebrow: "Die Reise",
      hero: null,
      headline: phasesHeadline(stats.phases.length),
      subline: "Vom Fundament bis zum Feinschliff.",
      detail: null,
      celebration: null,
      phases: stats.phases.map((p, i) => ({
        key: `${p.phase}-${i}`,
        label: trainingPhaseLabelDe(p.phase),
        weeks: p.weeks,
        km: p.km,
        color: trainingPhaseColor(p.phase),
      })),
    });
  }

  if (stats.body && (stats.body.sleep || stats.body.hrv)) {
    const rows: NonNullable<RecapSlide["body"]> = [];
    if (stats.body.sleep) {
      rows.push({
        label: "Schlaf",
        first: `${formatRecapNumber(stats.body.sleep.firstAvgHours, 1)} h`,
        last: `${formatRecapNumber(stats.body.sleep.lastAvgHours, 1)} h`,
      });
    }
    if (stats.body.hrv) {
      rows.push({ label: "HRV", first: `${stats.body.hrv.firstAvgMs} ms`, last: `${stats.body.hrv.lastAvgMs} ms` });
    }
    slides.push({
      id: "body",
      eyebrow: "Erholung",
      hero: null,
      headline: "Dein Körper im Block",
      subline: "Durchschnitt der ersten und der letzten vier Wochen vor dem Rennen.",
      detail: null,
      celebration: null,
      body: rows,
    });
  }

  const race = raceSlide(input);
  if (race) slides.push(race);

  slides.push(outroSlide(input));
  return slides;
}
