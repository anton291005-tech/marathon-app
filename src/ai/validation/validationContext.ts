export type ValidationContext = {
  planGoal: "marathon" | "base" | "peak";
  currentWeekLoad: number;
  weeklyAvgLoad: number;
  recoverySummary: {
    avgRecovery: number; // 0..100
    avgConfidence: number; // 0..1
    influenceWeight: number; // 0.3..1.0 (never 0)
    adjustedRecoveryInfluence: number; // avgRecovery * influenceWeight
    recoveryStatus: "fresh" | "normal" | "fatigued";
  };
  phase: "base" | "build" | "peak" | "taper";
};

