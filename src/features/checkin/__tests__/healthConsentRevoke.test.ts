// Widerruf der Gesundheits-Zustimmung (Migration 022): Server-RPC, danach lokale Kopien leeren.
import { readFileSync } from "fs";
import { join } from "path";
import { getHealthConsentStatus, resetHealthConsentStoreForTests, setHealthConsentStatus } from "../../../health/healthConsentStore";
import { HEALTH_DATA_LOCAL_KEYS, readHealthConsentDeclinedOnDevice, revokeHealthConsentAndData } from "../healthConsent";

const mockRpc = jest.fn();
jest.mock("../../../lib/supabase/client", () => ({
  supabase: { rpc: (...a: unknown[]) => mockRpc(...a), from: jest.fn() },
}));

const sql = readFileSync(join(process.cwd(), "supabase/migrations/022_health_consent_v2.sql"), "utf8");

beforeEach(() => {
  window.localStorage.clear();
  resetHealthConsentStoreForTests();
  mockRpc.mockReset();
  for (const key of HEALTH_DATA_LOCAL_KEYS) window.localStorage.setItem(key, "{\"x\":1}");
  window.localStorage.setItem("marathonLogs", "{\"keep\":true}");
  setHealthConsentStatus("u1", "granted");
});

describe("revokeHealthConsentAndData", () => {
  it("Erfolg: RPC einmal, lokale Gesundheitswerte geleert, Status abgelehnt (nicht erneut fragen)", async () => {
    mockRpc.mockResolvedValue({ data: { daily_checkins: 3, recovery_daily: 40, session_logs_rpe: 5 }, error: null });
    const result = await revokeHealthConsentAndData("u1");
    expect(mockRpc).toHaveBeenCalledWith("revoke_health_consent_and_data");
    expect(result).toEqual({ ok: true, deleted: { daily_checkins: 3, recovery_daily: 40, session_logs_rpe: 5 } });
    for (const key of HEALTH_DATA_LOCAL_KEYS) expect(window.localStorage.getItem(key)).toBeNull();
    expect(window.localStorage.getItem("marathonLogs")).toBe("{\"keep\":true}");
    expect(getHealthConsentStatus()).toBe("declined");
    expect(readHealthConsentDeclinedOnDevice("u1")).toBe(true);
  });

  it("Migration fehlt: nichts gelöscht, Zustimmung bleibt", async () => {
    mockRpc.mockResolvedValue({ data: null, error: { code: "PGRST202", message: "Could not find the function" } });
    await expect(revokeHealthConsentAndData("u1")).resolves.toEqual({ ok: false, reason: "rpc_missing" });
    for (const key of HEALTH_DATA_LOCAL_KEYS) expect(window.localStorage.getItem(key)).not.toBeNull();
    expect(getHealthConsentStatus()).toBe("granted");
  });

  it("Netzfehler: failed, nichts lokal gelöscht", async () => {
    mockRpc.mockRejectedValue(new Error("offline"));
    await expect(revokeHealthConsentAndData("u1")).resolves.toEqual({ ok: false, reason: "failed" });
    expect(window.localStorage.getItem(HEALTH_DATA_LOCAL_KEYS[0])).not.toBeNull();
  });
});

describe("Migration 022", () => {
  it("ist idempotent und setzt den Zeitstempel serverseitig", () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.profiles_health_consent_server_time/);
    expect(sql).toMatch(/DROP TRIGGER IF EXISTS profiles_health_consent_server_time/);
    expect(sql).toMatch(/NEW\.health_consent_at := now\(\)/);
  });

  it("Widerruf löscht Check-ins, recovery_daily-Zeilen und die Anstrengung, nicht die Trainings", () => {
    expect(sql).toMatch(/DELETE FROM public\.daily_checkins WHERE user_id = uid/);
    expect(sql).toMatch(/DELETE FROM public\.recovery_daily WHERE user_id = uid/);
    expect(sql).toMatch(/SET rpe = NULL, rpe_source = NULL/);
    expect(sql).toMatch(/health_consent_at = NULL, health_consent_version = NULL/);
    expect(sql).not.toMatch(/DELETE FROM public\.health_workouts/);
  });

  it("läuft als aufrufender Nutzer (RLS) und nur für angemeldete Nutzer", () => {
    expect(sql).toMatch(/SECURITY INVOKER/);
    expect(sql).not.toMatch(/SECURITY DEFINER/);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.revoke_health_consent_and_data\(\) FROM PUBLIC, anon/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.revoke_health_consent_and_data\(\) TO authenticated/);
  });
});
