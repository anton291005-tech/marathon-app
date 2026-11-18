/**
 * Rauchtest der echten App (Freundes-Test): Registrierung → Wizard → Schicht-Modus → Nutzungsdaten → Konto löschen.
 *
 * - Läuft gegen die lokal gestartete App (`npm run start:full`), Viewport 390×844, Chromium headless.
 * - Legt genau EIN Testkonto `myrace-e2e-<zeitstempel>@example.com` in der Supabase der lokalen Umgebung an und
 *   löscht es im letzten Test über die App. Bricht der Lauf ab, nutzt der nächste dasselbe Konto weiter
 *   (`e2e/.state/`, gitignoriert). `E2E_FRESH=1` erzwingt ein neues Konto.
 * - Der Service-Role-Schlüssel aus `.env.local` wird nur zum LESEN benutzt (Prüfung der Zeilen).
 * - KI-Einwilligung: überall abgelehnt, außer im Test „KI-Coach“ (genau eine Nachricht an den Coach).
 * - Die Tests bauen aufeinander auf und laufen in Dateireihenfolge mit einem Worker.
 */
import { expect, test, type Page } from "@playwright/test";
import { activePlanWorkouts, authUserExists, countRows, listE2eAccounts, rows, usageEvents, USER_TABLES } from "./support/admin";
import {
  addDays,
  appShell,
  closeShiftPlan,
  diffDays,
  expectNoOverflow,
  isSignedOut,
  openApp,
  openShiftPlan,
  openWeekOf,
  SCAN_BUTTON,
  settingsPage,
  tab,
  toGermanDate,
  todayYmd,
  watchPage,
  weekdayIndex,
  weekText,
} from "./support/app";
import { ENV, HAS_ADMIN_READ } from "./support/env";
import {
  clearAccount,
  createdAccounts,
  hasStorage,
  loadAccount,
  noteCreatedAccount,
  readFindings,
  resetFindings,
  saveAccount,
  STORAGE_FILE,
  type Account,
} from "./support/state";

const MAX_ACCOUNTS = 5;
const WEEKDAYS_LONG = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];

test.use({ storageState: async ({}, use) => use(hasStorage() ? STORAGE_FILE : undefined) });

let watcher: ReturnType<typeof watchPage>;
/** false = Browser-Speicher nach dem Test nicht sichern (Konto gelöscht). */
let keepStorage = true;

test.beforeAll(async () => {
  if (process.env.E2E_FRESH === "1") {
    // Ein noch vorhandenes Testkonto nie verwaisen lassen: seine Zugangsdaten liegen nur in e2e/.state.
    const previous = loadAccount();
    const stillThere =
      previous != null && HAS_ADMIN_READ && (previous.userId ? await authUserExists(previous.userId) : (await listE2eAccounts()).some((u) => u.email === previous.email));
    if (previous && stillThere) {
      throw new Error(`E2E_FRESH=1, aber das Testkonto ${previous.email} existiert noch. Erst ohne E2E_FRESH bis Test 11 laufen lassen (löscht es über die App).`);
    }
    clearAccount();
  }
  resetFindings();
});

test.beforeEach(async ({ page }, info) => {
  keepStorage = true;
  watcher = watchPage(page, info.title);
});

test.afterEach(async ({ page }, info) => {
  const found = watcher.flush();
  if (found.length > 0) {
    await info.attach("befunde", { body: JSON.stringify(found, null, 2), contentType: "application/json" });
  }
  if (keepStorage && loadAccount()) await page.context().storageState({ path: STORAGE_FILE });
});

test.afterAll(async () => {
  const findings = readFindings();
  // eslint-disable-next-line no-console
  console.log(`\nBefunde (Konsole/Netzwerk): ${findings.length}`);
  findings.forEach((f) => console.log(`  [${f.test}] ${f.kind}: ${f.text}`));
  if (HAS_ADMIN_READ) {
    const left = await listE2eAccounts();
    console.log(`Übrige E2E-Testkonten in Supabase: ${left.length}`);
    left.forEach((u) => console.log(`  ${u.email} ${u.id} (${u.created_at})`));
  }
});

function account(): Account {
  const a = loadAccount();
  if (!a) throw new Error("Kein Testkonto — Test 1 (Registrieren) muss zuerst laufen.");
  return a;
}

/** Erster Plantag (Woche 1 des Woche-Tabs): der Tag, an dem das Konto den Plan angelegt hat. */
function planStart(): string {
  const a = account();
  return a.planStart ?? a.createdAt.slice(0, 10);
}

const PATTERN = ["night", "night", "off", "off", "off", "early", "early"] as const;
const KIND_LABEL: Record<(typeof PATTERN)[number], string> = { night: "Nacht", off: "Frei", early: "Früh" };

function userId(): string {
  const id = account().userId;
  if (!id) throw new Error("Konto-ID unbekannt (Test 1 nicht durchgelaufen).");
  return id;
}

async function signIn(page: Page, a: Account): Promise<void> {
  await page.locator("input[type=email]").fill(a.email);
  await page.locator("input[type=password]").first().fill(a.password);
  await page.locator("button[type=submit]").click();
  await expect(appShell(page)).toBeVisible({ timeout: 60_000 });
}

/** App öffnen; ist die Sitzung weg (Abbruch eines früheren Laufs), wieder anmelden. */
async function openSignedIn(page: Page): Promise<void> {
  await openApp(page);
  if (await isSignedOut(page)) await signIn(page, account());
  await dismissOverlays(page);
}

/** Einwilligungs-Sheet (ablehnen) und App-Tour (überspringen) wegklicken, falls sie erscheinen. */
async function dismissOverlays(page: Page): Promise<void> {
  for (let i = 0; i < 4; i += 1) {
    await page.waitForTimeout(700);
    const decline = page.getByRole("button", { name: "Ohne Coach fortfahren" });
    const skipTour = page.getByRole("button", { name: "Tour überspringen" });
    if (await decline.count()) await decline.click();
    else if (await skipTour.count()) await skipTour.click();
    else break;
  }
}

async function readUserId(page: Page): Promise<string> {
  const id = await page.evaluate(() => {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i) ?? "";
      if (!/^sb-.*-auth-token$/.test(key)) continue;
      try {
        const value = JSON.parse(localStorage.getItem(key) ?? "null");
        const uid = value?.user?.id ?? value?.currentSession?.user?.id;
        if (typeof uid === "string") return uid;
      } catch {
        /* weiter */
      }
    }
    return null;
  });
  if (!id) throw new Error("Keine Supabase-Sitzung im Browser gefunden.");
  return id;
}

/** Erste harte Einheit (Intervalle/Tempo) im 28-Tage-Fenster des Dienstplans, frühestens in 3 Tagen. */
async function findHardDay(): Promise<{ ymd: string; title: string }> {
  const today = todayYmd();
  const workouts = await activePlanWorkouts(userId());
  const hard = workouts
    .filter((w) => w.sessionType === "interval" || w.sessionType === "tempo")
    .map((w) => ({ ymd: w.dateIso.slice(0, 10), title: w.title }))
    .filter((w) => diffDays(w.ymd, today) >= 3 && diffDays(w.ymd, today) <= 24)
    .sort((a, b) => a.ymd.localeCompare(b.ymd))[0];
  if (!hard) throw new Error("Im Plan liegt keine harte Einheit im Dienstplan-Fenster (3–24 Tage ab heute).");
  return hard;
}

/** Zeile des Woche-Tabs mit dem Titel einer Einheit → Kalendertag (Zahl im Monat). */
async function dayOfMonthForSession(page: Page, title: string): Promise<number> {
  const row = page.locator("[data-layout-week-card]", { hasText: title }).first();
  const text = (await row.innerText()).replace(/\n+/g, " ");
  const m = /^\s*[A-ZÄÖÜ]{2}\s+(\d{1,2})\b/.exec(text);
  if (!m) throw new Error(`Tag der Einheit nicht lesbar: ${text}`);
  return Number(m[1]);
}

type DayLevel = "frei" | "eingeschränkt" | "ungünstig";

/** Einträge der manuellen Tagesliste mit ihrer Stufe: ohne Zusatz (frei), „Eingeschränkt: …“, „Ungünstig …“. */
async function readDayOptions(page: Page): Promise<Array<{ text: string; level: DayLevel }>> {
  await expect(page.locator("[data-layout-main-content]")).toContainText("Anderen Tag wählen");
  const options = await page.locator(".mr-panel__option").allInnerTexts();
  return options.map((o) => {
    const text = o.replace(/\n+/g, " | ").trim();
    const level: DayLevel = /Ungünstig/.test(text) ? "ungünstig" : /Eingeschränkt:/.test(text) ? "eingeschränkt" : "frei";
    return { text, level };
  });
}

// ---------------------------------------------------------------------------------------------------------------------

test("1 Registrieren → Wizard (Schicht: Ja) → KI-Einwilligung ablehnen → Plan, Heute und Woche ohne Überlauf", async ({ page }) => {
  let a = loadAccount();
  await openApp(page);

  if (!a) {
    expect(createdAccounts().length, `Höchstens ${MAX_ACCOUNTS} Testkonten`).toBeLessThan(MAX_ACCOUNTS);
    const stamp = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
    a = { email: `myrace-e2e-${stamp}@example.com`, password: `E2e-${stamp}-${Math.random().toString(36).slice(2, 12)}`, createdAt: new Date().toISOString() };
    await page.getByRole("button", { name: "Registrieren" }).click();
    await page.locator("input[type=email]").fill(a.email);
    await page.locator("input[type=password]").nth(0).fill(a.password);
    await page.locator("input[type=password]").nth(1).fill(a.password);
    noteCreatedAccount(a.email);
    saveAccount(a);
    await page.locator("button[type=submit]").click();
  } else if (await isSignedOut(page)) {
    await signIn(page, a);
  }

  // Frisches Konto: der Wizard erscheint (kein Demo-Plan, kein Plan eines anderen Kontos).
  // (Die Tab-Leiste liegt schon vorher im DOM, deshalb ausdrücklich auf den Wizard warten.)
  const wizardTitle = page.getByRole("heading", { name: "Distanz & Ziel" });
  await expect(appShell(page)).toBeVisible({ timeout: 60_000 });
  a.userId = await readUserId(page);
  saveAccount(a);
  const hasPlan = HAS_ADMIN_READ ? ((await countRows("training_plans", a.userId)) ?? 0) > 0 : false;
  if (!hasPlan) await expect(wizardTitle, "frisches Konto landet im Wizard").toBeVisible({ timeout: 60_000 });
  else await page.waitForTimeout(3000);

  if (await wizardTitle.count()) {
    await expectNoOverflow(page, "Wizard Schritt 1");
    // Hinter dem Wizard ist die App nicht bedienbar und für Screenreader verborgen (kein Demo-Plan vorlesbar).
    await expect(page.locator("[data-layout-main-content]")).toHaveAttribute("inert", "");
    await expect(appShell(page)).toHaveAttribute("inert", "");
    await expect(page.getByRole("button", { name: "Einstellungen", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Rückblick ansehen|Neue Vorbereitung starten/ })).toHaveCount(0);
    const next = () => page.getByRole("button", { name: "Weiter", exact: true }).click();
    await page.getByRole("button", { name: "10 km", exact: true }).click();
    await page.getByRole("button", { name: "Unter einer Zielzeit" }).click();
    await next();

    // Renndatum: der Sonntag in mindestens 10 Wochen → Aufbauphase mit Intervallen liegt im Dienstplan-Fenster.
    let race = addDays(todayYmd(), 70);
    race = addDays(race, 6 - weekdayIndex(race));
    a.raceDate = race;
    a.planStart = todayYmd();
    saveAccount(a);
    await page.getByLabel("Wann ist dein Rennen?").fill(toGermanDate(race));
    await next();

    await expect(page.getByRole("heading", { name: "Deine Trainingswoche" })).toBeVisible();
    await expect(page.getByTestId("shift-wizard-question")).toBeVisible();
    await page.getByTestId("shift-wizard-question").getByRole("button", { name: "Ja", exact: true }).click();
    await expect(page.getByRole("button", { name: "Dienstplan jetzt eintragen" })).toBeVisible();
    await page.getByRole("button", { name: "Später" }).click();
    await page.getByRole("button", { name: "4 Tage" }).click();
    await expectNoOverflow(page, "Wizard Trainingswoche");
    await next();

    await page.getByLabel("Wie viele km läufst du pro Woche?").fill("25");
    await page.getByRole("button", { name: "Schätzung" }).click();
    await next();
    await next(); // Präferenzen
    await next(); // Kalender
    await expect(page.getByRole("button", { name: "Plan erstellen" })).toBeVisible();
    await expectNoOverflow(page, "Wizard Zusammenfassung");
    await page.getByRole("button", { name: "Plan erstellen" }).click();

    // KI-Einwilligung kommt nach dem Wizard (Plan entsteht ohne KI) → ablehnen.
    await expect(page.getByRole("heading", { name: "KI-Coach aktivieren?" })).toBeVisible({ timeout: 120_000 });
    await expectNoOverflow(page, "KI-Einwilligung");
    await page.getByRole("button", { name: "Ohne Coach fortfahren" }).click();
  }
  await dismissOverlays(page);
  await expect(appShell(page), "nach dem Wizard ist die App wieder bedienbar").not.toHaveAttribute("inert", "");

  // Heute
  await tab(page, "Heute");
  const main = page.locator("[data-layout-main-content]");
  await expect(main).toContainText(/Woche \d+ von \d+/i);
  await expect(main, "kein Demo-Plan / kein fremder Plan").not.toContainText("Warschau");
  await expectNoOverflow(page, "Heute");

  // Woche
  await tab(page, "Woche");
  await expect(main).toContainText("Woche 1");
  await expect(main).toContainText(/Langer Lauf|Lockerer/);
  await expectNoOverflow(page, "Woche");

  if (HAS_ADMIN_READ) {
    expect(await countRows("training_plans", a.userId!), "genau ein Plan in Supabase").toBe(1);
    const profile = await rows<{ works_shifts: boolean | null; ai_consent_at: string | null }>("profiles", a.userId!, "works_shifts,ai_consent_at");
    expect(profile[0]?.works_shifts, "Schicht-Frage „Ja“ ist im Profil gespeichert").toBe(true);
    expect(profile[0]?.ai_consent_at ?? null, "keine KI-Einwilligung gespeichert").toBeNull();
  }
});

test("2 Dienstplan: 4 Wochen per Rotationsmuster, Wochen-Scan zeigt den Vorschlag S1 mit Begründung", async ({ page }) => {
  test.skip(!HAS_ADMIN_READ, "braucht Lesezugriff auf den Plan");
  await openSignedIn(page);
  const hard = await findHardDay();
  const a = account();
  a.hardDay = hard.ymd;
  saveAccount(a);

  // S1 Pflege: Nacht, Nacht, frei, frei, frei, Früh, Früh — die 2. Nacht endet am Morgen der harten Einheit.
  let start = addDays(hard.ymd, -2);
  while (diffDays(addDays(start, -7), todayYmd()) >= 0) start = addDays(start, -7);
  a.patternStart = start;
  saveAccount(a);

  await tab(page, "Woche");
  const startedAt = Date.now();
  await openShiftPlan(page);
  await expectNoOverflow(page, "Dienstplan");
  await page.getByRole("button", { name: /Rotation oder Woche übernehmen/ }).click();
  await page.locator("#shift-pattern").fill("N N – – – F F");
  const selects = page.getByTestId("shift-plan-page").locator("select.mr-shift-select");
  await selects.nth(0).selectOption(start);
  await selects.nth(1).selectOption("4");
  await page.getByRole("button", { name: "Muster eintragen" }).click();
  await expect(page.getByTestId("shift-plan-page")).toContainText(/Tage eingetragen – noch nicht gespeichert/);
  await expectNoOverflow(page, "Dienstplan mit Muster");
  const saveButton = page.getByRole("button", { name: /^Speichern/ });
  // Wiederholter Lauf mit demselben Konto: das Muster ist schon gespeichert, dann gibt es nichts zu speichern.
  if (await saveButton.isEnabled()) {
    await saveButton.click();
    await expect(page.getByTestId("shift-plan-page")).toContainText(/Gespeichert\./);
  }
  const seconds = (Date.now() - startedAt) / 1000;
  expect(seconds, "4 Wochen eintragen dauert unter 1 Minute").toBeLessThan(60);

  const nights = [addDays(hard.ymd, -2), addDays(hard.ymd, -1)];
  for (const ymd of nights) {
    await expect(page.getByTestId(`shift-day-${ymd}`).getByRole("button", { name: "Nacht" })).toHaveAttribute("aria-pressed", "true");
  }
  await closeShiftPlan(page);

  const saved = await rows<{ shift_date: string; kind: string }>("shift_entries", userId(), "shift_date,kind");
  expect(saved.length, "Dienste in Supabase gespeichert").toBeGreaterThanOrEqual(14);
  expect(saved.filter((r) => nights.includes(r.shift_date)).map((r) => r.kind)).toEqual(["night", "night"]);

  // Wochen-Scan der Woche mit der harten Einheit.
  await openWeekOf(page, hard.ymd, planStart());
  const before = await weekText(page);
  expect(before).toContain(hard.title);
  await page.getByRole("button", { name: SCAN_BUTTON }).click();
  const main = page.locator("[data-layout-main-content]");
  await expect(main).toContainText("Woche an deinen Dienstplan anpassen");
  const weekday = WEEKDAYS_LONG[weekdayIndex(hard.ymd)];
  await expect(main, "Begründung nennt den Dienst und den Tag").toContainText(new RegExp(`Nach dem Nachtdienst \\(22–6 Uhr\\) ist ${weekday} kein guter Tag für`));
  await expect(main).toContainText(/Vorschlag: (Montag|Dienstag|Mittwoch|Donnerstag|Freitag|Samstag|Sonntag)/);
  await expect(page.getByRole("button", { name: "Übernehmen" })).toBeVisible();
  await expectNoOverflow(page, "Wochenvorschlag");

  // Vorschlag statt Automatik: „Verwerfen“ lässt die Woche unverändert.
  await page.getByRole("button", { name: "Verwerfen" }).click();
  await expect(page.getByRole("button", { name: "Übernehmen" })).toHaveCount(0);
  expect(await weekText(page)).toBe(before);
  expect(await countRows("plan_patches", userId()), "ohne „Übernehmen“ keine Planänderung").toBe(0);
});

test("4 Fix 3: Tagesliste mit Stufen – der empfohlene Tag ist „Eingeschränkt“ und nie „Ungünstig“", async ({ page }) => {
  test.skip(!HAS_ADMIN_READ, "braucht Lesezugriff auf den Plan");
  await openSignedIn(page);
  const hard = await findHardDay();
  test.skip((await countRows("plan_patches", userId())) !== 0, "Vorschlag ist schon übernommen (wiederholter Lauf) — der Einstieg „Trotzdem Tag wählen“ steht in Test 3");
  await openWeekOf(page, hard.ymd, planStart());
  await page.locator("[data-layout-week-card]", { hasText: hard.title }).first().click();
  await page.getByRole("button", { name: "An Kalender anpassen" }).click();

  // Einzel-Vorschlag mit Empfehlung (in S1: der erste freie Tag nach den Nächten, also selbst nur eingeschränkt).
  const main = page.locator("[data-layout-main-content]");
  await expect(main).toContainText(/Vorschlag: (Montag|Dienstag|Mittwoch|Donnerstag|Freitag|Samstag|Sonntag)/);
  const proposal = await weekText(page);
  const recommended = /Vorschlag: (Montag|Dienstag|Mittwoch|Donnerstag|Freitag|Samstag|Sonntag)/.exec(proposal)![1];
  expect(proposal, "S1: der empfohlene Tag ist ausdrücklich nur eingeschränkt").toContain("also auch nur eingeschränkt");

  // Von der Vorschlagskarte in die manuelle Tageswahl („Bearbeiten“).
  await page.getByRole("button", { name: "Bearbeiten", exact: true }).click();
  const options = await readDayOptions(page);
  const summary = options.map((o) => `[${o.level}] ${o.text}`).join(" ¦ ");
  test.info().annotations.push({ type: "Tagesliste", description: summary });
  expect(options.length, "Tagesliste hat Einträge").toBeGreaterThan(0);
  const recommendedOption = options.find((o) => o.text.startsWith(recommended.slice(0, 2)));
  expect(recommendedOption, `empfohlener Tag (${recommended}) steht in der Liste: ${summary}`).toBeTruthy();
  expect(recommendedOption!.level, `empfohlener Tag ist neutral „Eingeschränkt“, nie „Ungünstig“: ${summary}`).toBe("eingeschränkt");
  expect(recommendedOption!.text).toMatch(/Eingeschränkt: erster freier Tag nach den Nachtdiensten/);
  // Die anderen Stufen bleiben erhalten: ein Tag gegen die Regeln ist weiter „Ungünstig“.
  expect(options.map((o) => o.level), `Liste enthält auch „Ungünstig“: ${summary}`).toContain("ungünstig");
  await expectNoOverflow(page, "Tagesliste");
  await page.getByRole("button", { name: "Abbrechen" }).click();
  expect(await countRows("plan_patches", userId()), "Abbrechen ändert nichts").toBe(0);
});

test("3 Fix 2: Vorschlag übernehmen, neu laden → kein weicher Konflikt mehr; Dienst am Vortag ändern → Konflikt kommt wieder", async ({ page }) => {
  test.skip(!HAS_ADMIN_READ, "braucht Lesezugriff auf den Plan");
  await openSignedIn(page);
  const hard = await findHardDay();
  const main = page.locator("[data-layout-main-content]");

  await openWeekOf(page, hard.ymd, planStart());
  if ((await countRows("plan_patches", userId())) === 0) {
    await page.getByRole("button", { name: SCAN_BUTTON }).click();
    await expect(page.getByRole("button", { name: "Übernehmen" })).toBeVisible();
    await page.getByRole("button", { name: "Übernehmen" }).click();
    await expect(page.getByRole("button", { name: "Übernehmen" })).toHaveCount(0);
    await expect.poll(() => countRows("plan_patches", userId()), { message: "Verschiebung in Supabase gespeichert" }).toBeGreaterThan(0);
  }

  const saveShiftDay = async (ymd: string, label: string) => {
    await openShiftPlan(page);
    const day = page.getByTestId(`shift-day-${ymd}`);
    await day.scrollIntoViewIfNeeded();
    const chip = day.getByRole("button", { name: label, exact: true });
    if ((await chip.getAttribute("aria-pressed")) !== "true") {
      await chip.click();
      await page.getByRole("button", { name: /^Speichern/ }).click();
      await expect(page.getByTestId("shift-plan-page")).toContainText(/Gespeichert\./);
    }
    await closeShiftPlan(page);
  };

  // Wohin wurde die harte Einheit verschoben?
  const movedDom = await dayOfMonthForSession(page, hard.title);
  let moved = hard.ymd;
  for (let d = -6; d <= 6; d += 1) if (Number(addDays(hard.ymd, d).slice(8, 10)) === movedDom) moved = addDays(hard.ymd, d);
  expect(moved, "die Einheit liegt nicht mehr auf dem ungeeigneten Tag").not.toBe(hard.ymd);
  const a = account();
  a.movedDay = moved;
  saveAccount(a);
  const dayBefore = addDays(moved, -1);
  // Dienst am Vortag laut Muster (bei einem wiederholten Lauf zuerst wiederherstellen).
  const patternKind = PATTERN[(((diffDays(dayBefore, a.patternStart ?? addDays(hard.ymd, -2)) % 7) + 7) % 7)];
  await saveShiftDay(dayBefore, KIND_LABEL[patternKind]);

  // Neu laden: die bestätigte Verschiebung gilt weiter, der Zieltag meldet keinen weichen Konflikt.
  await page.reload({ waitUntil: "domcontentloaded" });
  await dismissOverlays(page);
  await openWeekOf(page, hard.ymd, planStart());
  expect(await dayOfMonthForSession(page, hard.title), "Verschiebung übersteht das Neuladen").toBe(movedDom);
  await page.getByRole("button", { name: SCAN_BUTTON }).click();
  await expect(main).toContainText("Diese Woche passt zu deinem Dienstplan.");
  await expect(main).not.toContainText(hard.title + "“ bleibt");
  await page.getByRole("button", { name: "OK", exact: true }).click();

  // Fix 3, Einstieg „Trotzdem Tag wählen“: Die bestätigte Einheit meldet keinen Konflikt; die Tagesliste zeigt die
  // Stufen (frei ohne Zusatz, „Eingeschränkt: …“, „Ungünstig“) und markiert keinen regelkonformen Tag als ungünstig.
  await page.locator("[data-layout-week-card]", { hasText: hard.title }).first().click();
  await page.getByRole("button", { name: "An Kalender anpassen" }).click();
  await expect(main).toContainText("Kein Konflikt an diesem Tag.");
  await page.getByRole("button", { name: "Trotzdem Tag wählen" }).click();
  const dayOptions = await readDayOptions(page);
  const daySummary = dayOptions.map((o) => `[${o.level}] ${o.text}`).join(" ¦ ");
  test.info().annotations.push({ type: "Tagesliste (Trotzdem Tag wählen)", description: daySummary });
  expect(dayOptions.length, "Tagesliste hat Einträge").toBeGreaterThan(0);
  for (const o of dayOptions) {
    if (o.level === "ungünstig") expect(o.text, "„Ungünstig“ nennt nie einen Eingeschränkt-Grund").not.toMatch(/Eingeschränkt:/);
  }
  expect(new Set(dayOptions.map((o) => o.level)).size, `mehr als eine Stufe sichtbar: ${daySummary}`).toBeGreaterThanOrEqual(2);
  await page.getByRole("button", { name: "Abbrechen" }).click();

  // Dienst am Vortag des neuen Tages ändern → die Bestätigung gilt nicht mehr, der Konflikt wird wieder gemeldet.
  await saveShiftDay(dayBefore, patternKind === "early" ? "Spät" : "Früh");

  await openWeekOf(page, hard.ymd, planStart());
  await page.getByRole("button", { name: SCAN_BUTTON }).click();
  await expect(main, "nach der Dienständerung wird der Tag wieder gemeldet").not.toContainText("Diese Woche passt zu deinem Dienstplan.");
  // Gemeldet wird genau die verschobene Einheit: als Hinweis („… bleibt – …“) oder mit einem neuen Vorschlag.
  const escaped = hard.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  await expect(main).toContainText(new RegExp(`„${escaped}“ bleibt –|kein guter Tag für|${escaped}: [A-Z][a-z] –`));
});

test("5 Fix 4 + Teil 1: Prognosekarte, Rennrechner und Zielzeitfeld zeigen nur die Zielzeit des eigenen Plans", async ({ page }) => {
  await openSignedIn(page);
  const main = page.locator("[data-layout-main-content]");

  await tab(page, "Leistung");
  await expect(main).toContainText("10-km-Prognose", { ignoreCase: true });
  await expect(main).toContainText("Ziel 0:45:00");
  await expect(main, "keine Marathon-Werte am 10-km-Plan").not.toContainText(/Marathon-Prognose|Sub-3|Sub 3|2:50:00|3:00:00/i);
  await expect(main.locator("input[type=text]").first(), "Rennrechner startet mit der Zielzeit des Plans").toHaveValue("0:45:00");
  await expectNoOverflow(page, "Leistung");

  await settingsPage(page, /^Training/);
  const field = main.locator("input[type=text]").first();
  await expect(field, "Zielzeitfeld: Zielzeit des eigenen Plans").toHaveValue("0:45:00");
  await expectNoOverflow(page, "Einstellungen → Training");

  await tab(page, "Einstellungen");
  const backToRoot = page.getByRole("button", { name: "Zurück zu Einstellungen" });
  if (await backToRoot.count()) await backToRoot.click();
  await expect(main).toContainText(/10 km · noch \d+ Tage · Ziel 0:45:00/);

  if (HAS_ADMIN_READ) {
    const plans = await rows<{ data: { meta?: { goal?: { raceGoal: string; targetTime: string | null } } } }>("training_plans", userId(), "data");
    expect(plans[0]?.data?.meta?.goal, "meta.goal stammt aus dem Wizard").toEqual({ raceGoal: "time", targetTime: "0:45:00" });
  }
});

test("6 Fix 1: app_open landet genau einmal in usage_events, Neuladen innerhalb der Drossel erzeugt kein zweites", async ({ page }) => {
  test.skip(!HAS_ADMIN_READ, "braucht Lesezugriff auf usage_events");
  await openSignedIn(page);
  await expect.poll(async () => (await usageEvents(userId())).filter((e) => e.name === "app_open").length, { message: "app_open nach dem Start" }).toBeGreaterThanOrEqual(1);
  const opens = (await usageEvents(userId())).filter((e) => e.name === "app_open");
  const hourAgo = Date.now() - 60 * 60 * 1000;
  expect(opens.filter((e) => Date.parse(e.created_at) > hourAgo).length, "höchstens ein app_open je Stunde").toBe(1);

  await page.reload({ waitUntil: "domcontentloaded" });
  await dismissOverlays(page);
  await tab(page, "Woche");
  await page.waitForTimeout(4000);
  const after = (await usageEvents(userId())).filter((e) => e.name === "app_open");
  expect(after.length, "Neuladen innerhalb der Drossel: kein zweites app_open").toBe(opens.length);

  const names = (await usageEvents(userId())).map((e) => e.name);
  expect(names, "onboarding_done genau einmal").toEqual(expect.arrayContaining(["onboarding_done"]));
  expect(names.filter((n) => n === "onboarding_done").length).toBe(1);
});

test("7 Einheit manuell erledigen → Anstrengungsfrage → session_completed", async ({ page }) => {
  test.skip(!HAS_ADMIN_READ, "braucht Lesezugriff auf den Plan");
  await openSignedIn(page);
  const workouts = (await activePlanWorkouts(userId())).filter((w) => w.sessionType !== "rest").sort((x, y) => x.dateIso.localeCompare(y.dateIso));
  const first = workouts[0];
  const before = (await usageEvents(userId())).filter((e) => e.name === "session_completed").length;

  await openWeekOf(page, first.dateIso.slice(0, 10), planStart());
  await page.locator("[data-layout-week-card]", { hasText: first.title }).first().click();
  await page.getByRole("button", { name: "Eintragen", exact: true }).click();
  await expect(page.getByText("Wie anstrengend war die Einheit?")).toBeVisible();
  await expectNoOverflow(page, "Einheit eintragen");
  await page.getByRole("button", { name: /^Anstrengung 5 von 10/ }).click();
  await page.getByRole("button", { name: "Gefühl 3 von 5" }).click();
  await page.getByRole("button", { name: "Speichern", exact: true }).click();

  await expect(page.locator("[data-layout-week-card]", { hasText: first.title }).first().getByRole("img", { name: "Erledigt" })).toBeVisible();
  await expect(page.locator("[data-layout-main-content]")).toContainText("1 von");

  await expect.poll(() => countRows("session_logs", userId()), { message: "Log in Supabase" }).toBeGreaterThanOrEqual(1);
  await expect
    .poll(async () => (await usageEvents(userId())).filter((e) => e.name === "session_completed").length, { message: "session_completed gezählt" })
    .toBe(before + 1);
  const event = (await usageEvents(userId())).filter((e) => e.name === "session_completed").pop();
  expect(event?.props).toEqual({ source: "manual" });
});

test("8 Feedback senden → Zeile in user_feedback", async ({ page }) => {
  await openSignedIn(page);
  const before = HAS_ADMIN_READ ? ((await countRows("user_feedback", userId())) ?? 0) : 0;
  await settingsPage(page, /^Konto & Hilfe/);
  await page.getByRole("button", { name: /^Feedback geben/ }).click();
  await expectNoOverflow(page, "Feedback");
  await page.getByRole("button", { name: "Idee", exact: true }).click();
  const message = `E2E-Rauchtest ${new Date().toISOString()}`;
  await page.getByPlaceholder("Was ist dir aufgefallen?").fill(message);
  await page.getByRole("button", { name: "Senden", exact: true }).click();
  await expect(page.getByText(/Danke/)).toBeVisible();

  if (HAS_ADMIN_READ) {
    await expect.poll(() => countRows("user_feedback", userId())).toBe(before + 1);
    const list = await rows<{ category: string; message: string; app_version: string | null; screen: string | null; device: string | null }>("user_feedback", userId(), "category,message,app_version,screen,device");
    const row = list.find((r) => r.message === message);
    expect(row, "Feedback-Zeile mit dem gesendeten Text").toBeTruthy();
    expect(row!.category).toBe("idea");
    expect(row!.app_version, "App-Version hängt an").toBeTruthy();
    expect(row!.screen, "Bildschirm hängt an").toBeTruthy();
    await expect.poll(async () => (await usageEvents(userId())).some((e) => e.name === "feedback_sent")).toBe(true);
  }
});

test("9 Nutzungsdaten abschalten → keine neuen usage_events", async ({ page }) => {
  test.skip(!HAS_ADMIN_READ, "braucht Lesezugriff auf usage_events");
  await openSignedIn(page);
  await settingsPage(page, /^Datenschutz & Daten/);
  const row = page.getByRole("button", { name: /^Nutzung zählen/ });
  await expect(row).toContainText("An");
  await row.click();
  await expect(row).toContainText("Aus");
  await page.waitForTimeout(1500);
  const before = await usageEvents(userId());

  // Aktionen, die sonst gezählt würden: Feedback senden (feedback_sent) und ein Neustart (app_open ist durch die
  // Drossel ohnehin gesperrt, zählt hier also nur als Gegenprobe).
  await settingsPage(page, /^Konto & Hilfe/);
  await page.getByRole("button", { name: /^Feedback geben/ }).click();
  await page.getByRole("button", { name: "Lob", exact: true }).click();
  await page.getByPlaceholder("Was ist dir aufgefallen?").fill(`E2E-Rauchtest ohne Nutzungsdaten ${new Date().toISOString()}`);
  await page.getByRole("button", { name: "Senden", exact: true }).click();
  await expect(page.getByText(/Danke/)).toBeVisible();
  await page.reload({ waitUntil: "domcontentloaded" });
  await dismissOverlays(page);
  await page.waitForTimeout(4000);

  const after = await usageEvents(userId());
  expect(after.length, `keine neuen Ereignisse (neu: ${after.slice(before.length).map((e) => e.name).join(", ")})`).toBe(before.length);

  await settingsPage(page, /^Datenschutz & Daten/);
  await expect(page.getByRole("button", { name: /^Nutzung zählen/ }), "Wahl übersteht das Neuladen").toContainText("Aus");
});

test("KI-Coach (einziger Test mit Einwilligung): gesperrt ohne Zustimmung, nach Zustimmung genau eine Frage", async ({ page }) => {
  await openSignedIn(page);
  await tab(page, "Coach");
  const main = page.locator("[data-layout-main-content]");
  const consentGiven = HAS_ADMIN_READ && ((await rows<{ ai_consent_at: string | null }>("profiles", userId(), "ai_consent_at"))[0]?.ai_consent_at ?? null) != null;
  if (!consentGiven) {
    // Ohne Zustimmung ist der Coach gesperrt und sendet nichts.
    await expect(page.getByRole("button", { name: "Coach aktivieren" })).toBeVisible();
    await expect(page.getByLabel("Nachricht an den Coach")).toHaveCount(0);
    await expectNoOverflow(page, "Coach gesperrt");
    await page.getByRole("button", { name: "Coach aktivieren" }).click();
    await expect(page.getByRole("heading", { name: "KI-Coach aktivieren?" })).toBeVisible();
    await page.getByRole("button", { name: "Zustimmen und Coach nutzen" }).click();
    await expect(page.getByRole("heading", { name: "KI-Coach aktivieren?" })).toHaveCount(0);
  }
  if (HAS_ADMIN_READ) {
    await expect.poll(async () => (await rows<{ ai_consent_at: string | null }>("profiles", userId(), "ai_consent_at"))[0]?.ai_consent_at ?? null).not.toBeNull();
  }

  await tab(page, "Coach");
  const input = page.getByLabel("Nachricht an den Coach");
  await input.fill("Was steht morgen an?");
  const reply = page.waitForResponse((r) => /\/api\/ai$/.test(r.url().split("?")[0]) && r.request().method() === "POST", { timeout: 60_000 });
  await input.press("Enter");
  const response = await reply;
  expect(response.status(), "Coach-Antwort vom Server").toBe(200);
  await expect(main).not.toContainText("lokaler Coach aktiv", { timeout: 30_000 });
  await expectNoOverflow(page, "Coach mit Antwort");

  // Einwilligung wieder zurückziehen: der Rest der Suite läuft ohne KI.
  await settingsPage(page, /^Datenschutz & Daten/);
  const coachRow = page.getByRole("button", { name: /^KI-Coach/ });
  await expect(coachRow).toContainText("An");
  await coachRow.click();
  const confirm = page.getByRole("button", { name: /Ausschalten|Widerrufen|Deaktivieren/ });
  if (await confirm.count()) await confirm.first().click();
  await expect(coachRow).toContainText("Aus");
  if (HAS_ADMIN_READ) {
    await expect.poll(async () => (await rows<{ ai_consent_at: string | null }>("profiles", userId(), "ai_consent_at"))[0]?.ai_consent_at ?? null).toBeNull();
  }
});

test("10 Abmelden und wieder anmelden: lokale Bestätigungen gelöscht, Daten aus Supabase wieder da", async ({ page }) => {
  await openSignedIn(page);
  const a = account();
  const acceptedKey = `marathonShiftAcceptedMoves:${userId()}`;
  const keysBefore = await page.evaluate(() => Object.keys(localStorage));
  const acceptedBefore = keysBefore.filter((k) => /AcceptedMoves/i.test(k));
  const shiftCacheBefore = keysBefore.filter((k) => /ShiftEntries/i.test(k));
  // Vorbedingung: Bestätigung (Test 3) und Dienstplan-Cache liegen wirklich lokal — sonst prüfte der Test nichts.
  expect(acceptedBefore, `lokale Bestätigung vorhanden (Schlüssel: ${keysBefore.filter((k) => /^marathon/i.test(k)).join(", ")})`).toContain(acceptedKey);
  expect(shiftCacheBefore.length, "lokaler Dienstplan-Cache vorhanden").toBeGreaterThan(0);

  await settingsPage(page, /^Konto & Hilfe/);
  await page.getByRole("button", { name: "Abmelden", exact: true }).click();
  await expect(page.locator("input[type=email]")).toBeVisible({ timeout: 30_000 });

  // Lokal: nichts vom Konto bleibt liegen — außer der Wahl „Nutzung zählen“ (gilt je Person, übersteht das Abmelden).
  const keysAfter = await page.evaluate(() => Object.keys(localStorage));
  const leftovers = keysAfter.filter((k) => /^marathon/i.test(k) && !/UsageEvents/i.test(k));
  expect(keysAfter.filter((k) => /AcceptedMoves|ShiftEntries/i.test(k)), `Bestätigungen und Dienstplan-Cache gelöscht (vorher: ${acceptedBefore.join(", ") || acceptedKey})`).toEqual([]);
  expect(keysAfter.filter((k) => /^sb-.*-auth-token$/.test(k)), "Sitzung beendet").toEqual([]);
  test.info().annotations.push({ type: "localStorage nach dem Abmelden", description: leftovers.join(", ") || "(leer)" });

  await signIn(page, a);
  await dismissOverlays(page);
  const main = page.locator("[data-layout-main-content]");

  // Plan, erledigte Einheit und Dienstplan kommen aus Supabase zurück; kein Wizard, kein Demo-Plan.
  await expect(page.getByRole("heading", { name: "Distanz & Ziel" })).toHaveCount(0);
  await tab(page, "Heute");
  await expect(main).toContainText(/Woche \d+ von \d+/i);
  await expect(main).not.toContainText("Warschau");
  await tab(page, "Woche");
  await expect(main.getByRole("img", { name: "Erledigt" }).first()).toBeVisible();
  await settingsPage(page, /^Training/);
  const savedShifts = HAS_ADMIN_READ ? ((await countRows("shift_entries", userId())) ?? 0) : null;
  const shiftRow = page.getByRole("button", { name: /^Dienstplan/ });
  await expect(shiftRow, "Dienstplan kommt aus Supabase zurück").toContainText(savedShifts != null ? `${savedShifts} Tage` : /\d+ Tage/);
  if (savedShifts != null) expect(savedShifts).toBeGreaterThanOrEqual(14);
  await expect(main.locator("input[type=text]").first()).toHaveValue("0:45:00");
  await settingsPage(page, /^Datenschutz & Daten/);
  await expect(page.getByRole("button", { name: /^Nutzung zählen/ }), "„Nutzung zählen: Aus“ übersteht Ab- und Anmelden").toContainText("Aus");
  await expect(page.getByRole("button", { name: /^KI-Coach/ })).toContainText("Aus");

  // Die Verschiebung selbst bleibt (Plan-Patch in Supabase), die lokale Bestätigung ist weg.
  if (a.hardDay && a.movedDay) {
    await openWeekOf(page, a.hardDay, planStart());
    const hardTitle = (await activePlanWorkouts(userId())).find((w) => w.dateIso.slice(0, 10) === a.hardDay)?.title;
    if (hardTitle) expect(await dayOfMonthForSession(page, hardTitle)).toBe(Number(a.movedDay.slice(8, 10)));
  }
  expect(await page.evaluate((k) => localStorage.getItem(k), acceptedKey), "keine lokale Bestätigung nach dem Wiederanmelden").toBeNull();
});

test("11 Konto über die App löschen → alle Zeilen des Kontos sind weg", async ({ page }) => {
  await openSignedIn(page);
  const a = account();
  const uid = userId();

  // Nach dem Löschen beendet die App die Sitzung; Supabase antwortet darauf mit 403, weil es das Konto nicht mehr
  // gibt. Die App fängt das ab (accountActions.ts, „signOut nach dem Löschen“) — kein Befund.
  watcher.allow(/403 POST .*\/auth\/v1\/logout/);
  watcher.allow(/Failed to load resource: the server responded with a status of 403/);

  await settingsPage(page, /^Konto & Hilfe/);
  await page.getByRole("button", { name: "Konto löschen", exact: true }).click();
  await expectNoOverflow(page, "Konto löschen");
  await page.locator("#account-delete-confirm").fill("LÖSCHEN");
  const deleteCall = page.waitForResponse((r) => r.request().method() === "DELETE" && /\/api\/account$/.test(r.url().split("?")[0]), { timeout: 60_000 });
  await page.locator("form button[type=submit]").click();
  const deleteResponse = await deleteCall;
  // Im Browser läuft der Aufruf same-origin über den Dev-Proxy an die lokale API (getApiBaseUrl() ist im Web leer),
  // also durch den Lösch-Code dieses Branches — nicht an Production.
  expect(new URL(deleteResponse.url()).origin, "DELETE /api/account geht an die lokale API").toBe(new URL(page.url()).origin);
  expect(deleteResponse.status()).toBe(200);
  await expect(page.locator("input[type=email]")).toBeVisible({ timeout: 60_000 });
  keepStorage = false;

  if (HAS_ADMIN_READ) {
    await expect.poll(() => authUserExists(uid), { message: "Auth-Konto gelöscht", timeout: 30_000 }).toBe(false);
    const left: string[] = [];
    for (const table of USER_TABLES) {
      const n = await countRows(table, uid);
      if (n != null && n > 0) left.push(`${table}=${n}`);
    }
    expect(left, "keine Zeilen des Kontos mehr in Supabase").toEqual([]);
  }

  // Erneuter Login muss scheitern.
  watcher.allow(/400 POST .*\/auth\/v1\/token/);
  watcher.allow(/Failed to load resource: the server responded with a status of 400/);
  await page.locator("input[type=email]").fill(a.email);
  await page.locator("input[type=password]").first().fill(a.password);
  await page.locator("button[type=submit]").click();
  await expect(page.getByText(/E-Mail oder Passwort|nicht korrekt|falsch|ungültig/i)).toBeVisible();
  await expect(page.getByRole("button", { name: "Einstellungen", exact: true })).toHaveCount(0);
  clearAccount();
});

test("12 iPhone-Pfad: DELETE /api/account von einem fremden Origin wird nicht von CORS blockiert", async ({ page }) => {
  // Im Browser läuft „Konto löschen“ same-origin über den Proxy. Die iOS-App (capacitor://localhost) ruft dagegen
  // die Production-API von einem fremden Origin auf: der Preflight muss DELETE erlauben, sonst blockiert die WebView.
  // Geprüft wird ohne gültiges Token (Antwort 401) — es wird nichts gelöscht.
  const apiBase = ENV.apiBase || "https://marathon-app-alpha.vercel.app";
  const pre = await fetch(`${apiBase}/api/account`, {
    method: "OPTIONS",
    headers: { Origin: "http://localhost:3000", "Access-Control-Request-Method": "DELETE", "Access-Control-Request-Headers": "authorization" },
  });
  const allowed = pre.headers.get("access-control-allow-methods") ?? "";
  const deployed = /\bDELETE\b/i.test(allowed);
  test.info().annotations.push({ type: "Preflight", description: `${apiBase}/api/account → Access-Control-Allow-Methods: ${allowed || "(leer)"}` });
  // Der Fix (api/_lib/cors.js, vercel.json) wirkt erst nach einem Production-Deploy; bis dahin ist der Fehler erwartet.
  test.fail(!deployed, "OFFENER BEFUND: Production-API erlaubt DELETE im CORS-Preflight noch nicht — Konto löschen scheitert in der iOS-App.");

  watcher.allow(/api\/account/);
  watcher.allow(/CORS|Failed to load resource|ERR_FAILED/);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const outcome = await page.evaluate(async (url) => {
    try {
      const res = await fetch(url, { method: "DELETE", headers: { Authorization: "Bearer e2e-kein-gueltiges-token" } });
      return `HTTP ${res.status}`;
    } catch (err) {
      return `BLOCKIERT ${String(err)}`;
    }
  }, `${apiBase}/api/account`);
  expect(outcome, "die Anfrage erreicht den Server (401 ohne gültiges Token)").toBe("HTTP 401");
});
