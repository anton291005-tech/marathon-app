import { createContext, useContext, useEffect, useState } from "react";
import {
  loadNotificationSettings,
  saveNotificationSettings,
  scheduleTrainingReminder,
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
    if (next.enabled) {
      await scheduleTrainingReminder(next);
    } else {
      await cancelTrainingReminder();
    }
  };

  useEffect(() => {
    if (settings.enabled) {
      void scheduleTrainingReminder(settings);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <NotificationContext.Provider value={{ settings, updateSettings }}>
      {children}
    </NotificationContext.Provider>
  );
}

export const useNotifications = () => useContext(NotificationContext);
