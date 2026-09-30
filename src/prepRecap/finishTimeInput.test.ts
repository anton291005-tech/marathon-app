import { parseFinishTimeParts, sanitizeTimeDigits, splitFinishSeconds } from "./finishTimeInput";

describe("finishTimeInput", () => {
  it("zerlegt Sekunden in h/mm/ss", () => {
    expect(splitFinishSeconds(11637)).toEqual({ hours: "3", minutes: "13", seconds: "57" });
    expect(splitFinishSeconds(3605)).toEqual({ hours: "1", minutes: "00", seconds: "05" });
  });

  it("filtert Nicht-Ziffern und kürzt", () => {
    expect(sanitizeTimeDigits("1a2:3", 2)).toBe("12");
    expect(sanitizeTimeDigits("", 2)).toBe("");
  });

  it("liefert eine gültige Zeit", () => {
    expect(parseFinishTimeParts({ hours: "3", minutes: "13", seconds: "57" })).toEqual({ ok: true, seconds: 11637 });
    expect(parseFinishTimeParts({ hours: "0", minutes: "45", seconds: "0" })).toEqual({ ok: true, seconds: 2700 });
  });

  it("unvollständig: kein Fehlertext", () => {
    expect(parseFinishTimeParts({ hours: "", minutes: "", seconds: "" })).toEqual({ ok: false, error: null });
    expect(parseFinishTimeParts({ hours: "3", minutes: "13", seconds: "" })).toEqual({ ok: false, error: null });
  });

  it("lehnt Minuten/Sekunden über 59 ab", () => {
    const r = parseFinishTimeParts({ hours: "3", minutes: "75", seconds: "00" });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toMatch(/bis 59/);
  });

  it("lehnt unplausible Zeiten ab", () => {
    expect(parseFinishTimeParts({ hours: "0", minutes: "03", seconds: "13" }).ok).toBe(false);
    expect(parseFinishTimeParts({ hours: "0", minutes: "00", seconds: "00" }).ok).toBe(false);
  });
});
