import {
  createStravaSyncController,
  parseStravaSyncResponse,
  requestStravaSync,
  STRAVA_AUTO_SYNC_THROTTLE_MS,
  stravaAutoSyncAllowed,
  type StravaSyncPersistedState,
  type StravaSyncResult,
} from "./stravaSync";

const T0 = Date.parse("2026-11-16T12:00:00.000Z");

function harness(results: StravaSyncResult[] = [{ status: "ok", imported: 1, fetched: 1 }]) {
  let now = T0;
  let state: StravaSyncPersistedState = {};
  const runSync = jest.fn(async () => results.shift() ?? { status: "ok", imported: 0, fetched: 0 });
  const onResult = jest.fn();
  const controller = createStravaSyncController({
    runSync,
    onResult,
    nowEpochMs: () => now,
    readState: () => state,
    writeState: (s) => {
      state = s;
    },
  });
  return {
    controller,
    runSync,
    onResult,
    advance: (ms: number) => {
      now += ms;
    },
    getState: () => state,
    setState: (s: StravaSyncPersistedState) => {
      state = s;
    },
  };
}

describe("parseStravaSyncResponse", () => {
  test("Fachzustände", () => {
    expect(parseStravaSyncResponse(200, { status: "ok", imported: 3, fetched: 5 })).toEqual({ status: "ok", imported: 3, fetched: 5 });
    expect(parseStravaSyncResponse(200, { status: "not_connected" })).toEqual({ status: "not_connected" });
    expect(parseStravaSyncResponse(200, { status: "reconnect_required" })).toEqual({ status: "reconnect_required" });
    expect(parseStravaSyncResponse(200, { status: "rate_limited", retryAfter: 120 })).toEqual({ status: "rate_limited", retryAfter: 120 });
  });

  test("429 (eigenes Kontingent oder Strava) → rate_limited, Wartezeit mindestens 60 s", () => {
    expect(parseStravaSyncResponse(429, { status: "rate_limited", retryAfter: 1800 })).toEqual({ status: "rate_limited", retryAfter: 1800 });
    expect(parseStravaSyncResponse(429, { error: "Rate limit exceeded", retryAfterSeconds: 5 })).toEqual({ status: "rate_limited", retryAfter: 60 });
    expect(parseStravaSyncResponse(429, null)).toEqual({ status: "rate_limited", retryAfter: 900 });
  });

  test("401, 5xx, Unbekanntes → error", () => {
    expect(parseStravaSyncResponse(401, { error: "Missing Authorization bearer token" })).toEqual({ status: "error" });
    expect(parseStravaSyncResponse(502, { status: "error" })).toEqual({ status: "error" });
    expect(parseStravaSyncResponse(200, { foo: 1 })).toEqual({ status: "error" });
  });
});

describe("requestStravaSync", () => {
  test("POST mit Token an /api/strava/sync", async () => {
    const fetchImpl = jest.fn(async () => ({ status: 200, json: async () => ({ status: "ok", imported: 2, fetched: 2 }) }));
    const res = await requestStravaSync({
      baseUrl: "https://api.example",
      getAuthHeaders: async () => ({ Authorization: "Bearer jwt" }),
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(res).toEqual({ status: "ok", imported: 2, fetched: 2 });
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.example/api/strava/sync",
      expect.objectContaining({ method: "POST", headers: expect.objectContaining({ Authorization: "Bearer jwt" }) }),
    );
  });

  test("ohne Session kein Aufruf; Netzfehler → error (wirft nie)", async () => {
    const fetchImpl = jest.fn(async () => {
      throw new Error("offline");
    });
    jest.spyOn(console, "warn").mockImplementation(() => {});
    await expect(
      requestStravaSync({ baseUrl: "", getAuthHeaders: async () => ({}), fetchImpl: fetchImpl as unknown as typeof fetch }),
    ).resolves.toEqual({ status: "error" });
    expect(fetchImpl).not.toHaveBeenCalled();
    await expect(
      requestStravaSync({ baseUrl: "", getAuthHeaders: async () => ({ Authorization: "Bearer x" }), fetchImpl: fetchImpl as unknown as typeof fetch }),
    ).resolves.toEqual({ status: "error" });
  });
});

describe("Drossel", () => {
  test("stravaAutoSyncAllowed: 15 min ab letztem automatischen Versuch, Wartezeit nach rate_limited", () => {
    expect(STRAVA_AUTO_SYNC_THROTTLE_MS).toBe(15 * 60 * 1000);
    expect(stravaAutoSyncAllowed({}, T0)).toBe("ok");
    expect(stravaAutoSyncAllowed({ lastAutoAttemptAtMs: T0 }, T0 + 14 * 60000)).toBe("throttled");
    expect(stravaAutoSyncAllowed({ lastAutoAttemptAtMs: T0 }, T0 + 15 * 60000)).toBe("ok");
    expect(stravaAutoSyncAllowed({ notBeforeMs: T0 + 1000 }, T0)).toBe("backoff");
    // Uhr zurückgestellt: kein Dauer-Sperren.
    expect(stravaAutoSyncAllowed({ lastAutoAttemptAtMs: T0 + 3600000 }, T0)).toBe("ok");
  });

  test("App-Start und Vordergrund: höchstens alle 15 min, lokal gemerkt", async () => {
    const h = harness();
    await expect(h.controller.trigger("cold-start")).resolves.toMatchObject({ ran: true });
    expect(h.getState().lastAutoAttemptAtMs).toBe(T0);
    h.advance(5 * 60000);
    await expect(h.controller.trigger("resume")).resolves.toEqual({ ran: false, skipped: "throttled" });
    h.advance(10 * 60000);
    await expect(h.controller.trigger("resume")).resolves.toMatchObject({ ran: true });
    expect(h.runSync).toHaveBeenCalledTimes(2);
  });

  test("Merker überlebt einen Neustart (neuer Controller, gleicher Speicher)", async () => {
    const h = harness();
    h.setState({ lastAutoAttemptAtMs: T0 - 60000, lastStatus: "ok" });
    await expect(h.controller.trigger("cold-start")).resolves.toEqual({ ran: false, skipped: "throttled" });
    expect(h.runSync).not.toHaveBeenCalled();
  });

  test("„Jetzt synchronisieren“ ignoriert die Drossel und verschiebt sie nicht", async () => {
    const h = harness();
    await h.controller.trigger("cold-start");
    h.advance(60000);
    await expect(h.controller.trigger("manual")).resolves.toMatchObject({ ran: true });
    expect(h.getState().lastAutoAttemptAtMs).toBe(T0);
    expect(h.runSync).toHaveBeenCalledTimes(2);
  });

  test("rate_limited: automatisch erst nach retryAfter wieder, manuell sofort", async () => {
    const h = harness([{ status: "rate_limited", retryAfter: 3600 }, { status: "ok", imported: 0, fetched: 0 }]);
    await h.controller.trigger("cold-start");
    expect(h.getState().notBeforeMs).toBe(T0 + 3600 * 1000);
    h.advance(20 * 60000);
    await expect(h.controller.trigger("resume")).resolves.toEqual({ ran: false, skipped: "backoff" });
    await expect(h.controller.trigger("manual")).resolves.toMatchObject({ ran: true, result: { status: "ok" } });
    expect(h.getState().notBeforeMs).toBeUndefined();
  });

  test("nie parallel; Fehler im Lauf → error, Controller bleibt benutzbar", async () => {
    let release: () => void = () => {};
    let now = T0;
    const runSync = jest
      .fn<Promise<StravaSyncResult>, []>()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            release = () => resolve({ status: "ok", imported: 0, fetched: 0 });
          }),
      )
      .mockImplementationOnce(async () => {
        throw new Error("boom");
      });
    jest.spyOn(console, "warn").mockImplementation(() => {});
    let state: StravaSyncPersistedState = {};
    const controller = createStravaSyncController({
      runSync,
      nowEpochMs: () => now,
      readState: () => state,
      writeState: (s) => {
        state = s;
      },
    });
    const first = controller.trigger("cold-start");
    await expect(controller.trigger("manual")).resolves.toEqual({ ran: false, skipped: "in-flight" });
    release();
    await first;
    now += 1;
    await expect(controller.trigger("manual")).resolves.toEqual({ ran: true, result: { status: "error" } });
    expect(state.lastStatus).toBe("error");
  });

  test("onResult bekommt das Ergebnis; reconnect_required wird gemerkt", async () => {
    const h = harness([{ status: "reconnect_required" }]);
    await h.controller.trigger("cold-start");
    expect(h.onResult).toHaveBeenCalledWith({ status: "reconnect_required" }, "cold-start");
    expect(h.getState().lastStatus).toBe("reconnect_required");
  });
});
