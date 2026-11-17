/**
 * Fehlt eine Tabelle oder Spalte, weil die Migration noch nicht angewendet ist, soll der Client still zurückfallen
 * statt abzustürzen (Arbeitsplan Freundes-Test §1). Postgres: 42P01 (Tabelle), 42703 (Spalte);
 * PostgREST: PGRST205 (Tabelle nicht im Schema-Cache), PGRST204 (Spalte nicht im Schema-Cache).
 */
export const MISSING_SCHEMA_ERROR_CODES: readonly string[] = ["42P01", "42703", "PGRST205", "PGRST204"];

export function isMissingSchemaError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = (error as { code?: unknown }).code;
  if (typeof code === "string" && MISSING_SCHEMA_ERROR_CODES.indexOf(code) >= 0) return true;
  const message = (error as { message?: unknown }).message;
  // Ältere PostgREST-Versionen liefern nur die Meldung.
  return typeof message === "string" && /(relation|table|column) .* does not exist|could not find the .* (table|column)/i.test(message);
}
