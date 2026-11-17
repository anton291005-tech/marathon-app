/**
 * Konto löschen (api/_lib/deleteAccount.js) räumt auch Feedback und Nutzungsdaten ab (Migration 025).
 */
jest.mock("../../api/_lib/requireUser", () => ({ requireUser: jest.fn() }));

const { requireUser } = require("../../api/_lib/requireUser");
const { handleDeleteAccount, USER_DATA_TABLES } = require("../../api/_lib/deleteAccount");

describe("deleteAccount: user_feedback und usage_events", () => {
  it("führt beide Tabellen in der Löschliste", () => {
    expect(USER_DATA_TABLES).toEqual(expect.arrayContaining(["user_feedback", "usage_events"]));
  });

  it("löscht die Zeilen des Nutzers aus beiden Tabellen, auch wenn eine Tabelle noch fehlt", async () => {
    const deletedFrom = [];
    const admin = {
      from: (table) => ({
        delete: () => ({
          eq: async (column, value) => {
            deletedFrom.push({ table, column, value });
            // Migration 025 noch nicht angewendet: Tabelle fehlt → Fehler, Löschen läuft trotzdem weiter.
            return table === "usage_events" ? { error: { message: 'relation "usage_events" does not exist' } } : { error: null };
          },
        }),
      }),
      auth: { admin: { deleteUser: async () => ({ error: null }) } },
    };
    requireUser.mockResolvedValue({ ok: true, admin, userId: "user-1" });

    const res = await handleDeleteAccount({ method: "DELETE", headers: {} });

    expect(res.status).toBe(200);
    expect(deletedFrom).toEqual(
      expect.arrayContaining([
        { table: "user_feedback", column: "user_id", value: "user-1" },
        { table: "usage_events", column: "user_id", value: "user-1" },
      ]),
    );
    expect(res.body.failedTables).toEqual(["usage_events"]);
  });
});
