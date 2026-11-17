/**
 * Wem gehören die lokalen Daten auf diesem Gerät? Abmelden über die Einstellungen löscht sie, eine
 * abgelaufene Sitzung (Token weg, Abmelden auf einem anderen Gerät) aber nicht — meldete sich danach ein
 * anderes Konto an, las die App Plan, Logs und Preferences des ersten Kontos aus dem localStorage.
 *
 * Deshalb merkt sich das Gerät die Nutzer-ID, der die Daten gehören. Meldet sich ein anderes Konto an,
 * wird vor dem ersten Lesen alles gelöscht. Ohne gespeicherten Besitzer (Bestandsgeräte vor diesem Fix)
 * wird nur der Besitzer eingetragen — dort liegen die Daten des bisher einzigen Kontos.
 */

import { safeReadLocalStorageItem, safeWriteLocalStorageItem } from "./safeLocalStorage";

export const STORAGE_OWNER_USER_ID_KEY = "marathonStorageOwnerUserId";

export function readStorageOwnerUserId(): string | null {
  const v = safeReadLocalStorageItem(STORAGE_OWNER_USER_ID_KEY);
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/**
 * Vor dem ersten Lesen der lokalen Daten aufrufen. `true`, wenn die Daten eines anderen Kontos gelöscht wurden.
 */
export function claimLocalStorageForUser(userId: string, clearLocalData: () => void): boolean {
  const id = typeof userId === "string" ? userId.trim() : "";
  if (!id) return false;
  const owner = readStorageOwnerUserId();
  let cleared = false;
  if (owner != null && owner !== id) {
    clearLocalData();
    cleared = true;
  }
  safeWriteLocalStorageItem(STORAGE_OWNER_USER_ID_KEY, id);
  return cleared;
}
