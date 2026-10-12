import { stripDecorativeEmoji } from "./stripDecorativeEmoji";

describe("stripDecorativeEmoji", () => {
  test("entfernt Emojis am Anfang, am Ende und mittendrin", () => {
    expect(stripDecorativeEmoji("🏁 Marathon")).toBe("Marathon");
    expect(stripDecorativeEmoji("Base W3 ⬇️")).toBe("Base W3");
    expect(stripDecorativeEmoji("Taper W2 ⬇️⬇️")).toBe("Taper W2");
    expect(stripDecorativeEmoji("⬇️ Entlastungswoche – Volumen reduziert")).toBe("Entlastungswoche – Volumen reduziert");
    expect(stripDecorativeEmoji("START 🔥 Erste Hälfte")).toBe("START Erste Hälfte");
    expect(stripDecorativeEmoji("Long Run 32 km mit MP-Block 🏔️")).toBe("Long Run 32 km mit MP-Block");
  });

  test("lässt Text, Zahlen, Satzzeichen und Pace-Zeichen unverändert", () => {
    for (const text of ["Intervall: 3×5000m", "⌀ 4:01/km = 2:49:50", "5:20–5:40/km", "2km WU · 16km @ 3:58/km", "Läufe #1 & 2*", ""]) {
      expect(stripDecorativeEmoji(text)).toBe(text);
    }
  });

  test("nur Emoji ergibt leeren Text", () => {
    expect(stripDecorativeEmoji("🏆")).toBe("");
  });
});
