import {
  dbRowToScheduleBlock,
  scheduleBlockToUpsertPayload,
  type DbWeeklyScheduleBlockRow,
  type OneOffScheduleBlock,
  type RecurringScheduleBlock,
} from "./weeklyScheduleBlocksService";

function recurringRow(overrides: Partial<DbWeeklyScheduleBlockRow> = {}): DbWeeklyScheduleBlockRow {
  return {
    id: "block-1",
    user_id: "user-1",
    title: "Dienstagstraining",
    category: "sport",
    is_recurring: true,
    day_of_week: 2,
    specific_date: null,
    start_time: "18:00:00",
    end_time: "20:00:00",
    recurrence_start_date: "2026-01-01",
    recurrence_end_date: null,
    notes: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function oneOffRow(overrides: Partial<DbWeeklyScheduleBlockRow> = {}): DbWeeklyScheduleBlockRow {
  return {
    id: "block-2",
    user_id: "user-1",
    title: "Hochzeit",
    category: "other",
    is_recurring: false,
    day_of_week: null,
    specific_date: "2026-03-14",
    start_time: "14:00:00",
    end_time: "23:00:00",
    recurrence_start_date: null,
    recurrence_end_date: null,
    notes: "Ganztägig eingeplant",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("dbRowToScheduleBlock", () => {
  it("mappt eine wiederkehrende Zeile korrekt", () => {
    const block = dbRowToScheduleBlock(recurringRow());
    expect(block).toEqual({
      id: "block-1",
      title: "Dienstagstraining",
      category: "sport",
      startTime: "18:00:00",
      endTime: "20:00:00",
      notes: null,
      isRecurring: true,
      dayOfWeek: 2,
      recurrenceStartDate: "2026-01-01",
      recurrenceEndDate: null,
    });
  });

  it("mappt eine einmalige Zeile korrekt", () => {
    const block = dbRowToScheduleBlock(oneOffRow());
    expect(block).toEqual({
      id: "block-2",
      title: "Hochzeit",
      category: "other",
      startTime: "14:00:00",
      endTime: "23:00:00",
      notes: "Ganztägig eingeplant",
      isRecurring: false,
      specificDate: "2026-03-14",
    });
  });

  it("gibt null zurück, wenn is_recurring=true aber day_of_week fehlt", () => {
    expect(dbRowToScheduleBlock(recurringRow({ day_of_week: null }))).toBeNull();
  });

  it("gibt null zurück, wenn is_recurring=false aber specific_date fehlt", () => {
    expect(dbRowToScheduleBlock(oneOffRow({ specific_date: null }))).toBeNull();
  });

  it("fällt bei unbekannter category auf 'other' zurück", () => {
    const block = dbRowToScheduleBlock(oneOffRow({ category: "unknown-category" }));
    expect(block?.category).toBe("other");
  });
});

describe("scheduleBlockToUpsertPayload", () => {
  it("roundtrippt eine wiederkehrende Blockierung DB → Domain → DB", () => {
    const row = recurringRow();
    const block = dbRowToScheduleBlock(row) as RecurringScheduleBlock;
    const payload = scheduleBlockToUpsertPayload("user-1", block);

    expect(payload).toEqual({
      id: "block-1",
      user_id: "user-1",
      title: "Dienstagstraining",
      category: "sport",
      is_recurring: true,
      day_of_week: 2,
      specific_date: null,
      start_time: "18:00:00",
      end_time: "20:00:00",
      recurrence_start_date: "2026-01-01",
      recurrence_end_date: null,
      notes: null,
    });
  });

  it("roundtrippt einen einmaligen Termin DB → Domain → DB und ignoriert recurrence-Felder", () => {
    const row = oneOffRow();
    const block = dbRowToScheduleBlock(row) as OneOffScheduleBlock;
    const payload = scheduleBlockToUpsertPayload("user-1", block);

    expect(payload).toEqual({
      id: "block-2",
      user_id: "user-1",
      title: "Hochzeit",
      category: "other",
      is_recurring: false,
      day_of_week: null,
      specific_date: "2026-03-14",
      start_time: "14:00:00",
      end_time: "23:00:00",
      recurrence_start_date: null,
      recurrence_end_date: null,
      notes: "Ganztägig eingeplant",
    });
  });
});
