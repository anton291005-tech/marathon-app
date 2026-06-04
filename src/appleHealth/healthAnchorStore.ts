export type HealthAnchorState = {
  workoutsAnchor?: string;
  lastSyncAt?: string;
};

const STORAGE_KEY = "appleHealthAnchors";

export function loadHealthAnchors(): HealthAnchorState {
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

export function saveHealthAnchors(state: HealthAnchorState): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // quota / private mode
  }
}
