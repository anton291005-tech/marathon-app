import { clearMarathonLocalStorage } from "./clearMarathonLocalStorage";
import { MARATHON_PREFERENCES_KEY, TRAINING_PLAN_V2_STORAGE_KEY } from "./marathonLocalStorageKeys";
import { claimLocalStorageForUser, readStorageOwnerUserId, STORAGE_OWNER_USER_ID_KEY } from "./storageOwner";

describe("claimLocalStorageForUser (Kontowechsel auf einem Gerät)", () => {
  beforeEach(() => localStorage.clear());

  it("löscht die Daten des ersten Kontos, wenn sich nach abgelaufener Sitzung ein anderes Konto anmeldet", () => {
    claimLocalStorageForUser("user-a", clearMarathonLocalStorage);
    localStorage.setItem(TRAINING_PLAN_V2_STORAGE_KEY, '{"version":2}');
    localStorage.setItem(MARATHON_PREFERENCES_KEY, '{"targetTime":"2:50:00"}');
    localStorage.setItem("appleHealthAnchors", '{"workoutsAnchor":"abc"}');

    const cleared = claimLocalStorageForUser("user-b", clearMarathonLocalStorage);

    expect(cleared).toBe(true);
    expect(localStorage.getItem(TRAINING_PLAN_V2_STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(MARATHON_PREFERENCES_KEY)).toBeNull();
    expect(localStorage.getItem("appleHealthAnchors")).toBeNull();
    expect(readStorageOwnerUserId()).toBe("user-b");
  });

  it("lässt die Daten stehen, wenn dasselbe Konto sich erneut anmeldet", () => {
    claimLocalStorageForUser("user-a", clearMarathonLocalStorage);
    localStorage.setItem(TRAINING_PLAN_V2_STORAGE_KEY, '{"version":2}');
    expect(claimLocalStorageForUser("user-a", clearMarathonLocalStorage)).toBe(false);
    expect(localStorage.getItem(TRAINING_PLAN_V2_STORAGE_KEY)).toBe('{"version":2}');
  });

  it("Bestandsgerät ohne Besitzer: nichts löschen, nur Besitzer eintragen", () => {
    localStorage.setItem(TRAINING_PLAN_V2_STORAGE_KEY, '{"version":2}');
    const clear = jest.fn();
    expect(claimLocalStorageForUser("user-a", clear)).toBe(false);
    expect(clear).not.toHaveBeenCalled();
    expect(localStorage.getItem(STORAGE_OWNER_USER_ID_KEY)).toBe("user-a");
  });

  it("Abmelden löscht auch den Besitzer und die Sync-Anker", () => {
    claimLocalStorageForUser("user-a", clearMarathonLocalStorage);
    localStorage.setItem("calendarSyncAnchors", "{}");
    localStorage.setItem("calendarImportConnected", "1");
    clearMarathonLocalStorage();
    expect(readStorageOwnerUserId()).toBeNull();
    expect(localStorage.getItem("calendarSyncAnchors")).toBeNull();
    expect(localStorage.getItem("calendarImportConnected")).toBeNull();
  });
});
