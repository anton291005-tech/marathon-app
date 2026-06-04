import { renderHook, act } from "@testing-library/react";
import { useAiCoachChatMessagesState } from "./useAiCoachChatMessagesState";

describe("useAiCoachChatMessagesState", () => {
  it("starts with assistant welcome (same seed shape as prior App.tsx)", () => {
    const { result } = renderHook(() => useAiCoachChatMessagesState());
    expect(result.current[0]).toHaveLength(1);
    expect(result.current[0][0].role).toBe("assistant");
    expect(String(result.current[0][0].text)).toContain("Plan-Coach");
  });

  it("setMessages updates like inline useState tuple", () => {
    const { result } = renderHook(() => useAiCoachChatMessagesState());
    act(() => {
      result.current[1]((prev) => [...prev, { id: "u1", role: "user", type: "text", text: "Hi" } as any]);
    });
    expect(result.current[0]).toHaveLength(2);
    expect(result.current[0][1].role).toBe("user");
  });
});
