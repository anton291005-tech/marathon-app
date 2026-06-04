export type MarathonMigrationFlags = {
  intervalV2Backfill?: boolean;
  /** Dev-only: show PostWorkoutSummaryCard once on next Home open for this workoutId, then cleared. */
  forcePostWorkoutCardForWorkoutId?: string | null;
};

const LS_KEY = "marathon_migration_flags_v1";

export function readMigrationFlags(): MarathonMigrationFlags {
  try {
    if (typeof localStorage === "undefined") return {};
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return {};
    const o = JSON.parse(raw);
    return typeof o === "object" && o ? (o as MarathonMigrationFlags) : {};
  } catch {
    return {};
  }
}

export function writeMigrationFlags(flags: MarathonMigrationFlags): void {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(LS_KEY, JSON.stringify(flags));
  } catch {
    // ignore quota / privacy mode
  }
}
