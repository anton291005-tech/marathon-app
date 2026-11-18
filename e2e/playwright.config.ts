import { defineConfig } from "@playwright/test";

/**
 * Rauchtest der echten App im Browser (Chromium headless, 390×844).
 * Start: `npm run test:e2e` — nutzt eine laufende App auf :3000 oder startet `npm run start:full` selbst.
 * Nicht Teil von `npm test` (Jest sieht nur src/**); der Vercel-Build ruft dies nie auf.
 */
export default defineConfig({
  testDir: ".",
  testMatch: /.*\.spec\.ts$/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 240_000,
  expect: { timeout: 15_000 },
  outputDir: "./.results/artifacts",
  reporter: [["list"], ["json", { outputFile: "./.results/report.json" }]],
  use: {
    baseURL: process.env.E2E_BASE_URL || "http://localhost:3000",
    browserName: "chromium",
    headless: true,
    viewport: { width: 390, height: 844 },
    locale: "de-DE",
    timezoneId: "Europe/Berlin",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    actionTimeout: 20_000,
  },
  webServer: {
    command: "BROWSER=none npm run start:full",
    url: "http://localhost:3000",
    cwd: "..",
    reuseExistingServer: true,
    timeout: 240_000,
  },
});
