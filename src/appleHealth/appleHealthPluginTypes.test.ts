// Jeder Typ, den die App beim bestehenden Plugin anfragt oder liest, muss dort existieren: Ein einziger unbekannter
// Name lässt @capgo/capacitor-health den ganzen requestAuthorization-Aufruf mit invalidDataType abbrechen
// (Gerätebefund 13.11.2026: „activeEnergyBurned“ → SDNN/SpO2 nie angefragt, „Authorization not determined“).
import { readFileSync } from "fs";
import { join } from "path";
import { APPLE_HEALTH_READ_TYPES } from "./appleHealthService";

const defs = readFileSync(join(process.cwd(), "node_modules/@capgo/capacitor-health/dist/esm/definitions.d.ts"), "utf8");
const union = defs.match(/export type HealthDataType = ([^;]+);/);
const pluginTypes = new Set((union?.[1] ?? "").split("|").map((t) => t.trim().replace(/'/g, "")));
const source = readFileSync(join(process.cwd(), "src/appleHealth/appleHealthService.ts"), "utf8");

it("die Typliste des Plugins ist lesbar", () => {
  expect(pluginTypes.has("heartRateVariability")).toBe(true);
  expect(pluginTypes.size).toBeGreaterThan(10);
});

it.each(APPLE_HEALTH_READ_TYPES.filter((t) => t !== "workouts"))("%s ist ein Plugin-Typ", (type) => {
  expect(pluginTypes.has(type)).toBe(true);
});

it("auch die im Recovery-Abruf gelesenen Typen existieren im Plugin", () => {
  const block = source.slice(source.indexOf("export async function healthKitFetchRecoveryDailyLast120Days"));
  const list = block.slice(block.indexOf("const types = ["), block.indexOf("] as const;"));
  const names = Array.from(list.matchAll(/"([A-Za-z]+)"/g)).map((m) => m[1]);
  expect(names.length).toBeGreaterThan(5);
  for (const n of names) expect(pluginTypes.has(n)).toBe(true);
});
