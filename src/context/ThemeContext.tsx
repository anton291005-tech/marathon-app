import { useLayoutEffect } from "react";

/** Schlüssel des früheren Hell/Dunkel-Schalters. */
export const LEGACY_THEME_STORAGE_KEY = "myrace-theme";

/**
 * Die App ist fest dunkel. Entfernt die gespeicherte Wahl des früheren Schalters, damit niemand
 * im hellen Theme hängen bleibt, und setzt `data-theme` (daran hängen die CSS-Variablen).
 */
export function enforceDarkTheme(): void {
  document.documentElement.setAttribute("data-theme", "dark");
  try {
    localStorage.removeItem(LEGACY_THEME_STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  useLayoutEffect(() => {
    enforceDarkTheme();
  }, []);

  return <>{children}</>;
}
