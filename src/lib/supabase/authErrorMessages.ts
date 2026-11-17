/**
 * Supabase liefert Fehlertexte auf Englisch („Invalid login credentials", „User already registered").
 * Die Anmeldung zeigte sie bisher roh an — für neue Nutzer der erste Eindruck der App.
 * Bekannte Fälle bekommen einen deutschen Satz, alles andere einen ruhigen allgemeinen.
 */

type AuthErrorLike = { message?: string | null; code?: string | null; status?: number | null } | string | null | undefined;

const GENERIC = "Das hat nicht geklappt. Prüf deine Verbindung und versuch es noch einmal.";

const RULES: Array<{ test: RegExp; codes?: string[]; text: string }> = [
  {
    test: /invalid login credentials|invalid_credentials/i,
    codes: ["invalid_credentials"],
    text: "E-Mail oder Passwort stimmt nicht.",
  },
  {
    test: /user already registered|already been registered|user_already_exists/i,
    codes: ["user_already_exists", "email_exists"],
    text: "Für diese E-Mail gibt es schon ein Konto. Melde dich an oder setz dein Passwort zurück.",
  },
  {
    test: /email not confirmed/i,
    codes: ["email_not_confirmed"],
    text: "Bitte bestätige zuerst deine E-Mail-Adresse.",
  },
  {
    test: /password should be at least|weak.?password|password is too weak/i,
    codes: ["weak_password"],
    text: "Das Passwort ist zu kurz oder zu einfach. Nimm mindestens 8 Zeichen.",
  },
  {
    test: /should be different from the old password|same_password/i,
    codes: ["same_password"],
    text: "Das neue Passwort muss sich vom alten unterscheiden.",
  },
  {
    test: /unable to validate email address|invalid format|email address .* is invalid|email_address_invalid/i,
    codes: ["email_address_invalid", "validation_failed"],
    text: "Diese E-Mail-Adresse sieht nicht gültig aus.",
  },
  {
    test: /rate limit|too many requests|for security purposes, you can only request this/i,
    codes: ["over_email_send_rate_limit", "over_request_rate_limit"],
    text: "Zu viele Versuche in kurzer Zeit. Warte eine Minute und versuch es dann noch einmal.",
  },
  {
    test: /signups not allowed|signup is disabled/i,
    codes: ["signup_disabled"],
    text: "Neue Konten sind gerade nicht möglich.",
  },
  {
    test: /failed to fetch|network|load failed/i,
    text: "Keine Verbindung zum Server. Prüf deine Internetverbindung.",
  },
];

export function authErrorMessageDe(error: AuthErrorLike): string {
  if (error == null) return GENERIC;
  const message = typeof error === "string" ? error : String(error.message ?? "");
  const code = typeof error === "string" ? "" : String(error.code ?? "");
  for (const rule of RULES) {
    if ((code && rule.codes?.includes(code)) || rule.test.test(message)) return rule.text;
  }
  return GENERIC;
}
