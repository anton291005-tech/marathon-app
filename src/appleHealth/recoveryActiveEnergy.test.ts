// Aktivenergie kommt im Plugin als „calories“ (HKQuantityTypeIdentifier.activeEnergyBurned) und landet weiter als
// activeEnergyKcal in den Erholungs-Tageswerten.
import { healthKitFetchRecoveryDailyLast120Days } from "./appleHealthService";

const mockRead: string[] = [];
jest.mock("@capgo/capacitor-health", () => ({
  Health: {
    isAvailable: async () => ({ available: true }),
    readSamples: async ({ dataType }: { dataType: string }) => {
      mockRead.push(dataType);
      if (dataType !== "calories") return { samples: [] };
      return {
        samples: [
          { dataType: "calories", value: 300, unit: "kilocalorie", startDate: "2026-11-10T08:00:00", endDate: "2026-11-10T09:00:00" },
          { dataType: "calories", value: 150, unit: "kilocalorie", startDate: "2026-11-10T17:00:00", endDate: "2026-11-10T18:00:00" },
        ],
      };
    },
  },
}));

it("liest „calories“ statt des unbekannten „activeEnergyBurned“ und summiert je Tag", async () => {
  const rows = await healthKitFetchRecoveryDailyLast120Days(new Date("2026-11-12T12:00:00"));
  expect(mockRead).toContain("calories");
  expect(mockRead).not.toContain("activeEnergyBurned");
  expect(rows.find((r) => r.date === "2026-11-10")?.activeEnergyKcal).toBe(450);
});
