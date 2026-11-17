/**
 * Wizard nutzt Design-Tokens statt des alten Navy/Blau (docs/design-system/README.md: Tokens statt Hex).
 * Quelltext-Probe, damit beim nächsten Umbau keine Hex-Werte zurückkommen.
 */
import fs from "fs";
import path from "path";

describe("Onboarding: Farben nur aus Design-Tokens", () => {
  const source = fs.readFileSync(path.join(__dirname, "Onboarding.tsx"), "utf8");

  it("enthält keine Hex-Farben und kein altes Blau/Navy", () => {
    expect(source.match(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b(?![0-9a-fA-F])/g) ?? []).toEqual([]);
    expect(source).not.toMatch(/rgba\(59, 130, 246/);
    expect(source).not.toMatch(/rgba\(148, 163, 184/);
  });
});
