import { hydrateMarathonLogsFromStorage } from "./hydrateMarathonLogs";

describe("hydrateMarathonLogsFromStorage", () => {
  it("drops non-object rows, arrays, odd keys", () => {
    const parsed = {
      "": { done: true },
      ok: { done: true },
      skipNull: null,
      skipArr: [],
      nested: [],
    };
    expect(hydrateMarathonLogsFromStorage(parsed)).toEqual({
      ok: { done: true },
    });
  });

  it("noop for non-object roots", () => {
    expect(hydrateMarathonLogsFromStorage(null)).toEqual({});
    expect(hydrateMarathonLogsFromStorage([])).toEqual({});
    expect(hydrateMarathonLogsFromStorage("x")).toEqual({});
  });
});
