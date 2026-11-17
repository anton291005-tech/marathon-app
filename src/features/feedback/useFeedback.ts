import { useCallback, useState } from "react";
import { getAppNowEpochMs } from "../../core/time/timeSystem";
import { safeReadLocalStorageItem, safeWriteLocalStorageItem } from "../../persistence/safeLocalStorage";
import { FEEDBACK_ENTRY_DISMISSED_KEY, isFeedbackEntryVisible, type FeedbackScreen } from "./feedbackModel";

/** Zustand für „Feedback geben" (Sheet) und den Eintrag auf „Heute" — hält AppMain schmal. */
export function useFeedback(userCreatedAt: string | null | undefined) {
  const [sheetScreen, setSheetScreen] = useState<FeedbackScreen | null>(null);
  const [dismissed, setDismissed] = useState(() => safeReadLocalStorageItem(FEEDBACK_ENTRY_DISMISSED_KEY) === "1");

  const open = useCallback((screen: FeedbackScreen) => setSheetScreen(screen), []);
  const close = useCallback(() => setSheetScreen(null), []);
  const dismissEntry = useCallback(() => {
    safeWriteLocalStorageItem(FEEDBACK_ENTRY_DISMISSED_KEY, "1");
    setDismissed(true);
  }, []);

  const entryVisible = isFeedbackEntryVisible({ createdAt: userCreatedAt, nowMs: getAppNowEpochMs(), dismissed });

  return { sheetScreen, open, close, entryVisible, dismissEntry };
}
