/**
 * Planned run distance: explicit structured workout > recipe parsed from desc > plan row `km`.
 * SSOT for targets, weekly rollups, and Health matching (not for long-run narrative-only desc).
 */

import {
  assertDistanceConsistency,
  ENABLE_DISTANCE_DEBUG,
  getDistanceSystemMetrics,
  recordSessionDistanceResolution,
} from "./distanceIntegrity";

export type StructuredWorkoutSpec = {
  warmupKm?: number;
  cooldownKm?: number;
  intervals?: Array<{ reps: number; distanceKm: number }>;
  /** Recovery jogs between reps (parsed from e.g. "90s Pause" in interval desc). */
  recoveryJogKm?: number;
  steadyBlocksKm?: number[];
  strides?: Array<{ count: number; meters: number }>;
};

export type SessionShapeForDistance = {
  km: number;
  type: string;
  desc?: string | null;
  structured?: StructuredWorkoutSpec | null;
};

const RECIPE_TYPES = new Set(["interval", "tempo", "race"]);

/** When true, UI and AI week totals use sum of sessions; `week.km` is advisory only. */
export const USE_COMPUTED_WEEK_KM = true;

const STRUCTURED_PARSED_TOLERANCE_KM = 0.2;
const PARSER_TRUST_MIN = 0.6;

const CONF = {
  wuCd: 0.95,
  repKm: 0.93,
  repM: 0.9,
  strides: 0.88,
  atBlock: 0.86,
  easyLocker: 0.75,
  zuegig: 0.58,
  tempoThreshold: 0.6,
} as const;

/** Single rounding step for UI — use after internal math, not inside aggregations. */
export function formatKm(km: number): number {
  if (!Number.isFinite(km)) return 0;
  return Math.round(km * 10) / 10;
}

export function computeStructuredWorkoutDistance(workout: StructuredWorkoutSpec): number {
  let sum = 0;
  const wu = workout.warmupKm;
  const cd = workout.cooldownKm;
  if (typeof wu === "number" && Number.isFinite(wu) && wu > 0) sum += wu;
  if (typeof cd === "number" && Number.isFinite(cd) && cd > 0) sum += cd;
  for (const block of workout.intervals ?? []) {
    const r = block.reps;
    const d = block.distanceKm;
    if (Number.isFinite(r) && Number.isFinite(d) && r > 0 && d > 0) sum += r * d;
  }
  const recovery = workout.recoveryJogKm;
  if (typeof recovery === "number" && Number.isFinite(recovery) && recovery > 0) sum += recovery;
  for (const b of workout.steadyBlocksKm ?? []) {
    if (typeof b === "number" && Number.isFinite(b) && b > 0) sum += b;
  }
  for (const s of workout.strides ?? []) {
    const c = s.count;
    const m = s.meters;
    if (Number.isFinite(c) && Number.isFinite(m) && c > 0 && m > 0) sum += (c * m) / 1000;
  }
  return sum;
}

/** ~5:00/km easy jog — used to convert timed recoveries (e.g. 90s Pause) into distance. */
const RECOVERY_JOG_PACE_SEC_PER_KM = 300;

function totalIntervalReps(spec: StructuredWorkoutSpec): number {
  return (spec.intervals ?? []).reduce((acc, block) => {
    const r = block.reps;
    return acc + (Number.isFinite(r) && r > 0 ? r : 0);
  }, 0);
}

/** Fill recovery jog km from "(90s Pause)" / "Trottpause" when reps are known. */
function applyRecoveryJogFromDesc(spec: StructuredWorkoutSpec, desc: string): void {
  if (typeof spec.recoveryJogKm === "number" && spec.recoveryJogKm > 0) return;
  const pauseM = desc.match(/\((\d+)\s*s\s*(?:Pause|Trottpause|Erholung|tr(?:o|ö)t)\)/i);
  if (!pauseM) return;
  const pauseSec = Number.parseInt(pauseM[1], 10);
  if (!Number.isFinite(pauseSec) || pauseSec <= 0) return;
  const reps = totalIntervalReps(spec);
  const recoveries = reps > 1 ? reps - 1 : 0;
  if (recoveries <= 0) return;
  spec.recoveryJogKm = (recoveries * pauseSec) / RECOVERY_JOG_PACE_SEC_PER_KM;
}

/** Merge explicit structured fields with desc-parsed segments so WU/CD/easy/recovery are not dropped. */
function mergeStructuredWorkoutSpecs(
  explicit: StructuredWorkoutSpec,
  parsed: StructuredWorkoutSpec,
): StructuredWorkoutSpec {
  return {
    warmupKm: explicit.warmupKm ?? parsed.warmupKm,
    cooldownKm: explicit.cooldownKm ?? parsed.cooldownKm,
    intervals:
      explicit.intervals != null && explicit.intervals.length > 0
        ? explicit.intervals
        : parsed.intervals,
    recoveryJogKm: explicit.recoveryJogKm ?? parsed.recoveryJogKm,
    steadyBlocksKm: [
      ...(explicit.steadyBlocksKm ?? []),
      ...(parsed.steadyBlocksKm ?? []),
    ],
    strides:
      explicit.strides != null && explicit.strides.length > 0 ? explicit.strides : parsed.strides,
  };
}

function parseDecimal(raw: string): number {
  const n = Number.parseFloat(raw.replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

export type ParsedWorkoutFromDesc = {
  workout: StructuredWorkoutSpec;
  /** 0–1; below PARSER_TRUST_MIN → do not use parsed over plan row */
  confidence: number;
};

/**
 * Parse German recipe fragments (WU/CD, ×m reps, tempo blocks). Returns null if nothing matched.
 * On ambiguous / unparseable recipe text, returns null (no partial incorrect totals).
 */
/** Merged explicit + desc-parsed structure for interval pace estimation (Strategy F). */
export function resolveStructuredWorkoutSpecForSession(
  session: SessionShapeForDistance,
): StructuredWorkoutSpec | null {
  const parsedResult = RECIPE_TYPES.has(session.type) ? parseStructuredWorkoutSpecFromDesc(session.desc) : null;
  const parsedWorkout = parsedResult?.workout ?? null;
  if (session.structured && typeof session.structured === "object") {
    return parsedWorkout != null
      ? mergeStructuredWorkoutSpecs(session.structured, parsedWorkout)
      : session.structured;
  }
  return parsedWorkout;
}

export function parseStructuredWorkoutSpecFromDesc(
  desc: string | null | undefined,
): ParsedWorkoutFromDesc | null {
  if (desc == null || typeof desc !== "string") return null;
  const t = desc.trim();
  if (!t) return null;

  const rawParts = t
    .split(/\s*·\s*|•|,|\s+dann\s+|\s*\+\s*|\s*;\s*|\s+und\s+/i)
    .map((p) => p.trim())
    .filter(Boolean);

  const parts = rawParts.flatMap((part) => {
    const dense = part.split(
      /\s+(?=\d+(?:[.,]\d+)?\s*km\s*(?:WU|CD|@|easy|locker|zügig|tempo|schwelle)\b|\d+\s*[×x]\s*\d+)/i,
    );
    if (dense.length > 1) return dense.map((s) => s.trim()).filter(Boolean);
    return [part];
  });

  if (parts.length === 0) return null;

  const spec: StructuredWorkoutSpec = {
    intervals: [],
    steadyBlocksKm: [],
    strides: [],
  };
  let matched = false;
  let confidence = 1;

  for (const part of parts) {
    let m = part.match(/^(\d+(?:[.,]\d+)?)\s*km\s*WU\b/i);
    if (m) {
      spec.warmupKm = parseDecimal(m[1]);
      matched = true;
      confidence = Math.min(confidence, CONF.wuCd);
      continue;
    }
    m = part.match(/^(\d+(?:[.,]\d+)?)\s*km\s*CD\b/i);
    if (m) {
      spec.cooldownKm = parseDecimal(m[1]);
      matched = true;
      confidence = Math.min(confidence, CONF.wuCd);
      continue;
    }
    m = part.match(/^(\d+)\s*[×x]\s*(\d+(?:[.,]\d+)?)\s*km\b/i);
    if (m) {
      spec.intervals!.push({
        reps: Number.parseInt(m[1], 10),
        distanceKm: parseDecimal(m[2]),
      });
      matched = true;
      confidence = Math.min(confidence, CONF.repKm);
      continue;
    }
    m = part.match(/^(\d+)\s*[×x]\s*(\d+)\s*m\b/i);
    if (m) {
      const reps = Number.parseInt(m[1], 10);
      const meters = Number.parseInt(m[2], 10);
      const isStride = /stride/i.test(part) || meters <= 150;
      if (isStride) {
        spec.strides!.push({ count: reps, meters });
        confidence = Math.min(confidence, CONF.strides);
      } else {
        spec.intervals!.push({ reps, distanceKm: meters / 1000 });
        confidence = Math.min(confidence, CONF.repM);
      }
      matched = true;
      continue;
    }
    m = part.match(/^(\d+(?:[.,]\d+)?)\s*km\s*@/i);
    if (m) {
      spec.steadyBlocksKm!.push(parseDecimal(m[1]));
      matched = true;
      confidence = Math.min(confidence, CONF.atBlock);
      continue;
    }
    m = part.match(/^(\d+(?:[.,]\d+)?)\s*km\s*easy\b/i);
    if (m) {
      spec.steadyBlocksKm!.push(parseDecimal(m[1]));
      matched = true;
      confidence = Math.min(confidence, CONF.easyLocker);
      continue;
    }
    m = part.match(/^(\d+(?:[.,]\d+)?)\s*km\s*locker\b/i);
    if (m) {
      spec.steadyBlocksKm!.push(parseDecimal(m[1]));
      matched = true;
      confidence = Math.min(confidence, CONF.easyLocker);
      continue;
    }
    m = part.match(/^(\d+(?:[.,]\d+)?)\s*km\s*zügig\b/i);
    if (m) {
      spec.steadyBlocksKm!.push(parseDecimal(m[1]));
      matched = true;
      confidence = Math.min(confidence, CONF.zuegig);
      continue;
    }
    m = part.match(/^(\d+(?:[.,]\d+)?)\s*km\s*(?:tempo|schwelle)\b/i);
    if (m) {
      spec.steadyBlocksKm!.push(parseDecimal(m[1]));
      matched = true;
      confidence = Math.min(confidence, CONF.tempoThreshold);
      continue;
    }
    m = part.match(/^(\d+(?:[.,]\d+)?)\s+km\s*easy\b/i);
    if (m) {
      spec.steadyBlocksKm!.push(parseDecimal(m[1]));
      matched = true;
      confidence = Math.min(confidence, CONF.easyLocker);
      continue;
    }
  }

  if (!matched) return null;
  applyRecoveryJogFromDesc(spec, t);
  const total = computeStructuredWorkoutDistance(spec);
  if (!(total > 0)) return null;
  return { workout: spec, confidence };
}

export type PlannedDistanceSource = "structured" | "parsed" | "fallback" | "legacy";

const DISTANCE_BASED_SESSION_TYPES = new Set(["easy", "long", "interval", "tempo", "race"]);

/**
 * True for running sessions with a well-defined plan distance. False for strength, bike, rest, mobility, etc.
 */
export function isDistanceBasedSession(session: { type: string }): boolean {
  return DISTANCE_BASED_SESSION_TYPES.has(session.type);
}

export type PlannedDistanceResolution = {
  km: number;
  source: PlannedDistanceSource;
};

function sessionId(s: SessionShapeForDistance): string | undefined {
  return "id" in s && typeof (s as { id?: string }).id === "string" ? (s as { id?: string }).id : undefined;
}

type InnerResolution = {
  res: PlannedDistanceResolution;
  wasMismatch: boolean;
  explicitStructuredKm: number | null;
  parsedForCompare: number | null;
  lowConfidenceParsedRejected: boolean;
  rowKm: number;
};

/** Pure: no metrics / side effects. */
function computePlannedDistanceKmInner(session: SessionShapeForDistance): InnerResolution {
  const rowKm = typeof session.km === "number" && Number.isFinite(session.km) && session.km > 0 ? session.km : 0;

  let explicitStructuredKm: number | null = null;
  const parsedResult = RECIPE_TYPES.has(session.type) ? parseStructuredWorkoutSpecFromDesc(session.desc) : null;
  const parsedWorkout = parsedResult?.workout;
  const parseConfidence = parsedResult?.confidence ?? 0;
  const parsedKmRaw = parsedWorkout ? computeStructuredWorkoutDistance(parsedWorkout) : null;
  const parsedPositive = parsedKmRaw != null && parsedKmRaw > 0 ? parsedKmRaw : null;
  const trustParsed = parsedResult != null && parseConfidence >= PARSER_TRUST_MIN && parsedPositive != null;
  const parsedForCompare = parsedPositive;
  const lowConfidenceParsedRejected = RECIPE_TYPES.has(session.type) && parsedResult != null && !trustParsed;

  if (session.structured && typeof session.structured === "object") {
    // Explicit structured may omit WU/CD/easy/recovery — merge with desc parse so all segments count.
    const merged =
      parsedWorkout != null
        ? mergeStructuredWorkoutSpecs(session.structured, parsedWorkout)
        : session.structured;
    const v = computeStructuredWorkoutDistance(merged);
    if (v > 0) explicitStructuredKm = v;
  }

  let wasMismatch = false;
  if (explicitStructuredKm != null && parsedForCompare != null) {
    if (Math.abs(explicitStructuredKm - parsedForCompare) > STRUCTURED_PARSED_TOLERANCE_KM) {
      wasMismatch = true;
    }
  }

  if (explicitStructuredKm != null && explicitStructuredKm > 0) {
    return {
      res: { km: explicitStructuredKm, source: "structured" },
      wasMismatch,
      explicitStructuredKm,
      parsedForCompare,
      lowConfidenceParsedRejected,
      rowKm,
    };
  }

  if (RECIPE_TYPES.has(session.type) && trustParsed && parsedPositive != null) {
    return {
      res: { km: parsedPositive, source: "parsed" },
      wasMismatch,
      explicitStructuredKm,
      parsedForCompare,
      lowConfidenceParsedRejected,
      rowKm,
    };
  }

  if (RECIPE_TYPES.has(session.type) && !trustParsed && rowKm > 0) {
    return {
      res: { km: rowKm, source: "legacy" },
      wasMismatch,
      explicitStructuredKm,
      parsedForCompare,
      lowConfidenceParsedRejected,
      rowKm,
    };
  }

  if (rowKm > 0) {
    return {
      res: { km: rowKm, source: "fallback" },
      wasMismatch,
      explicitStructuredKm,
      parsedForCompare,
      lowConfidenceParsedRejected,
      rowKm,
    };
  }

  return {
    res: { km: 0, source: "fallback" },
    wasMismatch,
    explicitStructuredKm,
    parsedForCompare,
    lowConfidenceParsedRejected,
    rowKm,
  };
}

export function resolveSessionPlannedDistanceKm(session: SessionShapeForDistance): PlannedDistanceResolution {
  const x = computePlannedDistanceKmInner(session);
  assertDistanceConsistency({
    structuredDistance: x.explicitStructuredKm,
    parsedDistance: x.parsedForCompare,
    finalDistance: x.res.km,
    sessionId: sessionId(session),
    rowKm: x.rowKm,
  });
  recordSessionDistanceResolution(x.res.source, {
    wasMismatch: x.wasMismatch,
    lowConfidenceOverride: x.lowConfidenceParsedRejected,
  });
  return x.res;
}

/** Legacy normalization entry: same as resolve; tags legacy when recipe uses raw plan row. */
export function normalizeSessionDistance(session: SessionShapeForDistance): PlannedDistanceResolution {
  return resolveSessionPlannedDistanceKm(session);
}

export function getSessionPlannedDistanceKm(session: SessionShapeForDistance): number {
  const r = resolveSessionPlannedDistanceKm(session);
  if (ENABLE_DISTANCE_DEBUG) {
    // eslint-disable-next-line no-console
    console.log("[distanceDebug:session]", {
      sessionId: sessionId(session),
      type: session.type,
      finalKm: r.km,
      source: r.source,
      metrics: getDistanceSystemMetrics(),
    });
  }
  return r.km;
}

/**
 * Distance shown in the UI only — never a load-equivalent. Null when the session is not distance-based
 * (e.g. strength, bike); use getPlannedKmEquiv / getSessionPlannedDistanceKm in analytics and scoring only.
 */
export function getDisplayPlannedDistanceKm(
  session: SessionShapeForDistance & { type: string },
): number | null {
  if (!isDistanceBasedSession(session)) return null;
  return getSessionPlannedDistanceKm(session);
}

/** Pure peek (no metrics) — for logging / batch tools. */
export function peekPlannedDistanceKm(session: SessionShapeForDistance): PlannedDistanceResolution {
  return computePlannedDistanceKmInner(session).res;
}

/** Dev: compare plan row, parsed recipe, explicit structured, actual, and resolved target. */
export function logDistanceBreakdown(
  session: SessionShapeForDistance & { id?: string },
  log?: {
    assignedRun?: { distanceKm?: number } | null;
    actualKm?: string;
  },
  precomputed?: PlannedDistanceResolution,
): void {
  const plannedRowKm = typeof session.km === "number" && session.km > 0 ? session.km : 0;
  const structuredFromExplicit =
    session.structured && typeof session.structured === "object"
      ? computeStructuredWorkoutDistance(session.structured)
      : null;
  const structuredDistance = structuredFromExplicit != null && structuredFromExplicit > 0 ? structuredFromExplicit : null;

  const parsedR = RECIPE_TYPES.has(session.type) ? parseStructuredWorkoutSpecFromDesc(session.desc) : null;
  const parsedDistance =
    parsedR && computeStructuredWorkoutDistance(parsedR.workout) > 0
      ? computeStructuredWorkoutDistance(parsedR.workout)
      : null;

  const resolution = precomputed ?? peekPlannedDistanceKm(session);
  const finalPlannedDistance = resolution.km;
  const sourceUsed = resolution.source;

  let actual: number | null = null;
  if (log?.assignedRun && typeof log.assignedRun.distanceKm === "number" && log.assignedRun.distanceKm > 0) {
    actual = formatKm(log.assignedRun.distanceKm);
  } else if (log?.actualKm) {
    const p = Number.parseFloat(String(log.actualKm).replace(",", "."));
    if (Number.isFinite(p) && p > 0) actual = formatKm(p);
  }
  // eslint-disable-next-line no-console
  console.log("[distanceBreakdown]", {
    sessionId: session.id,
    type: session.type,
    plannedRowKm,
    structuredDistance,
    parsedDistance,
    parseConfidence: parsedR?.confidence,
    explicitStructured: !!session.structured,
    sourceUsed,
    actualDistance: actual,
    finalPlannedDistance,
    systemMetrics: getDistanceSystemMetrics(),
  });
}
