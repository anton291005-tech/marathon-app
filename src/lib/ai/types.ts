export type AiMode = "coach" | "navigator" | "support";

export type AiActionType =
  | "adjust_plan_for_illness"
  | "replace_bike_with_run"
  | "shift_race_date"
  | "shift_plan_start_date"
  | "navigate_to_screen"
  | "explain_feature";

export type SessionType =
  | "rest"
  | "easy"
  | "interval"
  | "tempo"
  | "long"
  | "strength"
  | "bike"
  | "race";

export type AiPlanSession = {
  id: string;
  day: string;
  date: string;
  type: SessionType;
  title: string;
  km: number;
  desc?: string | null;
  pace?: string | null;
};

export type AiPlanWeek = {
  wn: number;
  phase: string;
  label: string;
  dates: string;
  km: number;
  focus?: string;
  s: AiPlanSession[];
};

export type AiActionPreview = {
  title: string;
  items: string[];
  confirmLabel?: string;
  cancelLabel?: string;
  secondaryLabel?: string;
  openLabel?: string;
};

export type AiAssistantAction = {
  type: AiActionType;
  payload: Record<string, any>;
  preview?: AiActionPreview;
};

export type ShiftPlanStartDatePayload = {
  requestedStartOffsetDays?: number;
  requestedStartDateLabel?: string;
  reason?: string;
};

export type AiAssistantResponse = {
  mode: AiMode;
  message: string;
  action?: AiAssistantAction;
};

export type AiContext = {
  todayIso: string;
  raceDateIso: string | null;
  goals: {
    targetTime?: string;
  };
  plan: AiPlanWeek[];
  logs: Record<string, any>;
  next14Days: AiPlanSession[];
  availableScreens: Array<{
    key: string;
    label: string;
    sections?: string[];
  }>;
  settings?: Record<string, any>;
};

export type PlanPatch = {
  sessionId: string;
  changes: Partial<AiPlanSession>;
  reason?: string;
};

export type AiActionExecution = {
  mode: AiMode;
  message: string;
  planPatches?: PlanPatch[];
  navigation?: {
    targetScreen: string;
    section?: string;
  };
};
