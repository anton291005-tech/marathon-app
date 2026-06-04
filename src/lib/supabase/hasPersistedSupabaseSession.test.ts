import {
  hasPersistedSupabaseSession,
  isBootIsolateRequested,
  shouldBootIsolate,
} from "./hasPersistedSupabaseSession";

describe("hasPersistedSupabaseSession", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns false when no auth token is stored", () => {
    expect(hasPersistedSupabaseSession()).toBe(false);
  });

  it("returns true when sb auth token contains access_token", () => {
    localStorage.setItem(
      "sb-test-project-auth-token",
      JSON.stringify({ access_token: "abc", refresh_token: "def" }),
    );
    expect(hasPersistedSupabaseSession()).toBe(true);
  });

  it("returns true when only refresh_token is stored", () => {
    localStorage.setItem("sb-test-project-auth-token", JSON.stringify({ refresh_token: "def" }));
    expect(hasPersistedSupabaseSession()).toBe(true);
  });
});

describe("shouldBootIsolate", () => {
  beforeEach(() => {
    localStorage.clear();
    window.history.replaceState({}, "", "/");
  });

  it("does not isolate authenticated users when BOOT_ISOLATE is set", () => {
    localStorage.setItem("BOOT_ISOLATE", "1");
    localStorage.setItem(
      "sb-test-project-auth-token",
      JSON.stringify({ access_token: "abc", refresh_token: "def" }),
    );
    expect(shouldBootIsolate()).toBe(false);
  });

  it("isolates unauthenticated users when BOOT_ISOLATE is set", () => {
    localStorage.setItem("BOOT_ISOLATE", "1");
    expect(shouldBootIsolate()).toBe(true);
  });

  it("honors boot=ok query param only for unauthenticated users", () => {
    window.history.replaceState({}, "", "/?boot=ok");
    expect(isBootIsolateRequested()).toBe(true);
    expect(shouldBootIsolate()).toBe(true);
  });
});
