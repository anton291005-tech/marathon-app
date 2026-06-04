import { validateToolCall } from "./validateToolCall";

describe("validateToolCall", () => {
  it("rejects unknown tool names", () => {
    expect(validateToolCall("deleteEverything", {})).toBe(false);
    expect(validateToolCall("", {})).toBe(false);
  });

  it("adjustTrainingPlan rejects extreme intensity", () => {
    expect(validateToolCall("adjustTrainingPlan", { intensity: "extreme" })).toBe(false);
    expect(validateToolCall("adjustTrainingPlan", { intensity: "moderate" })).toBe(true);
  });

  it("swapTrainingDays requires string day endpoints", () => {
    expect(validateToolCall("swapTrainingDays", { dayA: "Mon", dayB: "Tue" })).toBe(true);
    expect(validateToolCall("swapTrainingDays", { dayA: "Mon" })).toBe(false);
    expect(validateToolCall("swapTrainingDays", null)).toBe(false);
  });

  it("addRestDay accepts plain objects only", () => {
    expect(validateToolCall("addRestDay", {})).toBe(true);
    expect(validateToolCall("addRestDay", null)).toBe(false);
    expect(validateToolCall("addRestDay", [])).toBe(false);
  });
});
