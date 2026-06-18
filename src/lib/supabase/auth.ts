import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { supabase } from "./client";

/** Redirect for signup confirmation and password-reset emails (Capacitor deep link). */
export const AUTH_EMAIL_REDIRECT_TO = "myrace://auth/confirm";

export function signUp(email: string, password: string) {
  return supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: AUTH_EMAIL_REDIRECT_TO,
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
    redirectTo: AUTH_EMAIL_REDIRECT_TO,
  });
}

export function resendSignupConfirmation(email: string) {
  return supabase.auth.resend({
    type: "signup",
    email,
    options: { emailRedirectTo: AUTH_EMAIL_REDIRECT_TO },
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
