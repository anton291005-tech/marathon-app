/**
 * Verbindungsstatus und Trennen (W2-Nachprüfung):
 * - Netzfehler beim Start → `null` (unbekannt), nie `false` – sonst würden lokale Strava-Läufe verworfen.
 * - Trennen löscht ZUERST die Strava-Läufe; scheitert das, bleibt die Verbindung und es kommt `ok: false`.
 */

const calls: string[] = [];
const state: {
  statusResult: { data: unknown; error: unknown } | "throw";
  workoutsDeleteError: unknown;
  connectionDeleteError: unknown;
} = { statusResult: { data: null, error: null }, workoutsDeleteError: null, connectionDeleteError: null };

jest.mock("../client", () => ({
  supabase: {
    from: (table: string) => ({
      select: () => ({
        maybeSingle: async () => {
          if (state.statusResult === "throw") throw new Error("Failed to fetch");
          return state.statusResult;
        },
      }),
      delete: () => {
        const chain: any = {
          eq: () => chain,
          like: () => chain,
          then: (resolve: (v: unknown) => void) => {
            calls.push(`delete:${table}`);
            resolve({ error: table === "health_workouts" ? state.workoutsDeleteError : state.connectionDeleteError });
          },
        };
        return chain;
      },
    }),
  },
}));

// eslint-disable-next-line import/first
import { disconnectStrava, fetchStravaConnectionStatus } from "./stravaConnectionService";

beforeEach(() => {
  calls.length = 0;
  state.statusResult = { data: null, error: null };
  state.workoutsDeleteError = null;
  state.connectionDeleteError = null;
  jest.spyOn(console, "error").mockImplementation(() => {});
  jest.spyOn(console, "warn").mockImplementation(() => {});
});

describe("fetchStravaConnectionStatus", () => {
  test("Zeile mit Athleten-ID → true, keine Zeile → false", async () => {
    state.statusResult = { data: { strava_athlete_id: 1 }, error: null };
    await expect(fetchStravaConnectionStatus()).resolves.toBe(true);
    state.statusResult = { data: null, error: null };
    await expect(fetchStravaConnectionStatus()).resolves.toBe(false);
  });

  test("Netzfehler oder Fehlerantwort → null (unbekannt), nicht false", async () => {
    state.statusResult = { data: null, error: { message: "Failed to fetch" } };
    await expect(fetchStravaConnectionStatus()).resolves.toBeNull();
    state.statusResult = "throw";
    await expect(fetchStravaConnectionStatus()).resolves.toBeNull();
  });
});

describe("disconnectStrava", () => {
  test("erst Strava-Läufe, dann Verbindung löschen", async () => {
    await expect(disconnectStrava("u1")).resolves.toEqual({ ok: true });
    expect(calls).toEqual(["delete:health_workouts", "delete:strava_connections"]);
  });

  test("Löschen der Läufe scheitert → ok: false, Verbindung bleibt", async () => {
    state.workoutsDeleteError = { message: "offline" };
    await expect(disconnectStrava("u1")).resolves.toEqual({ ok: false });
    expect(calls).toEqual(["delete:health_workouts"]);
  });

  test("Löschen der Verbindung scheitert → ok: false", async () => {
    state.connectionDeleteError = { message: "offline" };
    await expect(disconnectStrava("u1")).resolves.toEqual({ ok: false });
  });
});
