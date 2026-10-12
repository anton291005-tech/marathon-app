import { render } from "@testing-library/react";
import { LEGACY_THEME_STORAGE_KEY, ThemeProvider } from "./ThemeContext";

describe("ThemeProvider", () => {
  afterEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
  });

  test.each(["light", "dark"])("gespeichertes Theme „%s“ wird entfernt, die App ist dunkel", (stored) => {
    localStorage.setItem(LEGACY_THEME_STORAGE_KEY, stored);
    document.documentElement.setAttribute("data-theme", stored);
    render(
      <ThemeProvider>
        <div />
      </ThemeProvider>,
    );
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(localStorage.getItem(LEGACY_THEME_STORAGE_KEY)).toBeNull();
  });

  test("ohne gespeicherte Wahl bleibt die App dunkel", () => {
    render(
      <ThemeProvider>
        <div />
      </ThemeProvider>,
    );
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });
});
