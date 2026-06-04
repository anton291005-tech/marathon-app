export type ValidationAxis = {
  score: number; // 0-100
  reason?: string;
};

export type ValidationResult = {
  status: "allow" | "warn" | "block";
  axes: {
    structural?: ValidationAxis;
    load?: ValidationAxis;
    recovery?: ValidationAxis;
    micro?: ValidationAxis;
  };
};

export function clampScore(score: number): number {
  if (!Number.isFinite(score)) return 0;
  return Math.max(0, Math.min(100, Math.round(score)));
}

export function axis(score: number, reason?: string): ValidationAxis {
  const r = typeof reason === "string" ? reason.trim() : "";
  return r ? { score: clampScore(score), reason: r } : { score: clampScore(score) };
}

export function allow(axes: ValidationResult["axes"] = {}): ValidationResult {
  return { status: "allow", axes };
}

export function warn(axes: ValidationResult["axes"]): ValidationResult {
  return { status: "warn", axes };
}

export function block(axes: ValidationResult["axes"]): ValidationResult {
  return { status: "block", axes };
}

export function joinReasons(parts: Array<string | null | undefined>, sep = " | "): string {
  return parts
    .map((p) => (typeof p === "string" ? p.trim() : ""))
    .filter(Boolean)
    .join(sep);
}

function joinAxisReasons(a?: ValidationAxis, b?: ValidationAxis): string {
  return joinReasons([a?.reason, b?.reason], " | ");
}

export function aggregateAxes(results: ValidationResult[]): ValidationResult["axes"] {
  const out: ValidationResult["axes"] = {};
  for (const r of results) {
    const axes = r.axes || {};
    const keys: Array<keyof ValidationResult["axes"]> = ["structural", "load", "recovery", "micro"];
    for (const k of keys) {
      const next = axes[k];
      if (!next) continue;
      const prev = out[k];
      if (!prev) {
        out[k] = { score: clampScore(next.score), reason: typeof next.reason === "string" ? next.reason : undefined };
        continue;
      }
      const nextScore = clampScore(next.score);
      const prevScore = clampScore(prev.score);
      if (nextScore > prevScore) {
        out[k] = { score: nextScore, reason: joinAxisReasons(prev, next) || undefined };
      } else {
        out[k] = { score: prevScore, reason: joinAxisReasons(prev, next) || undefined };
      }
    }
  }
  return out;
}

export function increaseAxisScore(results: ValidationResult[], axisKey: keyof ValidationResult["axes"], delta: number): ValidationResult[] {
  const d = Number(delta);
  if (!Number.isFinite(d) || d === 0) return results;
  return results.map((r) => {
    const a = r.axes?.[axisKey];
    if (!a) return r;
    return { ...r, axes: { ...r.axes, [axisKey]: { ...a, score: clampScore((a.score ?? 0) + d) } } };
  });
}

export function maxAxisScore(axes: ValidationResult["axes"]): number {
  return Math.max(
    axes.structural?.score ?? 0,
    axes.load?.score ?? 0,
    axes.recovery?.score ?? 0,
    axes.micro?.score ?? 0,
  );
}


