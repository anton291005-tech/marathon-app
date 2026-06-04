export * from "./types";
export { analyzeWorkout } from "./analyzeWorkout";
export { analyzeIntensity } from "./analyzeIntensity";
export { analyzeTrend } from "./analyzeTrend";
export { buildCoachFeedback } from "./buildCoachFeedback";
export {
  detectIntervalWorkout,
  extractIntervalSegments,
  parseIntervalPlanInfo,
  scoreIntervalWorkout,
} from "./intervalSegmentExtractor";
export type { WorkoutLap, GpsPacePoint, IntervalPlanInfo, ExtractionResult, SplitEntry } from "./intervalSegmentExtractor";

