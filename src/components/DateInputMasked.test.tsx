import {
  digitsFromMaskedValue,
  formatMaskedDateFromDigits,
  isCompleteMaskedDate,
  validateMaskedDateInput,
} from "./DateInputMasked";

describe("DateInputMasked helpers", () => {
  it("formats digits with auto-dots", () => {
    expect(formatMaskedDateFromDigits("")).toBe("");
    expect(formatMaskedDateFromDigits("0")).toBe("0");
    expect(formatMaskedDateFromDigits("01")).toBe("01.");
    expect(formatMaskedDateFromDigits("0106")).toBe("01.06.");
    expect(formatMaskedDateFromDigits("01062026")).toBe("01.06.2026");
  });

  it("extracts digits from masked value", () => {
    expect(digitsFromMaskedValue("01.06.2026")).toBe("01062026");
  });

  it("detects complete dates", () => {
    expect(isCompleteMaskedDate("01.06.2026")).toBe(true);
    expect(isCompleteMaskedDate("01.06.")).toBe(false);
  });

  it("rejects invalid calendar dates", () => {
    expect(validateMaskedDateInput("31.02.2026")).toBe("Ungültiges Datum.");
  });

  it("allows optional empty input", () => {
    expect(validateMaskedDateInput("", { optional: true })).toBeNull();
  });
});
