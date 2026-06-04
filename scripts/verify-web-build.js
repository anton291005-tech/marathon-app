/* eslint-disable no-console */
const fs = require("fs");
const path = require("path");

/** Match webDir from root capacitor.config.ts or ios/App/App/capacitor.config.json (expected: `dist/`). */
function readWebDirFromTs() {
  const configPath = path.resolve(process.cwd(), "capacitor.config.ts");
  if (!fs.existsSync(configPath)) return null;
  const raw = fs.readFileSync(configPath, "utf8");
  const m = raw.match(/webDir\s*:\s*['"]([^'"]+)['"]/);
  return m && m[1] ? String(m[1]).trim() : null;
}

function readWebDirFromIosJson() {
  const configPath = path.resolve(process.cwd(), "ios/App/App/capacitor.config.json");
  if (!fs.existsSync(configPath)) return null;
  try {
    const j = JSON.parse(fs.readFileSync(configPath, "utf8"));
    return typeof j.webDir === "string" ? j.webDir.trim() : null;
  } catch {
    return null;
  }
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

const webDirTs = readWebDirFromTs();
const webDirIos = readWebDirFromIosJson();
if (webDirTs && webDirIos && webDirTs !== webDirIos) {
  fail(
    `Capacitor webDir mismatch: capacitor.config.ts has "${webDirTs}" but ios/App/App/capacitor.config.json has "${webDirIos}". Run "npx cap sync" from the project root to align native config.`,
  );
}

const webDir = webDirTs || webDirIos || "dist";
const webDirPath = path.resolve(process.cwd(), webDir);
const indexPath = path.join(webDirPath, "index.html");

if (!fs.existsSync(webDirPath)) {
  fail(
    `Build output missing: directory "${webDir}/" does not exist. Build output missing index.html. Run build step first (npm run build).`,
  );
}

if (!fs.existsSync(indexPath)) {
  fail(
    `Build output missing index.html in "${webDir}/". Run npm run build first (CRA with BUILD_PATH=dist). Check capacitor.config.ts webDir matches.`,
  );
}

console.log(`✅ Capacitor web output verified: ${webDir}/index.html exists`);
