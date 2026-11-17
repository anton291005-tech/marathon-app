import { submitFeedback } from "./feedbackService";

// jest.mock wird vor die Imports gehoben; `mockInsert` wird erst beim Aufruf gelesen.
const mockInsert = jest.fn();

jest.mock("../client", () => ({
  isSupabaseConfigured: true,
  supabase: { from: () => ({ insert: (row: unknown) => mockInsert(row) }) },
}));

const record = { category: null, message: "Hallo", appVersion: "1.0.0", screen: "home" as const, device: "Web" };

describe("submitFeedback", () => {
  beforeEach(() => mockInsert.mockReset());

  it("schreibt die Zeile des Nutzers", async () => {
    mockInsert.mockResolvedValue({ error: null });
    await expect(submitFeedback("u1", record)).resolves.toEqual({ status: "saved" });
    expect(mockInsert).toHaveBeenCalledWith({
      user_id: "u1",
      category: null,
      message: "Hallo",
      app_version: "1.0.0",
      screen: "home",
      device: "Web",
    });
  });

  it("fehlende Tabelle (Migration 025 nicht angewendet) → unavailable", async () => {
    mockInsert.mockResolvedValue({ error: { code: "PGRST205", message: "Could not find the table" } });
    await expect(submitFeedback("u1", record)).resolves.toEqual({ status: "unavailable" });
    mockInsert.mockResolvedValue({ error: { code: "42P01", message: 'relation "user_feedback" does not exist' } });
    await expect(submitFeedback("u1", record)).resolves.toEqual({ status: "unavailable" });
  });

  it("andere Fehler und Ausnahmen → error, ohne zu werfen", async () => {
    mockInsert.mockResolvedValue({ error: { code: "42501", message: "permission denied" } });
    await expect(submitFeedback("u1", record)).resolves.toEqual({ status: "error" });
    mockInsert.mockRejectedValue(new Error("offline"));
    await expect(submitFeedback("u1", record)).resolves.toEqual({ status: "error" });
    await expect(submitFeedback(null, record)).resolves.toEqual({ status: "error" });
  });
});
