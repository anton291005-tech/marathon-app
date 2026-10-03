import { App as CapacitorApp } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { useEffect, useMemo, useRef } from "react";
import { beginAppFrame, getAppNow } from "../../core/time/timeSystem";
import type { PlanWeek, SessionLog } from "../../marathonPrediction";
import {
  cancelTrainingReminder,
  syncTrainingReminders,
  type NotificationSettings,
} from "../../services/notificationService";
import { collectOpenSessionDays, planTrainingReminders } from "../../services/trainingReminderSchedule";

/**
 * Hält die ausstehenden Trainings-Erinnerungen deckungsgleich mit dem AKTIVEN Plan: Einzel-Notifications
 * nur für Tage mit offener Session, rollendes Fenster.
 *
 * Neu geplant wird bei App-Start, jeder Rückkehr in den Vordergrund (das Fenster rollt nur so weiter),
 * Tageswechsel und sobald sich Erinnerungstage oder Einstellungen ändern — also auch bei Plan-Ende,
 * Planwechsel, Archivierung („Neue Vorbereitung"), Plan löschen, Abhaken und Schalter aus. Verschwindet
 * die App-Shell (Logout), wird storniert.
 */
export function useTrainingReminderSync(args: {
  settings: NotificationSettings;
  /** Anzeige-Plan des aktiven Plans — nie ein archivierter. */
  plan: readonly PlanWeek[];
  logs: Readonly<Record<string, SessionLog>>;
  /** `getPrepCompletionState(...).status === "completed"` — dieselbe Definition wie der Abschluss-Hero. */
  prepCompleted: boolean;
  todayYmd: string;
}): void {
  const { settings, plan, logs, prepCompleted, todayYmd } = args;
  const sessionDays = useMemo(
    () => collectOpenSessionDays({ plan, logs, prepCompleted }),
    [plan, logs, prepCompleted],
  );
  const sessionDaysKey = sessionDays.join(",");

  const latest = useRef({ settings, sessionDays });
  latest.current = { settings, sessionDays };

  const sync = useRef(() => {
    const current = latest.current;
    return syncTrainingReminders(
      current.settings,
      planTrainingReminders({
        sessionDays: current.sessionDays,
        time: { hour: current.settings.hour, minute: current.settings.minute },
        now: getAppNow(),
      }),
    );
  }).current;

  useEffect(() => {
    void sync();
  }, [sync, sessionDaysKey, settings.enabled, settings.hour, settings.minute, todayYmd]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const listenerPromise = CapacitorApp.addListener("appStateChange", ({ isActive }) => {
      if (!isActive) return;
      // Ein Resume kommt ohne Render — ohne frische App-Uhr würde das Fenster ab dem alten „heute" geplant.
      beginAppFrame();
      void sync();
    });
    return () => {
      void listenerPromise
        .then((l) => l.remove())
        .catch((e) => console.warn("[trainingReminder] listener cleanup failed", e));
      void cancelTrainingReminder();
    };
  }, [sync]);
}
