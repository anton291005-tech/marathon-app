import { createContext, useContext, useEffect, useState } from "react";
import { LOCAL_DATA_CLEARED_EVENT } from "../persistence/clearMarathonLocalStorage";
import {
  loadNotificationSettings,
  saveNotificationSettings,
  cancelTrainingReminder,
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

  // Abmelden, Konto löschen, Kontowechsel: Die lokalen Kontodaten sind gelöscht — die Einstellung im Speicher
  // muss folgen, sonst plante die App für das nächste Konto Erinnerungen zur Uhrzeit des vorigen.
  useEffect(() => {
    const reload = () => setSettings(loadNotificationSettings());
    window.addEventListener(LOCAL_DATA_CLEARED_EVENT, reload);
    return () => window.removeEventListener(LOCAL_DATA_CLEARED_EVENT, reload);
  }, []);

  const updateSettings = async (partial: Partial<NotificationSettings>) => {
    const next = { ...settings, ...partial };
    setSettings(next);
    saveNotificationSettings(next);
    // Einschalten plant AppMain (kennt Plan und Einträge, `buildTrainingReminders`); Ausschalten wirkt sofort.
    if (!next.enabled) await cancelTrainingReminder();
  };

  return (
    <NotificationContext.Provider value={{ settings, updateSettings }}>
      {children}
    </NotificationContext.Provider>
  );
}

export const useNotifications = () => useContext(NotificationContext);
