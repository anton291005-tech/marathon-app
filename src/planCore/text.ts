/**
 * Titel, Beschreibung, Pace-Feld und App-Typ einer Einheit (Vorlage: api/_lib/planSessionText.js).
 *
 * Die Beschreibung von `tempo`, `interval` und `race` liest der App-Parser (src/sessionDistance.ts,
 * `parseStructuredWorkoutSpecFromDesc`) und rechnet daraus die km. Deshalb gilt dort:
 * - Bausteine mit " · " getrennt, Dezimalpunkt statt Komma (der Parser trennt an Kommas), kein Komma vor dem Satzende;
 * - Wiederholungen "3 × 1.6 km (60 s Pause)", Dauerlauf "4.4 km Tempo", M-Block "10 km @ M-Pace";
 * - nach einer Wiederholung nie "km @" (der Parser würde dort trennen): "3 × 2 km HM-Tempo".
 * `easy` und `long` liest der Parser nicht; dort darf die Beschreibung frei formuliert sein.
 * `structured` nur bei `interval` (wie heute): bei `tempo` führt der Client `structured` und Beschreibung zusammen und
 * zählt Dauerlauf-Blöcke doppelt.
 */

import { formatPace, formatPaceRange } from "./pace";
import type { CoreSession, Segment } from "./sessions";
import type { CoreIntensity, CoreKind, CoreSessionType, Distance } from "./types";

/** Abbildung Kern-Art → App-Typ (docs/plan-core-plan.md, Abbildungstabelle). Muss `SESSION_TYPE_OF_KIND` in hrZones.ts entsprechen. */
export const SESSION_TYPE_OF_KIND: Readonly<Record<CoreKind, CoreSessionType>> = {
  REC: "easy",
  E: "easy",
  MLR: "easy",
  LR: "long",
  "LR+M": "long",
  M: "tempo",
  T: "tempo",
  I: "interval",
  R: "interval",
  RACE: "race",
  REST: "rest",
};

const INTENSITY_OF_KIND: Readonly<Record<CoreKind, CoreIntensity>> = {
  REC: "low",
  E: "low",
  MLR: "low",
  LR: "medium",
  "LR+M": "high",
  M: "high",
  T: "high",
  I: "high",
  R: "high",
  RACE: "high",
  REST: "low",
};

const RACE_NAME: Readonly<Record<Distance, string>> = { "5k": "5-km-Rennen", "10k": "10-km-Rennen", hm: "Halbmarathon", m: "Marathon" };
const RACE_PACE_NAME: Readonly<Record<Distance, string>> = { "5k": "5-km-Tempo", "10k": "10-km-Tempo", hm: "HM-Tempo", m: "M-Tempo" };

/** Struktur für `interval` in der Form, die der Client kennt (`StructuredWorkoutSpec`). */
export type CoreStructuredSpec = {
  warmupKm: number;
  cooldownKm: number;
  intervals: Array<{ reps: number; distanceKm: number }>;
  recoveryJogKm: number;
};

export type SessionText = {
  sessionType: CoreSessionType;
  intensity: CoreIntensity;
  title: string;
  desc: string | null;
  /** "m:ss–m:ss" oder `null` (Ruhetag, Einsteiger-T/M nach Gefühl). */
  pace: string | null;
  structured: CoreStructuredSpec | null;
};

const round1 = (km: number): number => Math.round(km * 10) / 10;
/** Fließtext: "9,2". */
const fmtKm = (km: number): string => String(round1(km)).replace(".", ",");
/** Parser-Text: "9.2". */
const fmtParsable = (km: number): string => String(round1(km));
const fmtRep = (km: number): string => (km < 1 ? `${Math.round(km * 1000)} m` : `${fmtKm(km)} km`);
const fmtRepParsable = (km: number): string => (km < 1 ? `${Math.round(km * 1000)} m` : `${fmtParsable(km)} km`);

function zoneOf(kind: CoreKind, recoveryWeek: boolean): string {
  switch (kind) {
    case "REC":
      return "Zone 1";
    case "E":
      return recoveryWeek ? "Zone 1" : "Zone 2";
    case "M":
      return "Zone 3";
    case "T":
      return "Zone 4";
    case "I":
    case "R":
      return "Zone 4–5";
    default:
      return "Zone 2";
  }
}

function stridesText(segments: Segment[]): string {
  const strides = segments.filter((s) => s.type === "strides")[0];
  if (strides === undefined || strides.type !== "strides") return "";
  return ` Am Ende ${strides.reps} × ${strides.meters} m Steigerungen (je ca. ${strides.seconds} s), locker zurücktraben.`;
}

function work(session: CoreSession): Segment | undefined {
  return session.segments.filter((s) => s.type === "steady" || s.type === "reps")[0];
}

function edge(session: CoreSession, type: "warmup" | "cooldown"): number {
  const segment = session.segments.filter((s) => s.type === type)[0];
  return segment !== undefined && (segment.type === "warmup" || segment.type === "cooldown") ? segment.km : 0;
}

/** Text einer Einheit. `distance` für Renn- und Renntempo-Namen, `recoveryWeek` für die Zone von E. */
export function renderSession(session: CoreSession, ctx: { distance: Distance; recoveryWeek: boolean }): SessionText {
  const { kind } = session;
  const sessionType = SESSION_TYPE_OF_KIND[kind];
  const intensity = INTENSITY_OF_KIND[kind];
  const pace = session.paceBand === null ? null : formatPaceRange(session.paceBand.fast, session.paceBand.slow);
  const zone = zoneOf(kind, ctx.recoveryWeek);
  const base = { sessionType, intensity, pace, structured: null };

  if (kind === "REST") return { ...base, title: "Ruhetag", desc: null, pace: null };
  if (kind === "RACE") {
    const target = session.paceBand === null ? "Lauf nach Gefühl" : `Zielpace ${formatPace((session.paceBand.fast + session.paceBand.slow) / 2)}/km`;
    return {
      ...base,
      title: RACE_NAME[ctx.distance],
      desc: `Renntag: ${RACE_NAME[ctx.distance]} über ${fmtKm(session.km)} km. ${target}. Starte kontrolliert und teile dir das Rennen ein.`,
    };
  }
  if (kind === "REC") {
    return { ...base, title: "Regenerationslauf", desc: `Sehr locker über ${fmtKm(session.km)} km in ${zone}.${stridesText(session.segments)}` };
  }
  if (kind === "E" || kind === "MLR") {
    const hasStrides = session.segments.some((s) => s.type === "strides");
    const title = kind === "MLR" ? "Mittellanger Lauf" : hasStrides ? "Lockerer Lauf mit Steigerungen" : "Lockerer Dauerlauf";
    const what = kind === "MLR" ? "Mittellanger, ruhiger Lauf" : "Lockerer Dauerlauf";
    return {
      ...base,
      title,
      desc: `${what} über ${fmtKm(session.km)} km in ${zone}. Du kannst dich dabei gut unterhalten.${stridesText(session.segments)}`,
    };
  }
  if (kind === "LR") {
    return { ...base, title: "Langer Lauf", desc: `Langer, ruhiger Lauf über ${fmtKm(session.km)} km in ${zone}.` };
  }
  if (kind === "LR+M") {
    const block = work(session);
    const blockKm = block !== undefined && block.type === "steady" ? block.km : 0;
    const blockPace = block !== undefined && block.type === "steady" && block.minutes !== undefined ? ` (ca. ${block.minutes} min nach Gefühl)` : "";
    return {
      ...base,
      title: "Langer Lauf mit M-Block",
      desc: `${fmtKm(session.km - blockKm)} km locker in Zone 2, dann ${fmtKm(blockKm)} km im Marathontempo${blockPace} in Zone 3.`,
    };
  }

  // M, T, I, R: Parser-Format
  const segment = work(session);
  const wu = `${fmtParsable(edge(session, "warmup"))} km WU`;
  const cd = `${fmtParsable(edge(session, "cooldown"))} km CD`;
  if (segment !== undefined && segment.type === "steady") {
    const feel = segment.minutes !== undefined ? ` (ca. ${segment.minutes} min nach Gefühl)` : "";
    if (kind === "M") {
      return { ...base, title: `Marathontempo ${fmtKm(segment.km)} km`, desc: `${wu} · ${fmtParsable(segment.km)} km @ M-Pace${feel} · ${cd}. ${zone}.` };
    }
    return { ...base, title: "Tempodauerlauf", desc: `${wu} · ${fmtParsable(segment.km)} km Tempo${feel} · ${cd}. ${zone}.` };
  }
  if (segment !== undefined && segment.type === "reps") {
    const reps = `${segment.reps} × ${fmtRepParsable(segment.repKm)}`;
    const pause = `(${segment.restSec} s Pause)`;
    let title: string;
    let label = "";
    if (session.racePace) {
      title = `${RACE_PACE_NAME[ctx.distance]} ${segment.reps} × ${fmtRep(segment.repKm)}`;
      label = ` ${RACE_PACE_NAME[ctx.distance]}`;
    } else if (kind === "T") title = `Schwelle ${segment.reps} × ${fmtRep(segment.repKm)}`;
    else if (kind === "I") title = `Intervalle ${segment.reps} × ${fmtRep(segment.repKm)}`;
    else title = `Wiederholungen ${segment.reps} × ${fmtRep(segment.repKm)}`;
    const structured: CoreStructuredSpec | null =
      sessionType === "interval"
        ? {
            warmupKm: edge(session, "warmup"),
            cooldownKm: edge(session, "cooldown"),
            intervals: [{ reps: segment.reps, distanceKm: segment.repKm }],
            recoveryJogKm: segment.restKm,
          }
        : null;
    return { ...base, title, desc: `${wu} · ${reps}${label} ${pause} · ${cd}. ${zone}.`, structured };
  }
  return { ...base, title: "Lauf", desc: null };
}
