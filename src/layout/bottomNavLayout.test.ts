import {
  BOTTOM_NAV_BOTTOM_OFFSET_PX,
  BOTTOM_NAV_CONTENT_GAP_PX,
  BOTTOM_NAV_HEIGHT_PX,
  BOTTOM_NAV_RESERVED_PX,
  getBottomNavBottomOffset,
  getBottomNavContentPadding,
  getHomeBaseDensity,
  nextHomeDensity,
} from "./bottomNavLayout";
import { getHomeSpacing } from "./layoutBudget";
import { validateClearOfBottomNav } from "./layoutValidation";

function elWithRect(rect: Partial<DOMRect>): HTMLElement {
  const el = document.createElement("div");
  el.getBoundingClientRect = () => ({ top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => ({}), ...rect }) as DOMRect;
  return el;
}

describe("Tab-Bar-Reserve", () => {
  test("reservierter Platz = Bar + Abstand zum Rand + Luft, plus Safe Area", () => {
    expect(BOTTOM_NAV_RESERVED_PX).toBe(BOTTOM_NAV_HEIGHT_PX + BOTTOM_NAV_BOTTOM_OFFSET_PX + BOTTOM_NAV_CONTENT_GAP_PX);
    expect(getBottomNavContentPadding()).toBe(`calc(${BOTTOM_NAV_RESERVED_PX}px + env(safe-area-inset-bottom, 0px))`);
    expect(getBottomNavBottomOffset()).toBe(`calc(${BOTTOM_NAV_BOTTOM_OFFSET_PX}px + env(safe-area-inset-bottom, 0px))`);
  });

  test("der Inhalt endet mit Luft über der Bar, nicht darunter", () => {
    expect(BOTTOM_NAV_RESERVED_PX).toBeGreaterThan(BOTTOM_NAV_HEIGHT_PX + BOTTOM_NAV_BOTTOM_OFFSET_PX);
  });
});

describe("nextHomeDensity", () => {
  const iphone13 = { viewportHeightPx: 844, coachExpanded: false };

  test("kein Überlauf: Stufe bleibt", () => {
    expect(nextHomeDensity(0, { ...iphone13, overflowPx: 0 })).toBe(0);
    expect(nextHomeDensity(1, { ...iphone13, overflowPx: 1 })).toBe(1);
  });

  test("Überlauf verdichtet schrittweise bis dense und nicht weiter", () => {
    expect(nextHomeDensity(0, { ...iphone13, overflowPx: 47 })).toBe(1);
    expect(nextHomeDensity(1, { ...iphone13, overflowPx: 8 })).toBe(2);
    expect(nextHomeDensity(2, { ...iphone13, overflowPx: 30 })).toBe(2);
  });

  test("verdichtet nie zurück (kein Pendeln, wenn die dichtere Stufe passt)", () => {
    expect(nextHomeDensity(2, { ...iphone13, overflowPx: 0 })).toBe(2);
  });

  test("Viewport unter 664 pt startet mindestens kompakt; iPhone SE (667 pt) nicht automatisch", () => {
    expect(getHomeBaseDensity(667)).toBe(0);
    expect(getHomeBaseDensity(844)).toBe(0);
    expect(getHomeBaseDensity(568)).toBe(1);
    expect(nextHomeDensity(0, { viewportHeightPx: 568, coachExpanded: false, overflowPx: 0 })).toBe(1);
  });

  test("aufgeklappte Einschätzung: Tail darf scrollen, keine Verdichtung durch Überlauf", () => {
    expect(nextHomeDensity(0, { viewportHeightPx: 844, coachExpanded: true, overflowPx: 200 })).toBe(0);
  });

  test("zu hohe Kopf-Säule (bisherige Heuristik) macht mindestens kompakt — auch aufgeklappt", () => {
    expect(nextHomeDensity(0, { viewportHeightPx: 667, coachExpanded: true, overflowPx: 0, headerTight: true })).toBe(1);
    expect(nextHomeDensity(0, { viewportHeightPx: 844, coachExpanded: false, overflowPx: 0, headerTight: true })).toBe(1);
    expect(nextHomeDensity(2, { viewportHeightPx: 844, coachExpanded: false, overflowPx: 0, headerTight: true })).toBe(2);
  });
});

describe("getHomeSpacing dense", () => {
  test("dense ist in jeder Höhen-Dimension höchstens so groß wie compact, compact höchstens wie comfortable", () => {
    const comfortable = getHomeSpacing("comfortable", false);
    const compact = getHomeSpacing("compact", false);
    const dense = getHomeSpacing("dense", false);
    for (const key of ["columnGap", "belowFoldGap", "ringPx", "ringToActions", "coachCardGap", "metricsTileGap"] as const) {
      expect(dense[key]).toBeLessThanOrEqual(compact[key]);
      expect(compact[key]).toBeLessThanOrEqual(comfortable[key]);
    }
    expect(dense.ringPx).toBeLessThan(comfortable.ringPx);
  });

  test("comfortable/compact bleiben unverändert", () => {
    expect(getHomeSpacing("comfortable", false).ringPx).toBe(138);
    expect(getHomeSpacing("compact", false).ringPx).toBe(118);
    expect(getHomeSpacing("compact", false)).toMatchObject({
      columnGap: 6, ringFontPx: 33, ringToActions: 8, coachCardPadding: "6px 8px", coachCardGap: 3,
      metricsTopTilePadding: "6px 5px", metricsTilePadding: "7px 7px", metricsTileGap: 3,
    });
    expect(getHomeSpacing("comfortable", false).metricsTilePadding).toBe("7px 7px");
  });
});

describe("validateClearOfBottomNav", () => {
  let warn: jest.SpyInstance;
  beforeEach(() => {
    warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => warn.mockRestore());

  const nav = () => elWithRect({ top: 723, bottom: 798, height: 75 });

  test("Inhalt endet über der Bar: keine Warnung", () => {
    expect(validateClearOfBottomNav(elWithRect({ bottom: 715 }), nav(), "home")).toBe(0);
    expect(warn).not.toHaveBeenCalled();
  });

  test("Inhalt reicht unter die Bar: Warnung mit Überlappung", () => {
    expect(validateClearOfBottomNav(elWithRect({ bottom: 724 }), nav(), "performance")).toBe(1);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("performance"));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("under the bottom nav"));
  });

  test("fehlende Elemente oder nicht gelayoutete Bar: kein Befund", () => {
    expect(validateClearOfBottomNav(null, nav(), "x")).toBe(0);
    expect(validateClearOfBottomNav(elWithRect({ bottom: 900 }), elWithRect({ top: 0, height: 0 }), "x")).toBe(0);
    expect(warn).not.toHaveBeenCalled();
  });
});
