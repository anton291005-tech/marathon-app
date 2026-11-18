import { expect, type Page } from "@playwright/test";
import { appendFindings, type Finding } from "./state";

/** Kalendertag in Europe/Berlin (die App rechnet in Ortszeit, der Testbrowser läuft in Europe/Berlin). */
export function todayYmd(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
const toUtc = (ymd: string): number => Date.UTC(Number(ymd.slice(0, 4)), Number(ymd.slice(5, 7)) - 1, Number(ymd.slice(8, 10)));
export function addDays(ymd: string, days: number): string {
  return new Date(toUtc(ymd) + days * 86_400_000).toISOString().slice(0, 10);
}
export const diffDays = (a: string, b: string): number => Math.round((toUtc(a) - toUtc(b)) / 86_400_000);
/** 0 = Montag … 6 = Sonntag. */
export const weekdayIndex = (ymd: string): number => (new Date(toUtc(ymd)).getUTCDay() + 6) % 7;
export const mondayOf = (ymd: string): string => addDays(ymd, -weekdayIndex(ymd));
export const toGermanDate = (ymd: string): string => `${ymd.slice(8, 10)}.${ymd.slice(5, 7)}.${ymd.slice(0, 4)}`;

/** Bekanntes Rauschen, das kein Befund ist (mit Begründung). */
const IGNORED: Array<{ pattern: RegExp; why: string }> = [
  { pattern: /Download the React DevTools/i, why: "Dev-Hinweis von React" },
  { pattern: /\/sockjs-node|\/ws\b|webpack-dev-server|hot-update/i, why: "Dev-Server (Hot Reload), nicht Teil der App" },
];

/** Konsolenfehler und fehlgeschlagene Netzwerkaufrufe eines Tests sammeln — jeder Eintrag ist ein Befund. */
export function watchPage(page: Page, test: string): { flush: () => Finding[]; allow: (pattern: RegExp) => void } {
  const found: Finding[] = [];
  const allowed: RegExp[] = [];
  const push = (kind: Finding["kind"], text: string) => {
    const clean = text.replace(/\s+/g, " ").slice(0, 400);
    if (IGNORED.some((i) => i.pattern.test(clean)) || allowed.some((p) => p.test(clean))) return;
    if (!found.some((f) => f.kind === kind && f.text === clean)) found.push({ test, kind, text: clean });
  };
  page.on("console", (m) => {
    if (m.type() === "error") push("console", m.text());
  });
  page.on("pageerror", (e) => push("pageerror", String(e)));
  page.on("requestfailed", (r) => {
    const reason = r.failure()?.errorText ?? "";
    // Abgebrochene Anfragen beim Neuladen/Seitenwechsel sind kein Fehler der App.
    if (/ERR_ABORTED/.test(reason)) return;
    push("requestfailed", `${r.method()} ${r.url().split("?")[0]} ${reason}`);
  });
  page.on("response", (r) => {
    if (r.status() >= 400) push("http", `${r.status()} ${r.request().method()} ${r.url().split("?")[0]}`);
  });
  return {
    flush: () => {
      appendFindings(found);
      return found;
    },
    allow: (pattern) => allowed.push(pattern),
  };
}

/** Tab-Leiste der angemeldeten App (per CSS, weil sie hinter dem Wizard `inert`/`aria-hidden` ist). */
export const appShell = (page: Page) => page.locator("[data-layout-bottom-nav]");

export async function openApp(page: Page): Promise<void> {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("button", { name: "Anmelden", exact: true }).or(appShell(page)).first()).toBeVisible({ timeout: 60_000 });
}

export const isSignedOut = async (page: Page): Promise<boolean> => (await page.locator("input[type=email]").count()) > 0;

export async function tab(page: Page, name: "Heute" | "Woche" | "Leistung" | "Übersicht" | "Coach" | "Einstellungen"): Promise<void> {
  await page.locator("[data-layout-bottom-nav]").getByRole("button", { name, exact: true }).click();
  await page.waitForTimeout(300);
}

export async function settingsPage(page: Page, name: RegExp): Promise<void> {
  await tab(page, "Einstellungen");
  const back = page.getByRole("button", { name: "Zurück zu Einstellungen" });
  if (await back.count()) await back.click();
  await page.getByRole("button", { name }).click();
}

/** Kein horizontaler Überlauf bei 390 px: weder die Seite noch ein sichtbares Element ragt rechts hinaus. */
export async function expectNoOverflow(page: Page, label: string): Promise<void> {
  const result = await page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const clipped = (el: Element): boolean => {
      for (let p = el.parentElement; p; p = p.parentElement) {
        const ox = getComputedStyle(p).overflowX;
        if (ox === "auto" || ox === "scroll" || ox === "hidden" || ox === "clip") return true;
      }
      return false;
    };
    const offenders: string[] = [];
    document.querySelectorAll("body *").forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
      const s = getComputedStyle(el);
      if (s.visibility === "hidden" || s.display === "none" || s.position === "fixed") return;
      if (r.right > vw + 1 && !clipped(el)) offenders.push(`${el.tagName.toLowerCase()}.${String((el as HTMLElement).className).slice(0, 40)} right=${Math.round(r.right)}`);
    });
    return { scrollWidth: document.documentElement.scrollWidth, vw, offenders: offenders.slice(0, 5) };
  });
  expect(result.scrollWidth, `${label}: Seite breiter als der Bildschirm`).toBeLessThanOrEqual(result.vw);
  expect(result.offenders, `${label}: Elemente ragen rechts hinaus`).toEqual([]);
}

/** Im Woche-Tab zur Kalenderwoche von `ymd` blättern: erst zurück bis Woche 1 (`planStartYmd`), dann vor. */
export async function openWeekOf(page: Page, ymd: string, planStartYmd: string): Promise<void> {
  await tab(page, "Woche");
  const prev = page.getByRole("button", { name: "Vorherige Woche" });
  for (let i = 0; i < 60 && (await prev.isEnabled()); i += 1) await prev.click();
  const steps = Math.round(diffDays(mondayOf(ymd), mondayOf(planStartYmd)) / 7);
  for (let i = 0; i < steps; i += 1) await page.getByRole("button", { name: "Nächste Woche" }).click();
  await page.waitForTimeout(400);
}

/** Text aller Karten des Woche-Tabs (Zeilen, Vorschläge, Hinweise). */
export async function weekText(page: Page): Promise<string> {
  const main = page.locator("[data-layout-main-content]");
  return (await main.innerText()).replace(/\n+/g, " | ");
}

export async function openShiftPlan(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Dienste eintragen" }).click();
  await expect(page.getByTestId("shift-plan-page")).toBeVisible();
}

export async function closeShiftPlan(page: Page): Promise<void> {
  const sheet = page.getByTestId("shift-plan-page");
  if (await sheet.count()) await sheet.getByRole("button", { name: "Schließen", exact: true }).click();
  await expect(sheet).toHaveCount(0);
}

export const SCAN_BUTTON = /Mit meinem Dienstplan abgleichen|Mit Dienstplan und Kalender abgleichen/;
