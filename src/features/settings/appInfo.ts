import packageJson from "../../../package.json";

/**
 * PLATZHALTER — vor TestFlight durch die echte Support-Adresse ersetzen. Bewusst eine nicht
 * zustellbare Domain: Feedback- und Datenexport-Mails enthalten die Konto-E-Mail.
 */
export const SUPPORT_EMAIL = "support@example.invalid";

export const APP_VERSION: string = packageJson.version;

export const PRIVACY_POLICY_URL = "https://marathon-app-alpha.vercel.app/privacy-policy";

/** `mailto:`-Link mit kodiertem Betreff und Text (Zeilenumbrüche als CRLF, wie Mail-Programme sie erwarten). */
export function buildMailtoUrl(args: { to: string; subject: string; body?: string }): string {
  const params = [`subject=${encodeURIComponent(args.subject)}`];
  if (args.body) params.push(`body=${encodeURIComponent(args.body.replace(/\r?\n/g, "\r\n"))}`);
  return `mailto:${args.to}?${params.join("&")}`;
}

/** iOS-Version aus dem User-Agent des WebViews („… CPU iPhone OS 17_5_1 like Mac OS X …" → „17.5.1"). */
export function parseIosVersion(userAgent: string | null | undefined): string | null {
  const m = /\bOS (\d+(?:_\d+){0,2}) like Mac OS X/.exec(userAgent ?? "");
  return m ? m[1].replace(/_/g, ".") : null;
}

/** Technische Angaben am Ende einer Support-Mail. */
export function buildDeviceInfo(args: { appVersion: string; userAgent: string | null | undefined }): string {
  const ios = parseIosVersion(args.userAgent);
  return [`App-Version: ${args.appVersion}`, ios ? `iOS-Version: ${ios}` : "Plattform: Web"].join("\n");
}

export function buildFeedbackMailto(args: { appVersion: string; userAgent: string | null | undefined }): string {
  return buildMailtoUrl({
    to: SUPPORT_EMAIL,
    subject: "MyRace Feedback",
    body: `\n\n—\n${buildDeviceInfo(args)}`,
  });
}

export function buildBugReportMailto(args: { appVersion: string; userAgent: string | null | undefined }): string {
  return buildMailtoUrl({
    to: SUPPORT_EMAIL,
    subject: "MyRace Fehler",
    body: `Was ist passiert?\n\n\nWas hast du erwartet?\n\n\n—\n${buildDeviceInfo(args)}`,
  });
}

export function buildDataExportMailto(args: { accountEmail: string | null | undefined }): string {
  const email = typeof args.accountEmail === "string" ? args.accountEmail.trim() : "";
  return buildMailtoUrl({
    to: SUPPORT_EMAIL,
    subject: "Datenexport (DSGVO)",
    body: `Bitte sendet mir eine Kopie meiner bei MyRace gespeicherten Daten.\n\nKonto-E-Mail: ${email || "(bitte eintragen)"}`,
  });
}
