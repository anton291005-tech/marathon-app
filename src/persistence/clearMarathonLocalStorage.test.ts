import { clearMarathonLocalStorage } from "./clearMarathonLocalStorage";
import { ACCOUNT_BOUND_KEY_PREFIXES, MARATHON_LOGS_KEY, SHIFT_ENTRIES_CACHE_KEY, SHIFT_PROFILE_CACHE_KEY } from "./marathonLocalStorageKeys";

describe("clearMarathonLocalStorage", () => {
  beforeEach(() => localStorage.clear());

  it("löscht feste Schlüssel und alle Schlüssel je Nutzer mit konto-gebundenem Präfix", () => {
    localStorage.setItem(MARATHON_LOGS_KEY, "{}");
    localStorage.setItem(`${SHIFT_ENTRIES_CACHE_KEY}:user-a`, "{}");
    localStorage.setItem(`${SHIFT_ENTRIES_CACHE_KEY}:user-b`, "{}");
    localStorage.setItem(`${SHIFT_PROFILE_CACHE_KEY}:user-a`, "{}");
    localStorage.setItem("marathonUsageEventsEnabled:user-a", "1");
    localStorage.setItem("fremdeApp", "x");

    clearMarathonLocalStorage();

    expect(Object.keys(localStorage).sort()).toEqual(["fremdeApp", "marathonUsageEventsEnabled:user-a"]);
  });

  it("die Präfixe enden auf „:“ (kein Treffer auf ähnlich benannte Schlüssel)", () => {
    expect(ACCOUNT_BOUND_KEY_PREFIXES.every((p) => p.endsWith(":"))).toBe(true);
    localStorage.setItem(`${SHIFT_ENTRIES_CACHE_KEY}Backup`, "x");
    clearMarathonLocalStorage();
    expect(localStorage.getItem(`${SHIFT_ENTRIES_CACHE_KEY}Backup`)).toBe("x");
  });
});
