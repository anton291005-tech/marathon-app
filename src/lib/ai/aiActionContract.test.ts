import {
  ALLOWED_AI_ACTION_TYPES,
  coerceAiAssistantActionFromWire,
  isAllowedAiActionType,
} from "./aiActionContract";

describe("aiActionContract", () => {
  it("allow-list includes every known action slug", () => {
    expect(ALLOWED_AI_ACTION_TYPES).toContain("replace_workout");
    expect(ALLOWED_AI_ACTION_TYPES.length).toBeGreaterThan(5);
  });

  it("isAllowedAiActionType rejects unknown strings", () => {
    expect(isAllowedAiActionType("not_an_action")).toBe(false);
    expect(isAllowedAiActionType("adjust_plan_for_illness")).toBe(true);
  });

  it("coerceAiAssistantActionFromWire drops invalid payloads and normalizes preview", () => {
    expect(coerceAiAssistantActionFromWire(null)).toBeNull();
    expect(coerceAiAssistantActionFromWire({ type: "evil", payload: {} })).toBeNull();
    const a = coerceAiAssistantActionFromWire({
      type: "navigate_to_screen",
      payload: { targetScreen: "home" },
      preview: { title: "T", items: ["a", 1, "b"] },
    });
    expect(a?.type).toBe("navigate_to_screen");
    expect(a?.payload).toEqual({ targetScreen: "home" });
    expect(a?.preview?.items).toEqual(["a", "b"]);
  });

  it("coerce uses empty object when payload is not an object", () => {
    const a = coerceAiAssistantActionFromWire({ type: "explain_feature", payload: "nope" });
    expect(a?.payload).toEqual({});
  });
});
