import { buildRecoveryInsightText, detectRecoveryWarnings } from "./aiInsightGenerator";
import type { RecoveryDailyRow } from "./recoveryTypes";

describe("buildRecoveryInsightText", () => {
  const baselineSleep = 7.5;
  const baselineHrv = 55;
  const last7 = ["2026-04-14", "2026-04-15", "2026-04-16", "2026-04-17", "2026-04-18", "2026-04-19", "2026-04-20"];

  function rowsForSleepAndHrv(sleepAvg: number, hrvAvg: number): RecoveryDailyRow[] {
    return last7.map((date) => ({ date, sleepHours: sleepAvg, hrvMs: hrvAvg, restingHr: 52 }));
  }

  it("produces concise user-facing copy without model meta language", () => {
    const dailyRows = rowsForSleepAndHrv(6.8, 48);
    const rowsByDate = new Map(dailyRows.map((r) => [r.date, r]));
    const warnings = detectRecoveryWarnings(rowsByDate, baselineHrv, baselineSleep, 52);

    const insight = buildRecoveryInsightText({
      dailyRows,
      warnings,
      baselineSleep,
      baselineHrv,
      loadSnapshot: { todayLoad: 14, acuteChronicDelta: 0.18 },
      now: new Date("2026-04-20T12:00:00"),
      dataMode: "high",
      recoveryConfidence: null,
      semanticUncertaintyState: "lowUncertainty",
      aiReasoningMode: "deterministic",
      hasRecoverySeries: true,
    });

    expect(insight.text).not.toMatch(/latent|Reasoning-Modus|probabilistisch|Konfidenz|subjektiv/i);
    expect(insight.text.split(".").filter((s) => s.trim()).length).toBeLessThanOrEqual(3);
    expect(insight.text).toContain("Schlaf");
    expect(insight.text).toContain("HRV");
    expect(insight.text).toContain("Trainingslast");
    expect(insight.showWarning).toBe(true);
  });

  it("example: tired week with load (after rewrite)", () => {
    const dailyRows = rowsForSleepAndHrv(6.7, 47);
    const rowsByDate = new Map(dailyRows.map((r) => [r.date, r]));
    const warnings = detectRecoveryWarnings(rowsByDate, baselineHrv, baselineSleep, 52);

    const insight = buildRecoveryInsightText({
      dailyRows,
      warnings,
      baselineSleep,
      baselineHrv,
      loadSnapshot: { todayLoad: 12, acuteChronicDelta: 0.2 },
      now: new Date("2026-04-20T12:00:00"),
      dataMode: "high",
      recoveryConfidence: null,
      semanticUncertaintyState: "lowUncertainty",
      aiReasoningMode: "deterministic",
      hasRecoverySeries: true,
    });

    // After: ~3 short signal-based sentences (no latent R / reasoning mode)
    expect(insight.text).toBe(
      "Schlaf der letzten sieben Tage liegt unter deinem üblichen Niveau. HRV liegt unter deiner üblichen Bandbreite. Trainingslast ist erhöht — diese Woche mehr als die Vorwoche und heute bereits spürbar.",
    );
  });
});
