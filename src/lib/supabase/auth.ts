import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { Capacitor } from "@capacitor/core";
import { supabase } from "./client";

/** Redirect for signup confirmation and password-reset emails (Capacitor deep link). */
export const AUTH_EMAIL_REDIRECT_TO = "myrace://auth/confirm";

/**
 * Ziel des Bestätigungs-/Reset-Links: in der iOS-App der Deep Link, im Browser die eigene Adresse —
 * `myrace://` öffnet im Browser nichts, die Bestätigung lief dort ins Leere. supabase-js liest die
 * Tokens aus dem Hash der Rückkehr-URL selbst (`detectSessionInUrl`).
 *
 * Voraussetzung: Die Web-Adresse steht in Supabase unter Authentication → URL Configuration → Redirect URLs.
 */
export function getAuthEmailRedirectTo(
  isNative: boolean = Capacitor.isNativePlatform(),
  location: { protocol: string; origin: string } | undefined = typeof window !== "undefined" ? window.location : undefined,
): string {
  if (isNative || !location) return AUTH_EMAIL_REDIRECT_TO;
  if (location.protocol !== "http:" && location.protocol !== "https:") return AUTH_EMAIL_REDIRECT_TO;
  return `${location.origin}/`;
}

export function signUp(email: string, password: string) {
  return supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: getAuthEmailRedirectTo(),
    },
  });
}

export function signIn(email: string, password: string) {
  return supabase.auth.signInWithPassword({ email, password });
}

export function signOut() {
  return supabase.auth.signOut();
}

export function resetPassword(email: string) {
  return supabase.auth.resetPasswordForEmail(email, {
    redirectTo: getAuthEmailRedirectTo(),
  });
}

export function resendSignupConfirmation(email: string) {
  return supabase.auth.resend({
    type: "signup",
    email,
    options: { emailRedirectTo: getAuthEmailRedirectTo() },
  });
}

export function updatePassword(password: string) {
  return supabase.auth.updateUser({ password });
}

export function getCurrentUser() {
  return supabase.auth.getUser();
}

export function onAuthStateChange(callback: (event: AuthChangeEvent, session: Session | null) => void) {
  return supabase.auth.onAuthStateChange(callback);
}
