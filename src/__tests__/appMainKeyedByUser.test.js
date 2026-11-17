/**
 * Kontowechsel ohne Abmelden (z. B. Bestätigungslink eines zweiten Kontos, während das erste angemeldet ist):
 * AppMain muss neu starten, sonst blieben Plan, Logs und Preferences des ersten Kontos im React-State.
 * index.tsx rendert beim Import direkt in #root — deshalb eine Quelltext-Probe statt eines Render-Tests.
 */
const fs = require("fs");
const path = require("path");

test("index.tsx bindet AppMain an die Nutzer-ID (key)", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "index.tsx"), "utf8");
  expect(source).toMatch(/<AppMain\s+key=\{user\.id\}\s*\/>/);
});
