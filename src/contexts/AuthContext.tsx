import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { AuthChangeEvent, Session, User } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase/client";
import {
  signIn as signInApi,
  signOut as signOutApi,
  signUp as signUpApi,
  resetPassword as resetPasswordApi,
  updatePassword as updatePasswordApi,
  resendSignupConfirmation as resendSignupConfirmationApi,
} from "../lib/supabase/auth";
import {
  clearPasswordRecoveryHash,
  isPasswordRecoveryFromUrl,
} from "../lib/supabase/passwordRecovery";

function isEmailUnconfirmed(user: User): boolean {
  return user.email_confirmed_at == null;
}

export type AuthContextValue = {
  user: User | null;
  loading: boolean;
  passwordRecoveryPending: boolean;
  unconfirmedEmail: string | null;
  clearUnconfirmedEmail: () => void;
  signIn: typeof signInApi;
  signUp: typeof signUpApi;
  signOut: typeof signOutApi;
  resetPassword: typeof resetPasswordApi;
  updatePassword: typeof updatePasswordApi;
  resendSignupConfirmation: typeof resendSignupConfirmationApi;
  completePasswordRecovery: () => void;
  beginPasswordRecovery: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [unconfirmedEmail, setUnconfirmedEmail] = useState<string | null>(null);
  const [passwordRecoveryPending, setPasswordRecoveryPending] = useState(() => isPasswordRecoveryFromUrl());
  const lastUserIdRef = useRef<string | null | undefined>(undefined);

  const clearUnconfirmedEmail = useCallback(() => {
    setUnconfirmedEmail(null);
  }, []);

  const completePasswordRecovery = useCallback(() => {
    setPasswordRecoveryPending(false);
    clearPasswordRecoveryHash();
  }, []);

  const beginPasswordRecovery = useCallback(() => {
    setPasswordRecoveryPending(true);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const applySessionUser = (session: Session | null, event?: AuthChangeEvent) => {
      const sessionUser = session?.user;
      if (!sessionUser) {
        lastUserIdRef.current = null;
        setUser(null);
        return;
      }

      if (isEmailUnconfirmed(sessionUser)) {
        if (event === "SIGNED_IN" || event == null) {
          // Race-condition guard: nach Deep-Link-setSession kann email_confirmed_at
          // noch nicht im JWT sein. 1.5s warten und via getUser() erneut prüfen.
          setTimeout(async () => {
            if (cancelled) return;
            const { data } = await supabase.auth.getUser();
            const freshUser = data?.user ?? null;
            if (freshUser && freshUser.email_confirmed_at) {
              setUnconfirmedEmail(null);
              lastUserIdRef.current = freshUser.id;
              setUser(freshUser);
              return;
            }
            setUnconfirmedEmail(sessionUser.email ?? null);
            lastUserIdRef.current = null;
            setUser(null);
            void supabase.auth.signOut();
          }, 1500);
        }
        return;
      }

      setUnconfirmedEmail(null);
      const nextId = sessionUser.id ?? null;
      if (nextId !== lastUserIdRef.current) {
        lastUserIdRef.current = nextId;
        setUser(sessionUser);
      }
    };

    void supabase.auth
      .getSession()
      .then(({ data: { session } }) => {
        if (cancelled) return;
        applySessionUser(session);
        if (isPasswordRecoveryFromUrl()) {
          setPasswordRecoveryPending(true);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;
      if (event === "PASSWORD_RECOVERY" || isPasswordRecoveryFromUrl()) {
        setPasswordRecoveryPending(true);
      }
      applySessionUser(session, event);
    });

    const handleNativeRecovery = () => {
      if (!cancelled) setPasswordRecoveryPending(true);
    };
    window.addEventListener('myrace:passwordRecovery', handleNativeRecovery);

    return () => {
      cancelled = true;
      subscription.unsubscribe();
      window.removeEventListener('myrace:passwordRecovery', handleNativeRecovery);
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      passwordRecoveryPending,
      unconfirmedEmail,
      clearUnconfirmedEmail,
      signIn: signInApi,
      signUp: signUpApi,
      signOut: signOutApi,
      resetPassword: resetPasswordApi,
      updatePassword: updatePasswordApi,
      resendSignupConfirmation: resendSignupConfirmationApi,
      completePasswordRecovery,
      beginPasswordRecovery,
    }),
    [
      user,
      loading,
      passwordRecoveryPending,
      unconfirmedEmail,
      clearUnconfirmedEmail,
      completePasswordRecovery,
      beginPasswordRecovery,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
