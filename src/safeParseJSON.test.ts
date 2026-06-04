import { safeParseJSON } from "./safeParseJSON";

describe("safeParseJSON", () => {
  it("returns fallback for null, empty, invalid JSON", () => {
    expect(safeParseJSON(null, [])).toEqual([]);
    expect(safeParseJSON(undefined, { a: 1 })).toEqual({ a: 1 });
    expect(safeParseJSON("", 0)).toBe(0);
    expect(safeParseJSON("{broken", { ok: true })).toEqual({ ok: true });
  });

  it("parses valid JSON with generic fallback typing", () => {
    expect(safeParseJSON('{"x":1}', {} as Record<string, never>)).toEqual({ x: 1 });
  });
});
