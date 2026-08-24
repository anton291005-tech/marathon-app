import type {
  RecurringScheduleBlock,
  ScheduleBlockCategory,
} from "../lib/supabase/services/weeklyScheduleBlocksService";
import { getAppTodayYmd } from "../core/time/timeSystem";
import { generateScheduleBlockId } from "./generateScheduleBlockId";

/**
 * Onboarding-Presets: Fallback für Nutzer ohne Kalenderzugriff (Skip, Verweigerung,
 * leerer Kalender, Web). Schreiben Recurring-Zeilen mit source='preset' in dieselbe
 * `weekly_schedule_blocks`-Tabelle, die auch der EventKit-Import befüllt.
 */
export type SchedulePresetId = "fulltime" | "parttime" | "study" | "shift";

type PresetBlockSpec = {
  title: string;
  category: ScheduleBlockCategory;
  /** 0=Sonntag..6=Samstag (DB-Konvention aus Migration 009). */
  daysOfWeek: number[];
  startTime: string;
  endTime: string;
  notes: string | null;
};

export type SchedulePreset = {
  id: SchedulePresetId;
  label: string;
  description: string;
  blocks: PresetBlockSpec[];
};

const MO_BIS_FR = [1, 2, 3, 4, 5];

export const SCHEDULE_PRESETS: ReadonlyArray<SchedulePreset> = [
  {
    id: "fulltime",
    label: "Vollzeit-Job",
    description: "Mo–Fr, 9–17 Uhr",
    blocks: [{ title: "Arbeit", category: "job", daysOfWeek: MO_BIS_FR, startTime: "09:00", endTime: "17:00", notes: null }],
  },
  {
    id: "parttime",
    label: "Teilzeit",
    description: "Mo–Mi, 9–14 Uhr",
    blocks: [{ title: "Arbeit (Teilzeit)", category: "job", daysOfWeek: [1, 2, 3], startTime: "09:00", endTime: "14:00", notes: null }],
  },
  {
    id: "study",
    label: "Studium",
    description: "Mo–Fr, 10–16 Uhr",
    blocks: [{ title: "Uni", category: "study", daysOfWeek: MO_BIS_FR, startTime: "10:00", endTime: "16:00", notes: null }],
  },
  {
    id: "shift",
    label: "Schichtarbeit",
    description: "wechselnde Zeiten, Näherung Mo–Fr 6–14 Uhr",
    blocks: [
      {
        title: "Schicht",
        category: "job",
        daysOfWeek: MO_BIS_FR,
        startTime: "06:00",
        endTime: "14:00",
        notes: "Schichtarbeit – Zeiten variieren",
      },
    ],
  },
];

export function presetToScheduleBlocks(presetId: SchedulePresetId): RecurringScheduleBlock[] {
  const preset = SCHEDULE_PRESETS.find((p) => p.id === presetId);
  if (!preset) return [];

  const todayYmd = getAppTodayYmd();
  const out: RecurringScheduleBlock[] = [];

  for (const spec of preset.blocks) {
    for (const dayOfWeek of spec.daysOfWeek) {
      out.push({
        id: generateScheduleBlockId(),
        title: spec.title,
        category: spec.category,
        startTime: spec.startTime,
        endTime: spec.endTime,
        notes: spec.notes,
        source: "preset",
        isRecurring: true,
        dayOfWeek,
        recurrenceStartDate: todayYmd,
        recurrenceEndDate: null,
      });
    }
  }

  return out;
}
