import { act, renderHook } from "@testing-library/react";
import { STORY_SLIDE_DURATION_MS, useStoryPlayer } from "./useStoryPlayer";

describe("useStoryPlayer", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("springt nach 6 s weiter und bleibt auf der letzten Slide stehen", () => {
    const { result } = renderHook(() => useStoryPlayer({ count: 3 }));
    expect(result.current.index).toBe(0);
    act(() => jest.advanceTimersByTime(STORY_SLIDE_DURATION_MS - 1));
    expect(result.current.index).toBe(0);
    act(() => jest.advanceTimersByTime(1));
    expect(result.current.index).toBe(1);
    act(() => jest.advanceTimersByTime(STORY_SLIDE_DURATION_MS));
    expect(result.current.index).toBe(2);
    expect(result.current.isLast).toBe(true);
    expect(result.current.running).toBe(false);
    act(() => jest.advanceTimersByTime(STORY_SLIDE_DURATION_MS * 3));
    expect(result.current.index).toBe(2);
  });

  it("pausiert beim Halten und läuft mit der Restzeit weiter", () => {
    const { result } = renderHook(() => useStoryPlayer({ count: 3 }));
    act(() => jest.advanceTimersByTime(4000));
    act(() => result.current.setHeld(true));
    expect(result.current.paused).toBe(true);
    act(() => jest.advanceTimersByTime(20000));
    expect(result.current.index).toBe(0);
    act(() => result.current.setHeld(false));
    act(() => jest.advanceTimersByTime(1999));
    expect(result.current.index).toBe(0);
    act(() => jest.advanceTimersByTime(1));
    expect(result.current.index).toBe(1);
  });

  it("vor/zurück klemmt an den Rändern und startet die Slide-Zeit neu", () => {
    const { result } = renderHook(() => useStoryPlayer({ count: 3 }));
    act(() => result.current.prev());
    expect(result.current.index).toBe(0);
    act(() => jest.advanceTimersByTime(5000));
    act(() => result.current.next());
    expect(result.current.index).toBe(1);
    act(() => jest.advanceTimersByTime(5999));
    expect(result.current.index).toBe(1);
    act(() => result.current.next());
    act(() => result.current.next());
    expect(result.current.index).toBe(2);
  });

  it("klemmt einen zu großen Startindex auf die letzte Slide", () => {
    const { result } = renderHook(() => useStoryPlayer({ count: 4, initialIndex: Number.MAX_SAFE_INTEGER }));
    expect(result.current.index).toBe(3);
  });
});
