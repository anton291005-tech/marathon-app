// Info.plist-Text, Datenschutzerklärung und Datennutzungsseite müssen dieselben Apple-Health-Typen nennen.
import { readFileSync } from "fs";
import { join } from "path";
import { listAppleHealthDataTypes } from "./dataUsage";

const root = process.cwd();
const plist = readFileSync(join(root, "ios/App/App/Info.plist"), "utf8");
const policy = readFileSync(join(root, "public/privacy-policy.html"), "utf8");
const page = listAppleHealthDataTypes(true).join(" | ");

/** Gemeinsamer Begriff je Signal – kommt in allen drei Texten vor. */
const COMMON_TERMS = [
  "Herzfrequenzvariabilität",
  "HRV",
  "Handgelenktemperatur",
  "Anstrengung",
  "Blutsauerstoff",
  "Pulserholung",
  "VO2max",
  "Atemfrequenz",
  "Ruhepuls",
  "Schlaf",
];

describe("Health-Typen: Info.plist, Datenschutzerklärung, Datennutzungsseite", () => {
  it.each(COMMON_TERMS)("%s steht in allen drei", (term) => {
    expect(plist).toContain(term);
    expect(policy).toContain(term);
    expect(page).toContain(term);
  });

  it("Datenschutzerklärung nennt SDNN und RMSSD, Art. 9 Abs. 2 lit. a DSGVO und den Widerruf", () => {
    for (const t of ["SDNN", "RMSSD", "Art. 9 Abs. 2 lit. a", "Widerruf", "rpe_source", "recovery_daily", "session_logs"]) {
      expect(policy).toContain(t);
    }
  });

  it("Info.plist: nur lesen", () => {
    expect(plist).toContain("schreibt nichts in Apple Health");
  });

  it("offene Rechtsfragen sind mit TODO-RECHT markiert", () => {
    expect((policy.match(/TODO-RECHT/g) ?? []).length).toBeGreaterThanOrEqual(4);
  });
});
