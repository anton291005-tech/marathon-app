import { createContext, useContext, useState } from "react";
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
