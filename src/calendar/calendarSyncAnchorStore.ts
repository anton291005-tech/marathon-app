export type CalendarSyncAnchorState = {
  /** ISO-Zeitpunkt des letzten erfolgreichen Fenster-Syncs. */
  lastSyncAt?: string;
};

const STORAGE_KEY = "calendarSyncAnchors";

export function loadCalendarSyncAnchors(): CalendarSyncAnchorState {
  try {
    if (typeof localStorage === "undefined") return {};
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function saveCalendarSyncAnchors(state: CalendarSyncAnchorState): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // quota / private mode
  }
}
