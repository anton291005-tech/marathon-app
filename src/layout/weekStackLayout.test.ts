import { getWeekSessionRowWrapStyle, shouldWeekStackScroll } from "./weekStackLayout";

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

  test("Scroll-Modus: Zeilen behalten natürliche Höhe (nicht gequetscht) und sind nicht abgeschnitten", () => {
    expect(getWeekSessionRowWrapStyle(true)).toMatchObject({ flex: "0 0 auto", overflow: "visible" });
  });
});
