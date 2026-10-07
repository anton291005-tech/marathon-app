import type { TrainingPlanV2, WorkoutV2, Intensity } from "../../planV2/types";
import type { TrainingPhase } from "../../planV2/trainingPhase";
import { allow, axis, joinReasons, warn, type ValidationResult } from "./validationResult";
import type { ValidationContext } from "./validationContext";
import { isLongRunType, resolveLoadClass } from "../../core/loadClass";

function dayDiff(aIso: string, bIso: string): number {
  const a = new Date(aIso);
  const b = new Date(bIso);
  if (!Number.isFinite(a.getTime()) || !Number.isFinite(b.getTime())) return 999;
  const da = new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime();
  const db = new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime();
  return Math.round((db - da) / (24 * 60 * 60 * 1000));
}

/** Lokaler Kalendertag "YYYY-MM-DD" (nicht UTC: `toISOString()` kippt in Europe/Berlin auf den Vortag). */
function localYmd(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function localYmdOfIso(iso: string): string | null {
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? localYmd(d) : null;
}

/** Montag (lokal) der Kalenderwoche eines lokalen Tages "YYYY-MM-DD". */
function mondayYmdOf(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const date = new Date(y, m - 1, d, 12, 0, 0, 0);
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  return localYmd(date);
}

/** Belastungsklasse eines Workouts — dünner Wrapper um `core/loadClass` (einzige Quelle). */
export function inferIntensity(w: WorkoutV2): Intensity {
  return resolveLoadClass(w);
}

/** Schweregrad „harte Einheit am Vortag eines Long Runs" — phasenunabhängig (außer Taper) über der Warnschwelle. */
export const KEY_SESSION_EVE_SEVERITY = 75;

/**
 * Schweregrad „harte Einheit am Tag vor oder nach einem körperlich belastenden Termin" — in jeder Phase
 * ⚠️-Warnung, aber nie Sperre (95): die Einstufung des Termins beruht auf einem Stichwort im Titel.
 */
export const PHYSICAL_EVENT_ADJACENT_SEVERITY = 75;

/**
 * Stufen der Schweregrade (Darstellung und Auto-Vorschlag):
 *   0: unter 40   — unbedenklich, nichts anzeigen
 *   1: 40–74      — Hinweis (neutral)
 *   2: 75–94      — Warnung (⚠️); Auto-Vorschlag nur mit Warnung
 *   3: ab 95      — nie Auto-Vorschlag, in der manuellen Tageswahl sichtbar
 */
export const MICRO_HINT_THRESHOLD = 40;
export const MICRO_WARNING_THRESHOLD = 75;
export const MICRO_NEVER_AUTO_THRESHOLD = 95;

export type MicroTier = 0 | 1 | 2 | 3;

export function microSeverityTier(severity: number): MicroTier {
  if (severity >= MICRO_NEVER_AUTO_THRESHOLD) return 3;
  if (severity >= MICRO_WARNING_THRESHOLD) return 2;
  if (severity >= MICRO_HINT_THRESHOLD) return 1;
  return 0;
}

export type MicroFindingRule =
  | "back_to_back_high"
  | "recovery_after_high"
  | "key_session_eve"
  | "long_run_spacing"
  | "high_density"
  | "physical_event_adjacent"
  | "no_rest_day";

/** Ein einzelner Befund; `dates` sind die beteiligten lokalen Kalendertage (bzw. der Wochen-Montag bei `no_rest_day`). */
export type MicroFinding = {
  rule: MicroFindingRule;
  severity: number;
  reason: string;
  dates: string[];
};

/** Phase des Plans an einem lokalen Kalendertag; `undefined` → `context.phase`. */
export type MicroPhaseLookup = (dateYmd: string) => TrainingPhase | undefined;

/**
 * Titel der körperlich belastenden Kalendertermine an einem lokalen Kalendertag (leer ohne). Der Validator
 * kennt keine Kalender-Blöcke — die Kalender-Engine reicht die Sicht herein (`buildPhysicalLoadDayLookup`).
 */
export type MicroExternalLoadLookup = (dateYmd: string) => readonly string[];

export type MicroValidationOptions = { phaseOf?: MicroPhaseLookup; externalLoadTitlesOf?: MicroExternalLoadLookup };

const PHASE_STRICTNESS: Record<TrainingPhase, number> = { base: 0, build: 1, peak: 2, taper: 3 };

function strictestPhase(phases: TrainingPhase[]): TrainingPhase {
  return phases.reduce((acc, p) => (PHASE_STRICTNESS[p] > PHASE_STRICTNESS[acc] ? p : acc), phases[0]);
}

/** Lokaler Kalendertag um `days` verschoben (Mittag als Anker, damit die Sommerzeit nichts kippt). */
function shiftYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return localYmd(new Date(y, m - 1, d + days, 12, 0, 0, 0));
}

function isRestWorkout(w: WorkoutV2): boolean {
  return w.sport === "rest" || w.sessionType === "rest";
}

/**
 * Sammelt alle Befunde der Erholungs-/Abstandsregeln über den GANZEN Plan — auch über Wochengrenzen
 * (Sonntag → Montag). Keine frühen Rückgaben: jede Regel meldet jeden Treffer. Nur „kein Ruhetag" ist
 * wochenbezogen. Phase je Tag über `options.phaseOf`, sonst `context.phase`; bei Paaren über Tage zweier
 * Phasen gilt die strengere. Mit `options.externalLoadTitlesOf` zählt ein körperlich belastender Termin als
 * fremde harte Belastung für die Nachbartage (der Termintag selbst läuft über den Kalender-Fit).
 */
export function collectMicroFindings(
  plan: TrainingPlanV2,
  context: ValidationContext,
  options: MicroValidationOptions = {},
): MicroFinding[] {
  const phaseAt = (ymd: string): TrainingPhase => options.phaseOf?.(ymd) ?? context.phase;

  const entries: Array<{ w: WorkoutV2; ymd: string }> = [];
  for (const w of plan.workouts || []) {
    const ymd = localYmdOfIso(w.dateIso);
    if (ymd) entries.push({ w, ymd });
  }
  entries.sort((a, b) => a.w.dateIso.localeCompare(b.w.dateIso));

  const findings: MicroFinding[] = [];

  // Wochenregel: kein Ruhetag in der Kalenderwoche.
  const weeks = new Map<string, Array<{ w: WorkoutV2; ymd: string }>>();
  for (const e of entries) {
    const key = mondayYmdOf(e.ymd);
    if (!weeks.has(key)) weeks.set(key, []);
    weeks.get(key)!.push(e);
  }
  weeks.forEach((weekEntries, weekKey) => {
    if (weekEntries.some((e) => isRestWorkout(e.w))) return;
    const phase = phaseAt(weekEntries[0].ymd);
    const severity = phase === "taper" ? 65 : phase === "peak" ? 55 : 35;
    findings.push({ rule: "no_rest_day", severity, reason: "Warnung: Diese Woche hat keinen Ruhetag.", dates: [weekKey] });
  });

  // Dichte: drei harte Einheiten innerhalb von vier Tagen (planweit).
  const highs = entries.filter((e) => inferIntensity(e.w) === "high");
  for (let i = 0; i + 2 < highs.length; i += 1) {
    const diff = dayDiff(highs[i].w.dateIso, highs[i + 2].w.dateIso);
    if (diff < 0 || diff > 3) continue;
    const dates = [highs[i].ymd, highs[i + 1].ymd, highs[i + 2].ymd];
    const phase = strictestPhase(dates.map(phaseAt));
    findings.push({
      rule: "high_density",
      severity: phase === "taper" ? 85 : phase === "peak" ? 80 : 60,
      reason: "Warnung: Drei intensive Einheiten in vier Tagen erhöhen das Verletzungsrisiko.",
      dates,
    });
  }

  // Nachbarregel: harte Einheit am Tag vor oder nach einem körperlich belastenden Kalendertermin.
  const externalLoadTitlesOf = options.externalLoadTitlesOf;
  if (externalLoadTitlesOf) {
    for (const e of highs) {
      for (const offset of [-1, 1]) {
        const eventYmd = shiftYmd(e.ymd, offset);
        const eventTitles = externalLoadTitlesOf(eventYmd);
        if (eventTitles.length === 0) continue;
        const titles = eventTitles.map((t) => (t ?? "").trim()).filter(Boolean);
        // offset −1: der Termin liegt am Vortag, die Einheit also am Tag NACH dem Termin.
        const position = offset < 0 ? "am Tag nach" : "am Tag vor";
        const event = titles.length ? titles.map((t) => `„${t}“`).join(", ") : "einem Kalendertermin";
        findings.push({
          rule: "physical_event_adjacent",
          severity: PHYSICAL_EVENT_ADJACENT_SEVERITY,
          reason: `Warnung: Harte Einheit ${position} ${event} – körperlich belastender Termin.`,
          dates: [e.ymd, eventYmd],
        });
      }
    }
  }

  // Paarregeln über aufeinanderfolgende Einträge — unabhängig von der Kalenderwoche.
  for (let i = 0; i + 1 < entries.length; i += 1) {
    const { w: curr, ymd: currYmd } = entries[i];
    const { w: next, ymd: nextYmd } = entries[i + 1];
    const currInt = inferIntensity(curr);
    const nextInt = inferIntensity(next);
    const diffDays = dayDiff(curr.dateIso, next.dateIso);
    const dates = [currYmd, nextYmd];
    const phase = strictestPhase([phaseAt(currYmd), phaseAt(nextYmd)]);
    const isTaper = phase === "taper";
    const isPeak = phase === "peak";
    const isBase = phase === "base";

    // R1: keine harten Einheiten an Folgetagen (oder am selben Tag).
    if (currInt === "high" && nextInt === "high" && diffDays <= 1) {
      findings.push({
        rule: "back_to_back_high",
        severity: 95,
        reason: "Back-to-back intensity: zwei intensive Einheiten hintereinander.",
        dates,
      });
    }

    // R1b / Schlüsseleinheit: Erholung nach einer harten Einheit.
    if (currInt === "high" && diffDays === 1 && nextInt !== "low") {
      if (isTaper) {
        findings.push({
          rule: "recovery_after_high",
          severity: 95,
          reason: "Taper: nach intensiver Einheit am Folgetag nur Erholung/locker sinnvoll.",
          dates,
        });
      } else {
        const sev = isPeak ? 80 : isBase ? 40 : 55;
        if (isLongRunType(next.sessionType)) {
          findings.push({
            rule: "key_session_eve",
            severity: Math.max(sev, KEY_SESSION_EVE_SEVERITY),
            reason: "Warnung: Harte Einheit direkt vor einem Long Run — der Long Run braucht frische Beine.",
            dates,
          });
        } else {
          findings.push({
            rule: "recovery_after_high",
            severity: sev,
            reason: "Warnung: Nach einer intensiven Einheit ist ein Erholungstag am nächsten Tag empfehlenswert.",
            dates,
          });
        }
      }
    }

    // R2/R3: Abstand nach einem Long Run.
    if (isLongRunType(curr.sessionType) && diffDays < 2 && !isRestWorkout(next)) {
      if (isTaper || isPeak) {
        if (nextInt !== "low") {
          findings.push({
            rule: "long_run_spacing",
            severity: 92,
            reason: "Long Run stacking: benötigt mindestens 2 Tage Abstand.",
            dates,
          });
        }
      } else if (nextInt === "high") {
        findings.push({
          rule: "long_run_spacing",
          severity: 92,
          reason: "Long Run: benötigt mindestens 2 Tage Abstand zu einer intensiven Einheit.",
          dates,
        });
      } else if (nextInt === "medium") {
        findings.push({
          rule: "long_run_spacing",
          severity: 70,
          reason: "Warnung: Nach einem Long Run sind 2 lockere Tage oft sinnvoll.",
          dates,
        });
      }
    }
  }

  return findings;
}

/** Gleiche Gründe zusammenfassen (höchster Schweregrad), schwerste zuerst. */
function uniqueBySeverity(findings: MicroFinding[]): Array<{ reason: string; severity: number }> {
  const byReason = new Map<string, number>();
  for (const f of findings) byReason.set(f.reason, Math.max(f.severity, byReason.get(f.reason) ?? 0));
  return Array.from(byReason, ([reason, severity]) => ({ reason, severity })).sort((a, b) => b.severity - a.severity);
}

/**
 * Gesamtplan-Sicht: Micro-structure validation for physiological spacing over the whole plan.
 * Deterministic only; runs after structural rebuild. Meldet auch vorbestehende Befunde — für die
 * Bewertung einer Änderung `computeMicroStructureDelta` verwenden.
 */
export function validateMicroStructure(
  plan: TrainingPlanV2,
  context: ValidationContext,
  options: MicroValidationOptions = {},
): ValidationResult {
  const top = uniqueBySeverity(collectMicroFindings(plan, context, options)).slice(0, 3);
  const reason = joinReasons(top.map((t) => t.reason), " ");
  const score = top.reduce((m, t) => Math.max(m, t.severity), 0);
  if (!reason) return allow();
  const axes = { micro: axis(score, reason) };
  return score >= 60 ? warn(axes) : allow(axes);
}

export type MicroDelta = {
  /** Im Nachher-Zustand neu oder schwerer als im Vorher-Zustand. */
  newFindings: MicroFinding[];
  /** Im Vorher-Zustand vorhanden, im Nachher-Zustand weg oder schwächer. */
  resolvedFindings: MicroFinding[];
  /** Höchster Schweregrad der neuen Befunde, 0 ohne neue Befunde. */
  severity: number;
  tier: MicroTier;
  /** Neue Befunde ab 75 (⚠️-Warnung), schwerste zuerst. */
  warnings: string[];
  /** Neue Befunde 40–74 (neutraler Hinweis), schwerste zuerst. */
  hints: string[];
  /** Die schwersten neuen Gründe zusammengefasst (max. 3), `null` ohne neue Befunde. */
  reason: string | null;
};

const findingKey = (f: MicroFinding) => `${f.rule}|${f.dates.join(",")}`;

/**
 * Nur die Änderung bewerten: Befunde im Nachher-Zustand, die es im Vorher-Zustand nicht (oder nur
 * schwächer) gab. Vorbestehende Befunde zählen nicht. Befunde sind lokal an ihre Tage gebunden; ein
 * Tausch zweier Tage kann deshalb nur Befunde ändern, die einen dieser Tage berühren.
 */
export function diffMicroFindings(before: MicroFinding[], after: MicroFinding[]): MicroDelta {
  const beforeByKey = new Map(before.map((f) => [findingKey(f), f] as const));
  const afterByKey = new Map(after.map((f) => [findingKey(f), f] as const));

  const newFindings = after.filter((f) => {
    const prev = beforeByKey.get(findingKey(f));
    return !prev || f.severity > prev.severity;
  });
  const resolvedFindings = before.filter((f) => {
    const next = afterByKey.get(findingKey(f));
    return !next || next.severity < f.severity;
  });

  const unique = uniqueBySeverity(newFindings);
  const severity = unique.reduce((m, f) => Math.max(m, f.severity), 0);
  return {
    newFindings,
    resolvedFindings,
    severity,
    tier: microSeverityTier(severity),
    warnings: unique.filter((f) => f.severity >= MICRO_WARNING_THRESHOLD).map((f) => f.reason),
    hints: unique.filter((f) => f.severity >= MICRO_HINT_THRESHOLD && f.severity < MICRO_WARNING_THRESHOLD).map((f) => f.reason),
    reason: unique.length ? joinReasons(unique.slice(0, 3).map((f) => f.reason), " ") : null,
  };
}

export function computeMicroStructureDelta(
  before: TrainingPlanV2,
  after: TrainingPlanV2,
  context: ValidationContext,
  options: MicroValidationOptions = {},
): MicroDelta {
  return diffMicroFindings(collectMicroFindings(before, context, options), collectMicroFindings(after, context, options));
}
