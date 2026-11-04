import { WEEKDAYS, addDays, dateInWeek, diffDays, dowOf, isYmd, mondayOf, weekIndexOf, weekdayOf } from "../dates";

describe("planCore dates", () => {
  describe("isYmd", () => {
    it("erkennt echte Kalendertage", () => {
      expect(isYmd("2026-11-04")).toBe(true);
      expect(isYmd("2028-02-29")).toBe(true);
      expect(isYmd("2027-12-31")).toBe(true);
    });

    it("lehnt ungültige Werte ab", () => {
      ["2026-02-29", "2026-02-30", "2026-13-01", "2026-00-10", "2026-1-1", "20261104", "2026-11-04T12:00:00Z", "1800-01-01", "", "x"].forEach(
        (value) => expect(isYmd(value)).toBe(false),
      );
      [null, undefined, 20261104, {}].forEach((value) => expect(isYmd(value)).toBe(false));
    });
  });

  describe("addDays / diffDays", () => {
    it("rechnet über Monats-, Jahres- und Schaltjahrgrenzen", () => {
      expect(addDays("2026-11-04", 3)).toBe("2026-11-07");
      expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
      expect(addDays("2027-01-01", -1)).toBe("2026-12-31");
      expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
      expect(addDays("2027-02-28", 1)).toBe("2027-03-01");
    });

    it("ist unabhängig von Sommerzeit-Umstellungen", () => {
      expect(addDays("2026-03-28", 1)).toBe("2026-03-29");
      expect(addDays("2026-03-29", 1)).toBe("2026-03-30");
      expect(addDays("2026-10-24", 2)).toBe("2026-10-26");
      expect(diffDays("2026-03-30", "2026-03-27")).toBe(3);
      expect(diffDays("2026-10-27", "2026-10-24")).toBe(3);
    });

    it("diffDays ist die Umkehrung von addDays", () => {
      ["2026-01-01", "2026-03-29", "2026-10-25", "2027-02-28", "2028-02-29"].forEach((start) => {
        for (let n = -400; n <= 400; n += 37) {
          expect(diffDays(addDays(start, n), start)).toBe(n);
        }
      });
    });

    it("diffDays zählt positiv, wenn der erste Tag später liegt", () => {
      expect(diffDays("2027-03-07", "2026-11-04")).toBe(123);
      expect(diffDays("2026-11-04", "2027-03-07")).toBe(-123);
      expect(diffDays("2026-11-04", "2026-11-04")).toBe(0);
    });

    it("wirft bei ungültigem Datum", () => {
      expect(() => addDays("2026-02-30", 1)).toThrow("invalid-ymd");
      expect(() => diffDays("x", "2026-01-01")).toThrow("invalid-ymd");
      expect(() => addDays("2026-11-04", Number.NaN)).toThrow("invalid-days");
      expect(() => addDays("2026-11-04", Number.POSITIVE_INFINITY)).toThrow("invalid-days");
    });
  });

  describe("Wochentage", () => {
    it("dowOf zählt 0 = Sonntag", () => {
      expect(dowOf("2026-11-08")).toBe(0);
      expect(dowOf("2026-11-02")).toBe(1);
      expect(dowOf("2026-11-04")).toBe(3);
      expect(dowOf("2026-11-07")).toBe(6);
    });

    it("weekdayOf liefert Mo … So", () => {
      const week = ["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-07", "2026-11-08"];
      expect(week.map(weekdayOf)).toEqual(["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"]);
      expect(WEEKDAYS).toEqual(["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"]);
    });

    it("mondayOf: Montag bleibt, Sonntag geht zurück auf den Montag davor", () => {
      expect(mondayOf("2026-11-02")).toBe("2026-11-02");
      expect(mondayOf("2026-11-08")).toBe("2026-11-02");
      expect(mondayOf("2026-11-09")).toBe("2026-11-09");
      expect(mondayOf("2027-01-01")).toBe("2026-12-28");
    });

    it("weekIndexOf zählt ab dem ersten Montag, Tage davor sind Woche 0", () => {
      expect(weekIndexOf("2026-11-02", "2026-11-02")).toBe(1);
      expect(weekIndexOf("2026-11-08", "2026-11-02")).toBe(1);
      expect(weekIndexOf("2026-11-09", "2026-11-02")).toBe(2);
      // 02.11.2026 → Montag 01.03.2027 sind 119 Tage = 17 Wochen, also Woche 18
      expect(weekIndexOf("2027-03-07", "2026-11-02")).toBe(18);
      expect(weekIndexOf("2026-10-31", "2026-11-02")).toBe(0);
    });

    it("dateInWeek setzt den Wochentag in die Woche ein", () => {
      expect(dateInWeek("2026-11-02", "Mo")).toBe("2026-11-02");
      expect(dateInWeek("2026-11-02", "So")).toBe("2026-11-08");
      WEEKDAYS.forEach((day) => expect(weekdayOf(dateInWeek("2026-11-02", day))).toBe(day));
    });
  });
});
