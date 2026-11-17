/** Schicht-Modus: alles, was AppMain braucht, über einen Import (schmale Verdrahtung, Arbeitsplan §1). */
export { ShiftPlanPage } from "./ShiftPlanPage";
export type { ShiftSaveOutcome } from "./ShiftPlanPage";
export { ShiftIntroCard, ShiftSettingsRows, ShiftTodayNote, ShiftWizardQuestion } from "./ShiftCards";
export { useShiftMode } from "../../shift/useShiftMode";
export {
  currentAcceptedShiftKeys,
  findWeekIndexForYmd,
  planAfterShiftSave,
  rememberAcceptedShiftPatches,
  reportShiftProposalDecision,
  runShiftWeekScan,
  shiftTodayHasProposal,
} from "../../shift/shiftWeekScan";
export { isShiftChoiceAllowed, proposeShiftSingle } from "../../shift/proposeShiftSingle";
export { isShiftModeEnabled } from "../../shift/shiftModeFlag";
