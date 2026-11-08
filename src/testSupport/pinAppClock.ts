import { freezeTimeForTests } from "../core/time/timeSystem";

/**
 * Pinnt die App-Uhr für die ganze Testdatei. Fixtures mit reinen Labels ("10. Aug", ohne `dateIso`)
 * sind nur zusammen mit einem Jahr eindeutig — der Fallback für das Jahr kommt aus der App-Uhr. Ohne
 * Pin würden solche Tests ab dem 01.01.2027 rot, weil das Label dann im Folgejahr gelesen wird.
 */
export function pinAppClock(iso: string): void {
  beforeAll(() => freezeTimeForTests(new Date(iso)));
  afterAll(() => freezeTimeForTests(null));
}
