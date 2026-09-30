import { Capacitor } from "@capacitor/core";

/**
 * Nativ-Wrapper um @capacitor/haptics. Muster wie calendarImportService: Plugin wird lazy importiert,
 * auf Web ist jede Funktion ein No-op (kein navigator.vibrate-Fallback), und ein Fehler bricht nie
 * die UI ab — Haptik ist reine Zugabe.
 */

function hapticsAvailable(): boolean {
  return Capacitor.isNativePlatform();
}

/** Kurzer, leichter Tick — z. B. beim Slide-Wechsel. */
export async function hapticImpactLight(): Promise<void> {
  if (!hapticsAvailable()) return;
  try {
    const { Haptics, ImpactStyle } = await import("@capacitor/haptics");
    await Haptics.impact({ style: ImpactStyle.Light });
  } catch {
    // Haptik ist optional.
  }
}

/** Erfolgs-Muster — z. B. auf der Renn-Slide. */
export async function hapticSuccess(): Promise<void> {
  if (!hapticsAvailable()) return;
  try {
    const { Haptics, NotificationType } = await import("@capacitor/haptics");
    await Haptics.notification({ type: NotificationType.Success });
  } catch {
    // Haptik ist optional.
  }
}
