import { Capacitor } from "@capacitor/core";
import type { RawCalendarOccurrence } from "./eventToScheduleBlocks";

/**
 * Nativ-Wrapper um @ebarooni/capacitor-calendar (EventKit).
 * Muster wie src/appleHealth/appleHealthService.ts: Plugin wird an jeder Call-Site lazy
 * importiert, damit Web-Builds das native Modul nie laden; jede Funktion early-returnt
 * auf Nicht-iOS-Plattformen. Kein React-State, keine UI — nur Permission/Query → Domain-Shape.
 *
 * Berechtigung: Lesen von Events braucht seit iOS 17 zwingend Full Access
 * (requestFullAccessToEvents; Plugin kapselt die Legacy-API für iOS 15/16).
 * Die App schreibt nie in den Kalender.
 */

export type CalendarPermissionStatus = "granted" | "denied" | "prompt" | "unavailable";

export function calendarIsAvailable(): boolean {
  return Capacitor.getPlatform() === "ios";
}

export async function calendarCheckReadPermission(): Promise<CalendarPermissionStatus> {
  if (!calendarIsAvailable()) return "unavailable";
  try {
    const { CapacitorCalendar, CalendarPermissionScope } = await import("@ebarooni/capacitor-calendar");
    const { result } = await CapacitorCalendar.checkPermission({
      scope: CalendarPermissionScope.READ_CALENDAR,
    });
    if (result === "granted") return "granted";
    if (result === "denied") return "denied";
    return "prompt";
  } catch (error) {
    warnDev("calendarCheckReadPermission", error);
    return "unavailable";
  }
}

/** Öffnet den System-Permission-Dialog (bzw. liefert den bereits erteilten Status). */
export async function calendarRequestReadAuthorization(): Promise<boolean> {
  if (!calendarIsAvailable()) return false;
  try {
    const { CapacitorCalendar } = await import("@ebarooni/capacitor-calendar");
    const { result } = await CapacitorCalendar.requestFullCalendarAccess();
    return result === "granted";
  } catch (error) {
    warnDev("calendarRequestReadAuthorization", error);
    return false;
  }
}

/**
 * Liefert alle Event-Vorkommen im Fenster als plattformneutrale RawCalendarOccurrence-Liste
 * (EventKit expandiert Recurrences bei Range-Queries selbst). `null` = Abfrage fehlgeschlagen —
 * der Aufrufer darf dann NICHT replace-all-syncen (sonst würde ein Fehler den Kalender leeren).
 */
export async function fetchCalendarOccurrences(fromMs: number, toMs: number): Promise<RawCalendarOccurrence[] | null> {
  if (!calendarIsAvailable()) return null;
  try {
    const { CapacitorCalendar, CalendarType } = await import("@ebarooni/capacitor-calendar");

    const { result: calendars } = await CapacitorCalendar.listCalendars();
    const calendarsById = new Map(calendars.map((c) => [c.id, c]));

    const { result: events } = await CapacitorCalendar.listEventsInRange({ from: fromMs, to: toMs });

    return events.map((event) => {
      const calendar = event.calendarId != null ? calendarsById.get(event.calendarId) : undefined;
      let calendarType = "unknown";
      if (calendar?.type === CalendarType.BIRTHDAY) calendarType = "birthday";
      else if (calendar?.type === CalendarType.SUBSCRIPTION || calendar?.isSubscribed === true) calendarType = "subscription";
      else if (calendar?.type === CalendarType.LOCAL) calendarType = "local";
      else if (calendar?.type === CalendarType.CAL_DAV) calendarType = "calDAV";
      else if (calendar?.type === CalendarType.EXCHANGE) calendarType = "exchange";

      return {
        title: event.title ?? "",
        calendarTitle: calendar?.title ?? "",
        calendarType,
        startMs: event.startDate,
        endMs: event.endDate,
        isAllDay: event.isAllDay === true,
        status: typeof event.status === "string" ? event.status : "",
      };
    });
  } catch (error) {
    warnDev("fetchCalendarOccurrences", error);
    return null;
  }
}

function warnDev(context: string, error: unknown): void {
  if (process.env.NODE_ENV === "development") {
    // eslint-disable-next-line no-console
    console.warn(`[calendarImportService] ${context}`, error);
  }
}
