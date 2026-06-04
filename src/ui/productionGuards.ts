import { hasPersistedSupabaseSession } from "../lib/supabase/hasPersistedSupabaseSession";

function nowEnv(): string {
  try {
    // CRA replaces process.env.NODE_ENV at build-time.
    return typeof process !== "undefined" && process.env && process.env.NODE_ENV ? process.env.NODE_ENV : "production";
  } catch {
    return "production";
  }
}

const IS_DEV = nowEnv() === "development";
const IS_PROD = nowEnv() === "production";

const warned = new Set<string>();

/** Only `src/core/time/timeSystem.ts` may invoke wall-clock `Date.now()` (bundler stacks still name this file). */
function isAuthorizedDateNowStack(stack: string | undefined): boolean {
  if (!stack) return false;
  return stack.includes("timeSystem.ts") || stack.includes("timeSystem.tsx");
}

// Dev runtime guard: Date.now() must not be used outside timeSystem.
// - Never runs in production (NODE_ENV !== "development")
// - Never throws: always falls back to native Date.now when available
// - Misuse: log message + full stack trace; SSOT time module is allowlisted (no spam)
if (IS_DEV) {
  try {
    const g = globalThis as unknown as { __GUARD_DATE_NOW_LOCK__?: boolean; __GUARD_DATE_NOW_ORIG__?: () => number };
    if (!g.__GUARD_DATE_NOW_LOCK__) {
      g.__GUARD_DATE_NOW_LOCK__ = true;
      const dateObj = Date as unknown as Record<string, unknown>;
      const originalNow = dateObj["now"];
      if (typeof originalNow === "function") g.__GUARD_DATE_NOW_ORIG__ = (originalNow as () => number).bind(Date);
      Object.defineProperty(Date, "now", {
        configurable: true,
        writable: true,
        value: () => {
          let stack: string | undefined;
          try {
            stack = new Error().stack;
          } catch {
            stack = undefined;
          }

          if (!isAuthorizedDateNowStack(stack)) {
            try {
              // eslint-disable-next-line no-console
              console.error(
                "[GUARD] Time invariant violation: Date.now() outside timeSystem. Use getAppNowEpochMs() from src/core/time/timeSystem.ts.\n",
                stack || "(no stack)",
              );
            } catch {
              // ignore
            }
          }

          try {
            return typeof g.__GUARD_DATE_NOW_ORIG__ === "function" ? g.__GUARD_DATE_NOW_ORIG__() : 0;
          } catch {
            return 0;
          }
        },
      });
    }
  } catch {
    // If Date.now cannot be overridden (platform restriction), fail silently.
  }
}

export function warnOnce(tag: string, payload?: AnyRecord): void {
  if (!IS_DEV) return;
  if (warned.has(tag)) return;
  warned.add(tag);
  try {
    // eslint-disable-next-line no-console
    console.warn(`[GUARD] ${tag}`, payload || {});
  } catch {
    // ignore
  }
}

function isProdGuardEnabled(): boolean {
  if (!IS_PROD) return false;
  if (hasPersistedSupabaseSession()) return false;
  try {
    const q = new URLSearchParams(globalThis.location?.search || "");
    if (q.get("guard") === "1") return true;
  } catch {
    // ignore
  }
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem("UI_GUARD") === "1";
  } catch {
    return false;
  }
}

type AnyRecord = Record<string, unknown>;

const prodLogged = new Set<string>();

/**
 * Production-safe low-verbosity logger (opt-in via `?guard=1` or `localStorage.UI_GUARD=1`).
 * Logs at most once per key for the session.
 */
export function productionGuardLog(key: string, payload?: AnyRecord): void {
  if (!isProdGuardEnabled()) return;
  if (prodLogged.has(key)) return;
  prodLogged.add(key);
  try {
    // eslint-disable-next-line no-console
    console.log(`[guard] ${key}`);
    if (payload && Object.keys(payload).length) {
      // eslint-disable-next-line no-console
      console.log(payload);
    }
  } catch {
    // ignore
  }
}

type FrameRegistry = {
  frame: number;
  marks: Map<string, { count: number; firstValue?: unknown; lastValue?: unknown }>;
  rafScheduled: boolean;
};

function getRegistry(): FrameRegistry {
  const g = globalThis as any;
  if (!g.__UI_GUARD_REGISTRY__) {
    g.__UI_GUARD_REGISTRY__ = { frame: 0, marks: new Map(), rafScheduled: false } as FrameRegistry;
  }
  return g.__UI_GUARD_REGISTRY__ as FrameRegistry;
}

/**
 * Dev-only non-blocking duplication detector.
 * - Logs a warning if the same key is marked multiple times within one animation frame.
 * - If a value is provided and differs across marks, logs a "conflict" warning.
 */
export function devMarkOncePerFrame(key: string, value?: unknown, meta?: AnyRecord): void {
  if (!IS_DEV) return;
  const r = getRegistry();
  const existing = r.marks.get(key);
  if (!existing) {
    r.marks.set(key, { count: 1, firstValue: value, lastValue: value });
  } else {
    existing.count += 1;
    existing.lastValue = value;
    const conflict = value !== undefined && existing.firstValue !== undefined && existing.firstValue !== value;
    warnOnce(
      conflict ? `duplicate_conflict:${key}` : `duplicate:${key}`,
      conflict
        ? { key, firstValue: existing.firstValue, lastValue: value, count: existing.count, ...(meta || {}) }
        : { key, count: existing.count, ...(meta || {}) },
    );
  }

  if (!r.rafScheduled) {
    r.rafScheduled = true;
    try {
      requestAnimationFrame(() => {
        r.frame += 1;
        r.marks.clear();
        r.rafScheduled = false;
      });
    } catch {
      // If RAF isn't available, degrade to "warn once per key" behavior
      r.rafScheduled = false;
    }
  }
}

/**
 * Production-safe duplication detector (opt-in).
 * - Same semantics as devMarkOncePerFrame but logs minimally and never warns loudly.
 * - No-ops unless guard flag is enabled.
 */
export function productionMarkOncePerFrame(key: string, value?: unknown, meta?: AnyRecord): void {
  if (!isProdGuardEnabled()) return;
  const r = getRegistry();
  const existing = r.marks.get(key);
  if (!existing) {
    r.marks.set(key, { count: 1, firstValue: value, lastValue: value });
  } else {
    existing.count += 1;
    existing.lastValue = value;
    const conflict = value !== undefined && existing.firstValue !== undefined && existing.firstValue !== value;
    productionGuardLog(conflict ? `dup_conflict:${key}` : `dup:${key}`, {
      key,
      count: existing.count,
      ...(conflict ? { firstValue: existing.firstValue, lastValue: value } : {}),
      ...(meta || {}),
    });
  }
  if (!r.rafScheduled) {
    r.rafScheduled = true;
    try {
      requestAnimationFrame(() => {
        r.frame += 1;
        r.marks.clear();
        r.rafScheduled = false;
      });
    } catch {
      r.rafScheduled = false;
    }
  }
}

type MetricSourceRegistry = {
  sourcesByMetric: Map<string, Set<string>>;
};

function getMetricRegistry(): MetricSourceRegistry {
  const g = globalThis as any;
  if (!g.__UI_GUARD_METRICS__) {
    g.__UI_GUARD_METRICS__ = { sourcesByMetric: new Map() } as MetricSourceRegistry;
  }
  return g.__UI_GUARD_METRICS__ as MetricSourceRegistry;
}

/**
 * Global SSOT monitor (dev warns; prod logs only if enabled).
 * Tracks sources that attempt to render a metric key across the session.
 */
export function monitorMetricSource(metricKey: string, source: string, value?: unknown): void {
  const r = getMetricRegistry();
  const set = r.sourcesByMetric.get(metricKey) ?? new Set<string>();
  set.add(source);
  r.sourcesByMetric.set(metricKey, set);
  if (set.size <= 1) return;
  const sources = Array.from(set.values()).sort();
  warnOnce(`ssot_violation:${metricKey}`, { metricKey, sources, value });
  productionGuardLog(`ssot:${metricKey}`, { metricKey, sources });
}

export function clampScore0_100(input: unknown, tagForWarn?: string): number | null {
  const n = typeof input === "number" ? input : input == null ? null : Number(input);
  if (n == null || !Number.isFinite(n)) {
    if (tagForWarn) warnOnce(`invalid_score:${tagForWarn}`, { input });
    return null;
  }
  const clamped = Math.max(0, Math.min(100, Math.round(n)));
  if (clamped !== n && tagForWarn) warnOnce(`score_out_of_range:${tagForWarn}`, { input: n, clamped });
  return clamped;
}

export function safeNonNaNString(value: unknown, tagForWarn?: string): string | null {
  if (typeof value !== "string") return null;
  const t = value.replace(/\s+/g, " ").trim();
  if (!t) return null;
  if (t.includes("NaN")) {
    if (tagForWarn) warnOnce(`nan_in_string:${tagForWarn}`, { value: t });
    return null;
  }
  return t;
}

/**
 * Force one German sentence (UI safety). If input has multiple sentences, keep the first.
 * If it has no terminal punctuation, keep as-is but trim and normalize whitespace.
 */
export function sanitizeOneSentence(value: unknown, tagForWarn?: string): string {
  const raw = typeof value === "string" ? value : value == null ? "" : String(value);
  const t = raw.replace(/\s+/g, " ").trim();
  if (!t) return "";
  const m = t.match(/^(.+?[.!?])(\\s|$)/);
  if (m && m[1]) {
    const first = m[1].trim();
    if (first !== t && tagForWarn) warnOnce(`multi_sentence_trim:${tagForWarn}`, { before: t, after: first });
    return first;
  }
  return t;
}

