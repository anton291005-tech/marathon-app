import type { SessionType } from "../../lib/ai/types";

export type ReplaceConfidence = "high" | "medium" | "low";

const DE_MONTH_ALIAS: Record<string, number> = {
  jan: 0,
  januar: 0,
  feb: 1,
  februar: 1,
  mar: 2,
  marz: 2,
  maerz: 2,
  märz: 2,
  apr: 3,
  april: 3,
  mai: 4,
  jun: 5,
  juni: 5,
  jul: 6,
  juli: 6,
  aug: 7,
  sep: 8,
  sept: 8,
  okt: 9,
  oktober: 9,
  nov: 10,
  dez: 11,
};

/** Parsed before calendar resolution + session lookup (see resolveReplaceWorkoutProposal). */
export type ReplaceWorkoutExtraction = {
  raw: string;
  /** Resolved later from relatives / weekdays / implicit «today». */
  sourceAnchor: "today" | "tomorrow" | "day_after_tomorrow" | "unspecified" | "iso";
  /** Resolved calendar day YYYY-MM-DD when user names an explicit German calendar date («vom 20. Mai»). */
  sourceIsoHint?: string;
  /** Normalised weekday fragment if present (montag…sonntag). */
  sourceWeekdayToken?: string;
  /** Soft hints to pick among multiple sessions on one day. */
  sourceTypeHints: string[];
  targetType?: SessionType;
  targetDistanceKm?: number;
  targetDurationMin?: number;
  targetStructure?: string;
  confidence: ReplaceConfidence;
  needsClarification: boolean;
  clarifyingQuestion?: string;
};

function norm(raw: string): string {
  return raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[!?.,;:()[\]{}„“"'`´]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasTwoDistinctRelativeDays(l: string): boolean {
  const pairs = [
    /\bheute\b/.test(l) && /\bmorgen\b/.test(l),
    /\bheute\b/.test(l) && /\bubermorgen\b/.test(l),
    /\bmorgen\b/.test(l) && /\bubermorgen\b/.test(l),
    /\bgestern\b/.test(l) && /\bheute\b/.test(l),
    /\bgestern\b/.test(l) && /\bmorgen\b/.test(l),
  ];
  return pairs.some(Boolean);
}

function looksLikeNewWorkoutSpec(l: string): boolean {
  return (
    /\b\d{1,2}(?:[.,]\d)?\s*km\b/.test(l) ||
    /\b\d+\s*x\s*\d{3,4}\s*m\b/.test(l) ||
    /\b\d+\s*x\s*\d+(?:[.,]\d)?\s*km\b/.test(l) ||
    /\b\d+\s*min\b/.test(l) ||
    /\b(easy\s*run|tempolauf|intervall|intervalle?|lang(en)?\s+lauf|long\s*run|ruhetag|krafttraining|rennrad)\b/.test(l)
  );
}

export function looksLikeReplaceWorkoutIntent(l: string): boolean {
  const hasSpec = looksLikeNewWorkoutSpec(l);

  const explicitVerb =
    /\bersetz/.test(l) ||
    /\breplace\b/.test(l) ||
    /\bmach aus\b/.test(l) ||
    (/\bwandle\b/.test(l) && /\bin\b/.test(l) && /\bum\b/.test(l)) ||
    (/\b(statt|anstatt)\b/.test(l) && /\blieber\b/.test(l)) ||
    (/\blieber\b/.test(l) && /\bals\b/.test(l) && /\b(lauf|rad|rennrad|intervall|tempo|ruhetag|kraft)/.test(l));

  const tauschAgainstWorkout =
    /\btausch\w*\b/.test(l) &&
    /\b(gegen|durch)\b/.test(l) &&
    !hasTwoDistinctRelativeDays(l) &&
    (hasSpec || /\b(easy|tempo|intervall|intervalle|lauf|ruhetag|kraft|rad|rennrad)\b/.test(l));

  const implicitPreferRunInstead =
    /\b(heute|morgen)\b/.test(l) &&
    /\blieber\b/.test(l) &&
    /\b(lauf|laufen|locker|easy)\b/.test(l) &&
    /\b(statt|anstatt|als|wie)\b.*\b(rad|rennrad|bike|kraft|intervalle?)\b/.test(l);

  const keinBockLocker =
    /\b(heute|morgen)\b/.test(l) &&
    /\b(kein bock|lieber)\b/.test(l) &&
    /\bintervalle?\b/.test(l) &&
    /\b(locker|easy|was locker)/.test(l);

  return explicitVerb || tauschAgainstWorkout || implicitPreferRunInstead || keinBockLocker;
}

function parseKm(l: string): number | undefined {
  const m = l.match(/\b(\d{1,2}(?:[.,]\d)?)\s*km\b/);
  if (!m) return undefined;
  const n = Number(m[1].replace(",", "."));
  return Number.isFinite(n) ? n : undefined;
}

function parseDurationMin(l: string): number | undefined {
  const m = l.match(/\b(\d{1,3})\s*min\b/);
  if (!m) return undefined;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : undefined;
}

/** e.g. 5x2000m, 5 x 2000 m */
function parseIntervalStructure(l: string): string | undefined {
  const m = l.match(/\b(\d{1,2})\s*x\s*(\d{3,4})\s*m\b/);
  if (!m) return undefined;
  return `${m[1]}x${m[2]}m`;
}

function detectWeekdayToken(l: string): string | undefined {
  const re =
    /\b(sonntag|montag|dienstag|mittwoch|donnerstag|freitag|samstag)\b/;
  const m = re.exec(l);
  return m ? m[1] : undefined;
}

function germanDomMonthToIsoYmd(norm: string, refYear: number): string | null {
  const m = norm.match(/\b(?:vom|am)\s+(\d{1,2})\.?\s*([A-Za-zÄÖÜäöü]+)\b/i);
  if (!m) return null;
  const dom = Number(m[1]);
  const monTok = m[2].normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const mi = DE_MONTH_ALIAS[monTok];
  if (!Number.isFinite(dom) || dom < 1 || dom > 31 || mi === undefined) return null;
  const d = new Date(refYear, mi, dom, 12, 0, 0, 0);
  if (!Number.isFinite(d.getTime()) || d.getMonth() !== mi) return null;
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${day}`;
}

/** Text before «mit …», so target words (Easy Run …) never become source hints. */
function replaceSourceClauseNorm(norm: string): string {
  const mit = norm.search(/\s+mit\s+(?:einem\s+|einer\s+|eine\s+|einen\s+)?/);
  const cut = mit === -1 ? norm.length : mit;
  return norm.slice(0, cut).trim();
}

function detectTargetType(l: string): SessionType | undefined {
  if (/\bruhetag\b|\bpause\b|\brest day\b/.test(l)) return "rest";
  if (/\bintervall|intervalle|wiederholung/.test(l)) return "interval";
  if (/\btempo|schwellen/.test(l)) return "tempo";
  if (/\blong\s*run\b|\blanger?\s+lauf\b|\blongrun\b/.test(l)) return "long";
  if (/\bkraft|gym|gewicht/.test(l)) return "strength";
  /** «Easy Run» should win over incidental «Rennrad» in the same sentence. */
  if (/\beasy\b|\blocker\b|dauerlauf|recovery/.test(l)) return "easy";
  if (/\bmarathon\b|\brennen\b|\brace\b/.test(l)) return "race";
  if (/\brennrad\b|\bradfahren\b|\bcycling\b|\bbike\b|\brad\b/.test(l)) return "bike";
  if (/\blauf(en)?\b/.test(l) && !/\b(lang|tempo|intervall)/.test(l)) return "easy";
  return undefined;
}

function detectSourceTypeHints(l: string): string[] {
  const hints: string[] = [];
  if (/\brennrad\b|\brad\b|\bbike\b/.test(l)) hints.push("bike");
  if (/\bkraft\b|\bgym\b/.test(l)) hints.push("strength");
  if (/\bintervall|intervalle\b/.test(l)) hints.push("interval");
  if (/\btempo\b/.test(l)) hints.push("tempo");
  if (/\blong\b|\blanger?\s+lauf\b/.test(l)) hints.push("long");
  if (/\bruhetag\b|\bpause\b/.test(l)) hints.push("rest");
  if (/\beasy\b|\blocker\b/.test(l)) hints.push("easy");
  return hints;
}

export type ExtractReplaceWorkoutOpts = { todayIso?: string };

export function extractReplaceWorkoutIntent(raw: string, opts?: ExtractReplaceWorkoutOpts): ReplaceWorkoutExtraction {
  const l = norm(raw);
  let confidence: ReplaceConfidence = "medium";
  let needsClarification = false;
  let clarifyingQuestion: string | undefined;

  const refYear = (() => {
    const ys = opts?.todayIso?.slice(0, 4);
    const y = ys ? Number(ys) : Number.NaN;
    return Number.isFinite(y) ? y : 2026;
  })();

  let sourceAnchor: ReplaceWorkoutExtraction["sourceAnchor"] = "unspecified";
  let sourceIsoHint = germanDomMonthToIsoYmd(l, refYear) ?? undefined;

  if (!sourceIsoHint) {
    if (/\bheute\b/.test(l) || /\bheutigen\b/.test(l) || /\bheutiges\b/.test(l)) sourceAnchor = "today";
    else if (/\bmorgen\b/.test(l) || /\bmorgigen\b/.test(l)) sourceAnchor = "tomorrow";
    else if (/\bubermorgen\b/.test(l)) sourceAnchor = "day_after_tomorrow";
  } else {
    sourceAnchor = "iso";
  }

  const wd = detectWeekdayToken(replaceSourceClauseNorm(l));
  let sourceWeekdayToken = wd;
  if (wd && !sourceIsoHint) sourceAnchor = "iso";

  const structure = parseIntervalStructure(l);
  let targetDistanceKm = parseKm(l);
  const targetDurationMin = parseDurationMin(l);
  let targetStructure = structure;

  let targetType = detectTargetType(l);
  const replaceBareSourceInterval =
    /\bersetz\w*\b/.test(l) &&
    /\b(?:das|die|dieses|dein|deinem)?\s*intervall\w+\b/.test(replaceSourceClauseNorm(l)) &&
    !/\bmit\s+/.test(l);
  const replaceBareSourceTempo =
    /\bersetz\w*\b/.test(l) &&
    /\b(?:das|die|dieses|dein)\s+tempo\w*\b/.test(replaceSourceClauseNorm(l)) &&
    !/\bmit\s+/.test(l);
  const replaceBareSourceLong =
    /\bersetz\w*\b/.test(l) &&
    /\b(?:das|die|dieses)?\s*(?:long\s*run|longrun|lang\w*\s+lauf)\b/.test(replaceSourceClauseNorm(l)) &&
    !/\bmit\s+/.test(l);
  if (replaceBareSourceInterval || replaceBareSourceTempo || replaceBareSourceLong) {
    targetType = undefined;
  }

  if (structure && !targetType) targetType = "interval";

  const sourceTypeHints = detectSourceTypeHints(replaceSourceClauseNorm(l));

  if (targetType === "easy" && structure) {
    targetType = "interval";
  }

  const vagueRunInstead =
    /\b(heute|morgen)\b/.test(l) &&
    /\blieber\b/.test(l) &&
    /\b(lauf|laufen)\b/.test(l) &&
    /\b(statt|anstatt)\b.*\b(rad|rennrad|bike)\b/.test(l);
  if (vagueRunInstead) {
    targetType = "easy";
    confidence = "medium";
  }

  const keinBock =
    /\b(heute|morgen)\b/.test(l) && /\b(kein bock|lieber)\b/.test(l) && /\bintervalle?\b/.test(l);
  if (keinBock) {
    targetType = "easy";
    sourceTypeHints.push("interval");
    confidence = "medium";
  }

  if (
    !targetType &&
    (/\bersetz\b/.test(l) || /\bmach aus\b/.test(l)) &&
    /\blauf(en)?\b/.test(l) &&
    /\bmit\b/.test(l)
  ) {
    targetType = "easy";
  }

  if (targetType === "interval" && structure) {
    const mp = /^(\d+)x(\d+)m$/.exec(structure);
    if (mp) {
      const reps = Number(mp[1]);
      const meters = Number(mp[2]);
      if (Number.isFinite(reps) && Number.isFinite(meters)) {
        targetDistanceKm = (reps * meters) / 1000 + 3;
      }
    }
  }

  const vagueTargetMissing =
    (/\bersetz\w*\b/.test(l) ||
      /\bmach\s+aus\b/.test(l) ||
      (/\bwandle\b/.test(l) && /\bin\b/.test(l) && /\bum\b/.test(l))) &&
    !targetType &&
    targetDistanceKm === undefined &&
    !structure;

  const wantsTargetButMissing =
    vagueTargetMissing && sourceAnchor !== "unspecified" && (Boolean(sourceIsoHint) || wd !== undefined);

  if (wantsTargetButMissing || (vagueTargetMissing && /\b(heute|morgen|übermorgen|ubermorgen)\b/.test(l))) {
    needsClarification = true;
    clarifyingQuestion =
      "Womit soll ich das Training ersetzen? Zum Beispiel: Easy Run, Intervall, Kraft oder Ruhetag?";
    confidence = "low";
  }

  const onlyReplaceVerb =
    /\bersetz\w*\b/.test(l) &&
    !targetType &&
    !targetDistanceKm &&
    !structure &&
    sourceAnchor === "unspecified";
  if (onlyReplaceVerb) {
    needsClarification = true;
    clarifyingQuestion = "Welchen Tag und welche neue Einheit meinst du genau?";
    confidence = "low";
  }

  if (
    targetType &&
    targetType !== "rest" &&
    targetType !== "strength" &&
    targetType !== "bike" &&
    !targetDistanceKm &&
    !targetDurationMin &&
    !structure &&
    !needsClarification
  ) {
    confidence = "medium";
  }

  return {
    raw,
    sourceAnchor,
    sourceIsoHint,
    sourceWeekdayToken,
    sourceTypeHints,
    targetType,
    targetDistanceKm,
    targetDurationMin,
    targetStructure,
    confidence,
    needsClarification,
    clarifyingQuestion,
  };
}
