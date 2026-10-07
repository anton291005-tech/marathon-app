// Pflicht-Bearer-Prüfung (api/_lib/requireUser.js) und ihr erster Nutzer, DELETE /api/account.

const mockGetUser = jest.fn();
const mockDeleteUser = jest.fn();
const mockFrom = jest.fn();

jest.mock("@supabase/supabase-js", () => ({ createClient: jest.fn() }));

const { createClient } = require("@supabase/supabase-js");
const { requireUser } = require("../../api/_lib/requireUser");
const { handleDeleteAccount } = require("../../api/_lib/deleteAccount");

const VALID_JWT = "aaa.bbb.ccc";
const withToken = (token, extra = {}) => ({ headers: { authorization: `Bearer ${token}` }, ...extra });

describe("requireUser", () => {
  beforeEach(() => {
    process.env.REACT_APP_SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-key";
    // CRA resets mocks between tests — re-arm the client factory every time.
    createClient.mockImplementation(() => ({
      auth: { getUser: mockGetUser, admin: { deleteUser: mockDeleteUser } },
      from: mockFrom,
    }));
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
  });

  test("ohne Header: 401, kein Supabase-Aufruf", async () => {
    const result = await requireUser({ headers: {} });
    expect(result).toMatchObject({ ok: false, status: 401, reason: "missing_token" });
    expect(createClient).not.toHaveBeenCalled();
  });

  test("kein Bearer-Schema: 401", async () => {
    const result = await requireUser({ headers: { authorization: `Basic ${VALID_JWT}` } });
    expect(result).toMatchObject({ ok: false, status: 401, reason: "missing_token" });
  });

  test("Token ohne JWT-Form: 401, kein Supabase-Aufruf", async () => {
    const result = await requireUser(withToken("not-a-jwt"));
    expect(result).toMatchObject({ ok: false, status: 401, reason: "invalid_token" });
    expect(createClient).not.toHaveBeenCalled();
    expect(mockGetUser).not.toHaveBeenCalled();
  });

  test("falsches Token (Supabase lehnt ab): 401", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: "invalid JWT" } });
    const result = await requireUser(withToken(VALID_JWT));
    expect(result).toMatchObject({ ok: false, status: 401, reason: "invalid_token" });
    expect(mockGetUser).toHaveBeenCalledWith(VALID_JWT);
  });

  test("getUser wirft: 401", async () => {
    mockGetUser.mockRejectedValue(new Error("network down"));
    jest.spyOn(console, "warn").mockImplementation(() => {});
    const result = await requireUser(withToken(VALID_JWT));
    expect(result).toMatchObject({ ok: false, status: 401, reason: "invalid_token" });
  });

  test("Service-Role-Key fehlt: 503", async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    jest.spyOn(console, "warn").mockImplementation(() => {});
    const result = await requireUser(withToken(VALID_JWT));
    expect(result).toMatchObject({ ok: false, status: 503, reason: "not_configured" });
    expect(mockGetUser).not.toHaveBeenCalled();
  });

  test("gültiges Token: userId und Admin-Client", async () => {
    const result = await requireUser(withToken(VALID_JWT));
    expect(result.ok).toBe(true);
    expect(result.userId).toBe("user-1");
    expect(result.admin).toBeDefined();
  });

  test("Header-Name in Großschreibung wird akzeptiert", async () => {
    const result = await requireUser({ headers: { Authorization: `Bearer ${VALID_JWT}` } });
    expect(result.ok).toBe(true);
  });
});

describe("handleDeleteAccount über requireUser", () => {
  beforeEach(() => {
    process.env.REACT_APP_SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-key";
    createClient.mockImplementation(() => ({
      auth: { getUser: mockGetUser, admin: { deleteUser: mockDeleteUser } },
      from: mockFrom,
    }));
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    mockDeleteUser.mockResolvedValue({ error: null });
    mockFrom.mockImplementation(() => ({ delete: () => ({ eq: async () => ({ error: null }) }) }));
  });

  test("falsche Methode: 405", async () => {
    const { status } = await handleDeleteAccount(withToken(VALID_JWT, { method: "GET" }));
    expect(status).toBe(405);
  });

  test("ohne Token: 401, nichts wird gelöscht", async () => {
    const { status, body } = await handleDeleteAccount({ method: "DELETE", headers: {} });
    expect(status).toBe(401);
    expect(body.error).toBe("Missing Authorization bearer token");
    expect(mockFrom).not.toHaveBeenCalled();
    expect(mockDeleteUser).not.toHaveBeenCalled();
  });

  test("falsches Token: 401, nichts wird gelöscht", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: "invalid JWT" } });
    const { status, body } = await handleDeleteAccount(withToken(VALID_JWT, { method: "DELETE" }));
    expect(status).toBe(401);
    expect(body.error).toBe("Invalid or expired session");
    expect(mockDeleteUser).not.toHaveBeenCalled();
  });

  test("Service-Role-Key fehlt: 503 mit der bisherigen Meldung", async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    jest.spyOn(console, "warn").mockImplementation(() => {});
    const { status, body } = await handleDeleteAccount(withToken(VALID_JWT, { method: "DELETE" }));
    expect(status).toBe(503);
    expect(body.error).toBe("Account deletion is not configured");
  });

  test("gültiges Token: Tabellen und Auth-Nutzer werden für die verifizierte ID gelöscht", async () => {
    const { status, body } = await handleDeleteAccount(withToken(VALID_JWT, { method: "DELETE" }));
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.failedTables).toEqual([]);
    expect(mockDeleteUser).toHaveBeenCalledWith("user-1");
  });
});
