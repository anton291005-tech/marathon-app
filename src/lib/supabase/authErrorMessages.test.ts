import { authErrorMessageDe } from "./authErrorMessages";
import { AUTH_EMAIL_REDIRECT_TO, getAuthEmailRedirectTo } from "./auth";

describe("authErrorMessageDe", () => {
  it("übersetzt die häufigen Supabase-Fehler", () => {
    expect(authErrorMessageDe({ message: "Invalid login credentials" })).toBe("E-Mail oder Passwort stimmt nicht.");
    expect(authErrorMessageDe({ message: "User already registered" })).toMatch(/schon ein Konto/);
    expect(authErrorMessageDe({ message: "Password should be at least 6 characters." })).toMatch(/Passwort ist zu kurz/);
    expect(authErrorMessageDe({ message: "x", code: "over_email_send_rate_limit" })).toMatch(/Zu viele Versuche/);
    expect(authErrorMessageDe({ message: "Unable to validate email address: invalid format" })).toMatch(/nicht gültig/);
  });

  it("zeigt nie den englischen Rohtext", () => {
    const text = authErrorMessageDe({ message: "Some unexpected internal error happened" });
    expect(text).not.toMatch(/unexpected/);
    expect(text).toMatch(/versuch es noch einmal/);
    expect(authErrorMessageDe(null)).toMatch(/versuch es noch einmal/);
  });
});

describe("getAuthEmailRedirectTo", () => {
  it("nutzt in der App den Deep Link", () => {
    expect(getAuthEmailRedirectTo(true, { protocol: "capacitor:", origin: "capacitor://localhost" })).toBe(AUTH_EMAIL_REDIRECT_TO);
  });

  it("nutzt im Browser die eigene Adresse, damit die Bestätigung dort ankommt", () => {
    expect(
      getAuthEmailRedirectTo(false, { protocol: "https:", origin: "https://marathon-app-alpha.vercel.app" }),
    ).toBe("https://marathon-app-alpha.vercel.app/");
  });

  it("fällt ohne http(s) auf den Deep Link zurück", () => {
    expect(getAuthEmailRedirectTo(false, { protocol: "capacitor:", origin: "capacitor://localhost" })).toBe(AUTH_EMAIL_REDIRECT_TO);
    expect(getAuthEmailRedirectTo(false, { protocol: "file:", origin: "null" })).toBe(AUTH_EMAIL_REDIRECT_TO);
  });
});
