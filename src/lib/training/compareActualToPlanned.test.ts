import { compareHR, comparePace } from "./compareActualToPlanned";

describe("comparePace", () => {
  test("1. pace in corridor", () => {
    const r = comparePace(321, 320, 330);
    expect(r.status).toBe("in_range");
    expect(r.label.toLowerCase()).toContain("im plan");
    expect(r.deltaSeconds).toBe(0);
  });

  test("2. faster than corridor", () => {
    const r = comparePace(315, 320, 330);
    expect(r.status).toBe("faster");
    expect(r.deltaSeconds).toBe(5);
  });

  test("3. slower than corridor", () => {
    const r = comparePace(340, 320, 330);
    expect(r.status).toBe("slower");
    expect(r.deltaSeconds).toBe(10);
  });

  test("4. unknown when actual null", () => {
    const r = comparePace(null, 320, 330);
    expect(r.status).toBe("unknown");
  });
});

describe("compareHR", () => {
  test("5. one bpm over max", () => {
    const r = compareHR(157, 130, 156);
    expect(r.status).toBe("above");
    expect(r.deltaBpm).toBe(1);
  });

  test("6. inside range", () => {
    const r = compareHR(145, 130, 156);
    expect(r.status).toBe("in_range");
    expect(r.label.toLowerCase()).toContain("im plan");
  });

  test("7. below minimum", () => {
    const r = compareHR(125, 130, 156);
    expect(r.status).toBe("below");
    expect(r.deltaBpm).toBe(5);
  });

  test("8. unknown when actual null", () => {
    const r = compareHR(null, 130, 156);
    expect(r.status).toBe("unknown");
  });
});

describe("compareActualToPlanned labels", () => {
  test("9. pace in_range label exact", () => {
    expect(comparePace(321, 320, 330).label).toBe("Tempo im Plan ✓");
  });

  test("10. HR +1 singular", () => {
    expect(compareHR(157, 156, 156).label).toBe("+1 Schlag über Plan");
  });

  test("11. HR +5 plural", () => {
    expect(compareHR(161, 156, 156).label).toBe("+5 Schläge über Plan");
  });
});
