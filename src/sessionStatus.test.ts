import { getSessionStatus } from "./sessionStatus";

describe("getSessionStatus", () => {
  it("ist offen ohne Log oder mit leerem Log", () => {
    expect(getSessionStatus(undefined)).toBe("open");
    expect(getSessionStatus(null)).toBe("open");
    expect(getSessionStatus({})).toBe("open");
    expect(getSessionStatus({ done: false, skipped: false })).toBe("open");
  });

  it("ist erledigt bei done", () => {
    expect(getSessionStatus({ done: true })).toBe("done");
  });

  it("ist erledigt bei zugeordnetem Health-Lauf", () => {
    expect(getSessionStatus({ assignedRun: { runId: "run-1" } })).toBe("done");
  });

  it("ist übersprungen bei skipped", () => {
    expect(getSessionStatus({ skipped: true })).toBe("skipped");
  });

  it("skipped gewinnt vor done", () => {
    expect(getSessionStatus({ done: true, skipped: true })).toBe("skipped");
    expect(getSessionStatus({ skipped: true, assignedRun: { runId: "run-1" } })).toBe("skipped");
  });
});
