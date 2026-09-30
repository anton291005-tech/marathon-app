import { useMemo, useState } from "react";
import type { FinishTimePatch, PrepRecapRecord } from "../../prepRecap/prepRecapRecord";
import { buildRecapSlides } from "./buildRecapSlides";
import { finishTimeActionLabel } from "./finishTimeActionLabel";
import FinishTimeInputStep from "./FinishTimeInputStep";
import PrepRecapStory from "./PrepRecapStory";

export type PrepRecapEntry = "story" | "editTime";

type Props = {
  record: PrepRecapRecord;
  /** "story" = Rückblick ansehen; "editTime" = nur die Zeit (RaceResultCard). */
  entry: PrepRecapEntry;
  onSaveFinish: (patch: FinishTimePatch) => Promise<void>;
  onClose: () => void;
};

type Step =
  | { kind: "input"; after: "storyStart" | "storyOutro" | "close"; startInEdit: boolean; dismissLabel: "Überspringen" | "Abbrechen" }
  | { kind: "story"; initialIndex: number };

/** Ohne Rennen (Plan endete ohne Race-Session) gibt es keine Zielzeit. */
export function recordHasRace(record: PrepRecapRecord): boolean {
  return record.stats.race.completedBy !== "plan_ended";
}

function initialStep(record: PrepRecapRecord, entry: PrepRecapEntry): Step {
  if (entry === "editTime") {
    return { kind: "input", after: "close", startInEdit: record.finishTimeConfirmed, dismissLabel: "Abbrechen" };
  }
  if (recordHasRace(record) && !record.finishTimeConfirmed) {
    return { kind: "input", after: "storyStart", startInEdit: false, dismissLabel: "Überspringen" };
  }
  return { kind: "story", initialIndex: 0 };
}

/**
 * Ablauf „Rückblick ansehen": solange die Zielzeit unbestätigt ist, zuerst die Bestätigung
 * (überspringbar, Überspringen bestätigt nicht), dann die Story aus dem Snapshot.
 */
export default function PrepRecapExperience({ record, entry, onSaveFinish, onClose }: Props) {
  const [step, setStep] = useState<Step>(() => initialStep(record, entry));

  const slides = useMemo(
    () =>
      buildRecapSlides({
        stats: record.stats,
        raceName: record.raceName ?? record.stats.race.name,
        finishSeconds: record.finishTimeSeconds,
        finishConfirmed: record.finishTimeConfirmed,
      }),
    [record],
  );

  if (step.kind === "input") {
    const leave = () => {
      if (step.after === "close") onClose();
      // Outro = letzte Slide; der Player klemmt den Index (eine neu eingetragene Zeit kann eine Slide ergänzen).
      else setStep({ kind: "story", initialIndex: step.after === "storyOutro" ? Number.MAX_SAFE_INTEGER : 0 });
    };
    return (
      <FinishTimeInputStep
        raceName={record.raceName ?? record.stats.race.name}
        current={
          record.finishTimeSeconds != null
            ? {
                seconds: record.finishTimeSeconds,
                source: record.finishTimeSource,
                confirmed: record.finishTimeConfirmed,
              }
            : null
        }
        dismissLabel={step.dismissLabel}
        startInEdit={step.startInEdit}
        onSubmit={async (patch) => {
          await onSaveFinish(patch);
          leave();
        }}
        onDismiss={leave}
      />
    );
  }

  return (
    <PrepRecapStory
      slides={slides}
      initialIndex={step.initialIndex}
      onClose={onClose}
      outroAction={
        recordHasRace(record)
          ? {
              label: finishTimeActionLabel(record),
              onPress: () =>
                setStep({
                  kind: "input",
                  after: "storyOutro",
                  startInEdit: record.finishTimeConfirmed,
                  dismissLabel: "Abbrechen",
                }),
            }
          : null
      }
    />
  );
}
