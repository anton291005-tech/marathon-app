import { act, render, screen } from "@testing-library/react";
import { beginAppFrame, freezeTimeForTests, getAppTodayYmd } from "../../core/time/timeSystem";
import { CALENDAR_DAY_CHECK_INTERVAL_MS, useCalendarDayRefresh } from "./useCalendarDayRefresh";

let renders = 0;

/** Wie AppMain: Uhr am Anfang des Renders auffrischen, dann „heute“ anzeigen. */
function Probe() {
  beginAppFrame();
  renders += 1;
  const day = useCalendarDayRefresh();
  return (
    <div>
      <span data-testid="hook">{day}</span>
      <span data-testid="today">{getAppTodayYmd()}</span>
    </div>
  );
}

function setVisibility(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
  act(() => {
    document.dispatchEvent(new Event("visibilitychange"));
  });
}

describe("useCalendarDayRefresh", () => {
  beforeEach(() => {
    renders = 0;
    jest.useFakeTimers();
    freezeTimeForTests(new Date(2026, 10, 18, 23, 50, 0));
  });
  afterEach(() => {
    freezeTimeForTests(null);
    jest.useRealTimers();
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
  });

  it("Rückkehr in den Vordergrund am nächsten Morgen: „Heute“ ist der neue Tag", () => {
    render(<Probe />);
    expect(screen.getByTestId("today")).toHaveTextContent("2026-11-18");
    setVisibility("hidden");
    freezeTimeForTests(new Date(2026, 10, 19, 6, 30, 0));
    // Ohne Ereignis bleibt der alte Render stehen (genau das war der Fehler).
    expect(screen.getByTestId("today")).toHaveTextContent("2026-11-18");
    setVisibility("visible");
    expect(screen.getByTestId("today")).toHaveTextContent("2026-11-19");
    expect(screen.getByTestId("hook")).toHaveTextContent("2026-11-19");
  });

  it("Rückkehr am selben Tag: kein zusätzlicher Render", () => {
    render(<Probe />);
    const before = renders;
    freezeTimeForTests(new Date(2026, 10, 18, 23, 58, 0));
    setVisibility("hidden");
    setVisibility("visible");
    act(() => {
      window.dispatchEvent(new Event("focus"));
    });
    expect(renders).toBe(before);
  });

  it("App bleibt über Mitternacht offen: der Minutentakt rendert den neuen Tag", () => {
    render(<Probe />);
    freezeTimeForTests(new Date(2026, 10, 19, 0, 0, 30));
    act(() => {
      jest.advanceTimersByTime(CALENDAR_DAY_CHECK_INTERVAL_MS);
    });
    expect(screen.getByTestId("today")).toHaveTextContent("2026-11-19");
  });

  it("Sommerzeit-Ende (25.10., 25-Stunden-Tag): um 23:30 noch derselbe Tag, nach Mitternacht der nächste", () => {
    freezeTimeForTests(new Date(2026, 9, 25, 1, 30, 0));
    render(<Probe />);
    const before = renders;
    freezeTimeForTests(new Date(2026, 9, 25, 23, 30, 0));
    setVisibility("visible");
    expect(renders).toBe(before);
    freezeTimeForTests(new Date(2026, 9, 26, 0, 5, 0));
    setVisibility("visible");
    expect(screen.getByTestId("today")).toHaveTextContent("2026-10-26");
  });

  it("räumt Listener und Timer beim Unmount auf", () => {
    const view = render(<Probe />);
    view.unmount();
    freezeTimeForTests(new Date(2026, 10, 19, 6, 30, 0));
    expect(() => {
      setVisibility("visible");
      act(() => {
        jest.advanceTimersByTime(CALENDAR_DAY_CHECK_INTERVAL_MS * 2);
      });
    }).not.toThrow();
  });
});
