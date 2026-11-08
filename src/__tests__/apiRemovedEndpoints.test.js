// Gelöschte Endpunkte dürfen nicht versehentlich zurückkommen: jede Datei unter api/ (außer _lib) ist eine
// öffentlich erreichbare Vercel-Funktion.

const fs = require("fs");
const path = require("path");

const API_DIR = path.resolve(__dirname, "../../api");

// api/tsconfig.json ist Konfiguration für die Übersetzung von api/*.ts (module commonjs), keine Funktion.
// Nur diese eine Datei ist ausgenommen; jede andere neue Datei unter api/ schlägt weiter an.
const CONFIG_FILES_AT_API_ROOT = new Set(["tsconfig.json"]);

function listFunctionFiles(dir, prefix = "") {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === "_lib") return [];
    if (prefix === "" && !entry.isDirectory() && CONFIG_FILES_AT_API_ROOT.has(entry.name)) return [];
    const rel = path.posix.join(prefix, entry.name);
    return entry.isDirectory() ? listFunctionFiles(path.join(dir, entry.name), rel) : [rel];
  });
}

describe("Vercel-Funktionen", () => {
  test("api/tsconfig.json übersetzt nur TypeScript und lässt die .js-Funktionen unberührt", () => {
    const config = JSON.parse(fs.readFileSync(path.join(API_DIR, "tsconfig.json"), "utf8"));
    const options = config.compilerOptions || {};
    // Ohne commonjs behält Vercel die ESM-Syntax und der Aufruf scheitert (docs/plan-core-plan.md, Einbindungstest).
    expect(options.module).toBe("commonjs");
    expect(options).not.toHaveProperty("allowJs");
    expect(options).not.toHaveProperty("checkJs");
  });

  test("genau die erwarteten Endpunkte sind deployt", () => {
    expect(listFunctionFiles(API_DIR).sort()).toEqual([
      "account.js",
      "ai.js",
      "onboarding/generate-plan-full.ts",
      "onboarding/generate-plan.js",
      "strava/auth.js",
      "strava/callback.js",
    ]);
  });

  test("keine Route liegt doppelt als .js und .ts (Vercel würde beide bauen)", () => {
    const routes = listFunctionFiles(API_DIR).map((file) => file.replace(/\.(js|ts)$/, ""));
    expect(new Set(routes).size).toBe(routes.length);
  });

  test("der lokale Express-Server gibt kein Key-Fragment aus und hat keine daily-coach-Route", () => {
    const source = fs.readFileSync(path.resolve(__dirname, "../../server/index.js"), "utf8");
    expect(source).not.toMatch(/keyPrefix|key_prefix/);
    expect(source).not.toMatch(/apiKey\.slice/);
    expect(source).not.toMatch(/app\.post\(\s*"\/api\/ai\/daily-coach"/);
    expect(source).toMatch(/app\.get\(\s*"\/api\/ai\/health"/);
  });

  test("der lokale Express-Server bindet nur auf Loopback, Proxy und CORS passen dazu", () => {
    const server = fs.readFileSync(path.resolve(__dirname, "../../server/index.js"), "utf8");
    expect(server).toMatch(/const host = "127\.0\.0\.1";/);
    expect(server).toMatch(/app\.listen\(port, host,/);
    expect(server).toMatch(/allowedHeaders: \["Content-Type", "Authorization"\]/);

    const proxy = fs.readFileSync(path.resolve(__dirname, "../setupProxy.js"), "utf8");
    expect(proxy).toMatch(/target: `http:\/\/127\.0\.0\.1:\$\{/);
  });
});
