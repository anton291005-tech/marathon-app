/**
 * Abläufe „Abmelden" und „Konto löschen" ohne React — die Reihenfolge ist hier festgelegt und getestet,
 * `AppMain.tsx` reicht nur die echten Funktionen herein.
 */

export const ACCOUNT_DELETE_FAILED_MESSAGE =
  "Konto konnte nicht gelöscht werden. Prüfe deine Verbindung und versuche es erneut.";

type SessionEndDeps = {
  /** Trainings-Erinnerung aus und alle ausstehenden lokalen Notifications abbestellen. */
  cancelReminders: () => Promise<void> | void;
  clearLocalData: () => void;
  signOut: () => Promise<unknown> | unknown;
};

/** Ein Fehler beim Abbestellen darf weder Abmelden noch Löschen aufhalten. */
async function cancelRemindersSafely(cancelReminders: SessionEndDeps["cancelReminders"]): Promise<void> {
  try {
    await cancelReminders();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[account] Erinnerungen konnten nicht abbestellt werden", err);
  }
}

/** Abmelden: Erinnerungen abbestellen → lokale Daten löschen → Sitzung beenden. */
export async function runSignOut(deps: SessionEndDeps): Promise<void> {
  await cancelRemindersSafely(deps.cancelReminders);
  deps.clearLocalData();
  await deps.signOut();
}

export type AccountDeletionResult = { ok: true } | { ok: false; message: string };

/**
 * Konto löschen: Schlägt das Löschen fehl, passiert sonst NICHTS — kein Abmelden, keine lokalen Daten
 * gelöscht, Erinnerungen bleiben; der Dialog zeigt die Meldung und bietet „Erneut versuchen".
 * Erst nach Erfolg: Erinnerungen abbestellen → lokale Daten löschen → Sitzung beenden.
 */
export async function runAccountDeletion(
  deps: SessionEndDeps & { deleteAccount: () => Promise<void> },
): Promise<AccountDeletionResult> {
  try {
    await deps.deleteAccount();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[account] Konto löschen fehlgeschlagen", err);
    return { ok: false, message: ACCOUNT_DELETE_FAILED_MESSAGE };
  }
  await cancelRemindersSafely(deps.cancelReminders);
  deps.clearLocalData();
  try {
    await deps.signOut();
  } catch (err) {
    // Das Konto existiert nicht mehr; ein Fehler beim Beenden der Sitzung ändert daran nichts.
    // eslint-disable-next-line no-console
    console.warn("[account] signOut nach dem Löschen fehlgeschlagen", err);
  }
  return { ok: true };
}
