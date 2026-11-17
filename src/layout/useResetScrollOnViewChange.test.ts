import { renderHook } from "@testing-library/react";
import { useResetScrollOnViewChange } from "./useResetScrollOnViewChange";

describe("useResetScrollOnViewChange", () => {
  it("setzt den Scrollbereich beim Tab-Wechsel nach oben, nicht beim ersten Rendern", () => {
    const el = document.createElement("div");
    el.scrollTop = 0;
    const ref = { current: el };
    const { rerender } = renderHook(({ view }) => useResetScrollOnViewChange(ref, view), { initialProps: { view: "settings" } });
    el.scrollTop = 420;
    rerender({ view: "settings" });
    expect(el.scrollTop).toBe(420);
    rerender({ view: "coach" });
    expect(el.scrollTop).toBe(0);
  });
});
