// Gelöschte Endpunkte dürfen nicht versehentlich zurückkommen: jede Datei unter api/ (außer _lib) ist eine
// öffentlich erreichbare Vercel-Funktion.

const fs = require("fs");
const path = require("path");

const API_DIR = path.resolve(__dirname, "../../api");

function listFunctionFiles(dir, prefix = "") {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === "_lib") return [];
    const rel = path.posix.join(prefix, entry.name);
    return entry.isDirectory() ? listFunctionFiles(path.join(dir, entry.name), rel) : [rel];
  });
}

describe("Vercel-Funktionen", () => {
  test("genau die erwarteten Endpunkte sind deployt", () => {
    expect(listFunctionFiles(API_DIR).sort()).toEqual([
      "account.js",
      "ai.js",
      "onboarding/generate-plan-full.js",
      "onboarding/generate-plan.js",
      "strava/auth.js",
      "strava/callback.js",
    ]);
  });

  test("der lokale Express-Server gibt kein Key-Fragment aus und hat keine daily-coach-Route", () => {
    const source = fs.readFileSync(path.resolve(__dirname, "../../server/index.js"), "utf8");
    expect(source).not.toMatch(/keyPrefix|key_prefix/);
    expect(source).not.toMatch(/apiKey\.slice/);
    expect(source).not.toMatch(/app\.post\(\s*"\/api\/ai\/daily-coach"/);
    expect(source).toMatch(/app\.get\(\s*"\/api\/ai\/health"/);
  });
});
