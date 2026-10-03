/**
 * Ein gespeicherter Prep-Rückblick (Zeile in `prep_recaps`) und die reine Entscheidungslogik,
 * was beim Öffnen damit zu tun ist.
 *
 * Regeln (mit Anton abgestimmt):
 * - Existiert noch kein Snapshot: einmal bauen und speichern; eine erkannte Health-Zeit wird dabei
 *   als UNBESTÄTIGTER Vorschlag übernommen.
 * - Älteres `schemaVersion`: Stats neu bauen und überschreiben — Zeitfelder bleiben unangetastet.
 * - Snapshot ohne Zeit, Health findet später eine: als unbestätigter Vorschlag nachtragen.
 *   Eine vorhandene Zeit (bestätigt oder nicht) wird nie überschrieben.
 */

import type { DetectedRaceFinish } from "./detectRaceFinishTime";
import { PREP_RECAP_SCHEMA_VERSION, type PrepRecapStats } from "./buildPrepRecapSnapshot";

export type FinishTimeSource = "health" | "manual";

export type PrepRecapRecord = {
  id?: string;
  planId: string | null;
  raceName: string | null;
  /** YYYY-MM-DD — eindeutig pro Nutzer. */
  raceDate: string;
  finishTimeSeconds: number | null;
  finishTimeSource: FinishTimeSource | null;
  finishTimeConfirmed: boolean;
  schemaVersion: number;
  stats: PrepRecapStats;
  createdAt?: string;
  updatedAt?: string;
};

export type FinishTimePatch = {
  seconds: number;
  source: FinishTimeSource;
  confirmed: boolean;
};

export type PrepRecapAction =
  | { kind: "create"; record: PrepRecapRecord }
  | {
      kind: "update";
      /** Neu gebaute Stats (nur bei älterer schemaVersion). */
      stats: PrepRecapStats | null;
      /** Unbestätigter Health-Vorschlag (nur wenn bisher keine Zeit gespeichert ist). */
      finish: FinishTimePatch | null;
    }
  | { kind: "none" };

export function decidePrepRecapAction(args: {
  existing: PrepRecapRecord | null;
  buildStats: () => PrepRecapStats;
  detectedFinish: DetectedRaceFinish | null;
  planId: string | null;
  raceName: string | null;
  raceDate: string;
  currentSchemaVersion?: number;
}): PrepRecapAction {
  const version = args.currentSchemaVersion ?? PREP_RECAP_SCHEMA_VERSION;
  const { existing, detectedFinish } = args;

  if (!existing) {
    return {
      kind: "create",
      record: {
        planId: args.planId,
        raceName: args.raceName,
        raceDate: args.raceDate,
        finishTimeSeconds: detectedFinish?.seconds ?? null,
        finishTimeSource: detectedFinish ? "health" : null,
        finishTimeConfirmed: false,
        schemaVersion: version,
        stats: args.buildStats(),
      },
    };
  }

  const stats = existing.schemaVersion < version ? args.buildStats() : null;
  const finish: FinishTimePatch | null =
    existing.finishTimeSeconds == null && detectedFinish
      ? { seconds: detectedFinish.seconds, source: "health", confirmed: false }
      : null;

  if (!stats && !finish) return { kind: "none" };
  return { kind: "update", stats, finish };
}

/** Wendet eine Update-Aktion lokal auf den Datensatz an (für Cache und Rückgabe). */
export function applyPrepRecapUpdate(
  existing: PrepRecapRecord,
  action: Extract<PrepRecapAction, { kind: "update" }>,
  currentSchemaVersion: number = PREP_RECAP_SCHEMA_VERSION,
): PrepRecapRecord {
  return {
    ...existing,
    ...(action.stats ? { stats: action.stats, schemaVersion: currentSchemaVersion } : {}),
    ...(action.finish
      ? {
          finishTimeSeconds: action.finish.seconds,
          finishTimeSource: action.finish.source,
          finishTimeConfirmed: action.finish.confirmed,
        }
      : {}),
  };
}

/**
 * Gehört der Rückblick zum aktiven Plan? Ein mit einem anderen (z. B. archivierten) Plan verknüpfter
 * Snapshot darf Home/Leistung des aktiven Plans nicht speisen. Ohne Verknüpfung oder ohne bekannten
 * aktiven Plan entscheidet allein das Renndatum.
 */
export function isPrepRecapOfPlan(record: PrepRecapRecord | null | undefined, planId: string | null): boolean {
  if (!record) return false;
  return record.planId == null || planId == null || record.planId === planId;
}

/**
 * Anzeige-Stand aus lokalem Cache und Remote (Home-Hero/Leistung vor dem Öffnen des Rückblicks):
 * Remote gewinnt — außer der Cache hält eine offline bestätigte Zeit und Remote nur einen
 * unbestätigten Stand (gleiche Vorrangregel wie beim Nachreichen in ensurePrepRecapSnapshot).
 */
export function pickPrepRecapForDisplay(
  cached: PrepRecapRecord | null,
  remote: PrepRecapRecord | null,
): PrepRecapRecord | null {
  if (!remote) return cached;
  if (!cached || cached.raceDate !== remote.raceDate) return remote;
  if (
    cached.finishTimeConfirmed &&
    cached.finishTimeSeconds != null &&
    cached.finishTimeSource != null &&
    !remote.finishTimeConfirmed
  ) {
    return {
      ...remote,
      finishTimeSeconds: cached.finishTimeSeconds,
      finishTimeSource: cached.finishTimeSource,
      finishTimeConfirmed: true,
    };
  }
  return remote;
}
