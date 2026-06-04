export function formatScore100(value: number | string): string {
  const n =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseFloat(value)
        : NaN;
  if (!Number.isFinite(n)) return "—";
  const clamped = Math.max(0, Math.min(100, Math.round(n)));
  return `${clamped}/100`;
}

