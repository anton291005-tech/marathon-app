import { assessShiftDays, indexShiftDays, type ShiftEntry } from "../../readinessCore/shiftDays";
import { describeShift, formatShiftTimes, moveSentenceDe, shiftShortLabel, todayShiftLineDe } from "../shiftText";

const N: ShiftEntry = { dateYmd: "2026-11-16", kind: "night", start: "22:00", end: "06:00" };
const days = indexShiftDays(
  assessShiftDays({
    entries: [N, { dateYmd: "2026-11-17", kind: "off", start: null, end: null }, { dateYmd: "2026-11-19", kind: "early", start: "06:00", end: "14:00" }],
    fromYmd: "2026-11-16",
    toYmd: "2026-11-22",
  }),
);

describe("shiftText", () => {
  it("Zeiten und Dienste deutsch", () => {
    expect(formatShiftTimes(N)).toBe("22–6 Uhr");
    expect(formatShiftTimes({ dateYmd: "2026-11-16", kind: "late", start: "17:00", end: "00:30" })).toBe("17:00–0:30 Uhr");
    expect(describeShift(N)).toBe("Nachtdienst (22–6 Uhr)");
    expect(describeShift({ dateYmd: "2026-11-16", kind: "custom", start: "20:00", end: "04:00" })).toBe("Nachtdienst (20–4 Uhr)");
  });

  it("Kürzel F/S/N/frei; eigene Zeiten nach Beginn eingeordnet", () => {
    expect(shiftShortLabel(N)).toBe("N");
    expect(shiftShortLabel({ dateYmd: "2026-11-16", kind: "off", start: null, end: null })).toBe("frei");
    expect(shiftShortLabel({ dateYmd: "2026-11-16", kind: "custom", start: "07:00", end: "15:00" })).toBe("F");
    expect(shiftShortLabel({ dateYmd: "2026-11-16", kind: "custom", start: "17:00", end: "00:30" })).toBe("S");
  });

  it("Vorschlagssatz nennt Dienst und Merkmal", () => {
    expect(
      moveSentenceDe({
        sessionType: "interval",
        fromDay: days["2026-11-17"],
        fromYmd: "2026-11-17",
        toYmd: "2026-11-19",
        toDay: days["2026-11-19"],
        todayYmd: "2026-11-16",
        category: "hard",
        limited: false,
      }),
    ).toBe("Nach dem Nachtdienst (22–6 Uhr) ist Dienstag kein guter Tag für Intervalle. Vorschlag: Donnerstag – da passt es neben dem Frühdienst (6–14 Uhr).");
  });

  it("Heute: genau ein Satz je Lage", () => {
    const after = days["2026-11-17"];
    expect(todayShiftLineDe(after, "interval", true)).toBe(
      "Nach dem Nachtdienst (22–6 Uhr) ist heute kein guter Tag für die Intervalle – im Woche-Tab findest du einen Vorschlag.",
    );
    expect(todayShiftLineDe(after, "interval")).toBe(
      "Nach dem Nachtdienst (22–6 Uhr) ist heute kein guter Tag für die Intervalle – nimm dir heute nicht zu viel vor.",
    );
    expect(todayShiftLineDe(after, "easy")).toBe("Nach dem Nachtdienst (22–6 Uhr): heute nur kurz und locker, und erst nach dem Schlafen.");
    expect(todayShiftLineDe(after, "rest")).toBe("Nach dem Nachtdienst (22–6 Uhr) passt der Ruhetag heute gut.");
    expect(todayShiftLineDe(days["2026-11-19"], "tempo")).toBe("Der Frühdienst (6–14 Uhr) lässt dir heute Zeit für den Tempolauf.");
    const sentences: number[] = [];
    [after, days["2026-11-19"], days["2026-11-18"]].forEach((d) => {
      ["interval", "easy", "long", "rest", null].forEach((type) => {
        sentences.push(todayShiftLineDe(d, type).split(/[.!?](?:\s|$)/).filter((part) => part.trim()).length);
      });
    });
    expect(sentences.every((n) => n === 1)).toBe(true);
  });
});
