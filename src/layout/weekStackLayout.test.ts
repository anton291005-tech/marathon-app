import { getWeekSessionRowWrapStyle, getWeekStackContainerStyle, shouldWeekStackScroll } from "./weekStackLayout";

const none = { hasExpandedSessionDesc: false, pendingCalendarProposal: null, weekCalendarBatchProposal: null };

describe("shouldWeekStackScroll", () => {
  test("ohne offenes Panel und ohne aufgeklappte Beschreibung: kein Scroll-Modus", () => {
    expect(shouldWeekStackScroll(none)).toBe(false);
    expect(shouldWeekStackScroll({ ...none, pendingCalendarProposal: undefined, weekCalendarBatchProposal: undefined })).toBe(false);
  });

  test("aufgeklappte Session-Beschreibung: Scroll-Modus", () => {
    expect(shouldWeekStackScroll({ ...none, hasExpandedSessionDesc: true })).toBe(true);
  });

  test.each([
    ["Tagespanel mit Vorschlag (mode preview + action)", { mode: "preview", action: { id: "a" }, patches: [], candidates: [] }],
    ["Tagespanel ohne Alternative (mode preview, action null)", { mode: "preview", action: null, patches: [], candidates: [] }],
    ["Tag-Auswahl (mode select)", { mode: "select", action: null, patches: [], candidates: [] }],
  ])("jedes offene Einzel-Kalender-Panel macht den Stack scrollbar: %s", (_label, proposal) => {
    expect(shouldWeekStackScroll({ ...none, pendingCalendarProposal: proposal })).toBe(true);
  });

  test.each(["proposal", "no-conflicts", "blocked"])("Wochen-Batch-Panel (status %s) macht den Stack scrollbar", (status) => {
    expect(shouldWeekStackScroll({ ...none, weekCalendarBatchProposal: { status, action: null, patches: [] } })).toBe(true);
  });
});

describe("getWeekSessionRowWrapStyle", () => {
  test("Standard: Zeilen teilen sich die Höhe und schneiden Überlauf ab", () => {
    expect(getWeekSessionRowWrapStyle(false)).toMatchObject({ flex: "1 1 0%", overflow: "hidden" });
  });

  test("Standard: Zeile schrumpft nie unter ihre Inhaltshöhe (mehrzeiliger Renntag-Titel bei 390px)", () => {
    expect(getWeekSessionRowWrapStyle(false)).toMatchObject({ minHeight: "min-content" });
  });

  test("Scroll-Modus: Zeilen behalten natürliche Höhe (nicht gequetscht) und sind nicht abgeschnitten", () => {
    expect(getWeekSessionRowWrapStyle(true)).toMatchObject({ flex: "0 0 auto", overflow: "visible" });
  });
});

describe("getWeekStackContainerStyle", () => {
  test("Default-Fall (nichts aufgeklappt, kein Kalender-Panel): Stack ist trotzdem scrollbar", () => {
    // Race Week: 7 Zeilen passen nicht in die Stackhoehe, ohne Scroll faellt die So-Zeile raus.
    expect(getWeekStackContainerStyle({ scrollMode: false, hasSessionRows: true })).toMatchObject({
      overflowY: "auto",
      WebkitOverflowScrolling: "touch",
    });
  });

  test("Scroll-Modus aendert nichts am Scrollen — overflowY bleibt in jedem Zustand 'auto'", () => {
    for (const scrollMode of [false, true]) {
      for (const hasSessionRows of [false, true]) {
        expect(getWeekStackContainerStyle({ scrollMode, hasSessionRows }).overflowY).toBe("auto");
      }
    }
  });

  test("Mit Session-Zeilen nie 'space-evenly': dessen center-Fallback macht die erste Zeile unerreichbar", () => {
    expect(getWeekStackContainerStyle({ scrollMode: false, hasSessionRows: true }).justifyContent).toBe("flex-start");
    expect(getWeekStackContainerStyle({ scrollMode: true, hasSessionRows: true }).justifyContent).toBe("flex-start");
  });

  test("Leer-Zustand (keine Einheiten): Hinweiskarte bleibt gleichmaessig verteilt", () => {
    expect(getWeekStackContainerStyle({ scrollMode: false, hasSessionRows: false }).justifyContent).toBe("space-evenly");
  });

  test("Gap folgt weiterhin dem Scroll-Modus", () => {
    expect(getWeekStackContainerStyle({ scrollMode: false, hasSessionRows: true }).gap).toBe(0);
    expect(getWeekStackContainerStyle({ scrollMode: true, hasSessionRows: true }).gap).toBe(4);
  });
});
