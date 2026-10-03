import { createContext, useContext, useEffect, useState } from "react";
import {
  loadNotificationSettings,
  saveNotificationSettings,
  cancelLegacyDailyReminder,
  cancelTrainingReminder,
  requestNotificationPermission,
  type NotificationSettings,
} from "../services/notificationService";

interface NotificationContextType {
  settings: NotificationSettings;
  updateSettings: (s: Partial<NotificationSettings>) => Promise<void>;
}

const NotificationContext = createContext<NotificationContextType>({
  settings: { enabled: false, hour: 8, minute: 0 },
  updateSettings: async () => {},
});

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<NotificationSettings>(loadNotificationSettings);

  /**
   * Geplant wird nicht hier: der Provider kennt den Plan nicht. `useTrainingReminderSync` (AppMain)
   * plant aus Einstellungen + aktivem Plan neu, sobald sich `settings` ändert.
   */
  const updateSettings = async (partial: Partial<NotificationSettings>) => {
    const next = { ...settings, ...partial };
    saveNotificationSettings(next);
    if (!next.enabled) {
      setSettings(next);
      await cancelTrainingReminder();
      return;
    }
    // Erst die Berechtigung klären, dann den Zustand setzen — sonst plant der Sync ins Leere.
    if (!settings.enabled) await requestNotificationPermission();
    setSettings(next);
  };

  useEffect(() => {
    // Altbestand: die täglich wiederholende id 1001 kennt keinen Plan und muss weg, auch wenn AppMain
    // (und damit die Neuplanung) gar nicht geladen wird, z. B. ausgeloggt.
    void cancelLegacyDailyReminder();
  }, []);

  return (
    <NotificationContext.Provider value={{ settings, updateSettings }}>
      {children}
    </NotificationContext.Provider>
  );
}

export const useNotifications = () => useContext(NotificationContext);
