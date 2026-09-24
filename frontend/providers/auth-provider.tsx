"use client";

import { useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import type { AuthSession } from "@/lib/api/types";
import {
  clearStoredSession,
  readStoredSession,
  SESSION_EXPIRED_EVENT,
  writeStoredSession,
} from "@/lib/auth/session";

interface AuthContextValue {
  session: AuthSession | null;
  hydrated: boolean;
  sessionNotice: string | null;
  signIn: (session: AuthSession) => void;
  signOut: () => void;
  clearSessionNotice: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [session, setSession] = useState<AuthSession | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [sessionNotice, setSessionNotice] = useState<string | null>(null);

  useEffect(() => {
    setSession(readStoredSession());
    setHydrated(true);
  }, []);

  useEffect(() => {
    const handleExpired = () => {
      clearStoredSession();
      setSession(null);
      setSessionNotice(
        "Your session expired. Sign in again to reopen your passenger or driver console.",
      );
      router.replace("/");
    };

    window.addEventListener(SESSION_EXPIRED_EVENT, handleExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, handleExpired);
  }, [router]);

  const signIn = useCallback((nextSession: AuthSession) => {
    writeStoredSession(nextSession);
    setSessionNotice(null);
    setSession(nextSession);
  }, []);

  const signOut = useCallback(() => {
    clearStoredSession();
    setSessionNotice(null);
    setSession(null);
    router.replace("/");
  }, [router]);

  const clearSessionNotice = useCallback(() => setSessionNotice(null), []);

  const value = useMemo(
    () => ({
      session,
      hydrated,
      sessionNotice,
      signIn,
      signOut,
      clearSessionNotice,
    }),
    [
      clearSessionNotice,
      hydrated,
      session,
      sessionNotice,
      signIn,
      signOut,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
