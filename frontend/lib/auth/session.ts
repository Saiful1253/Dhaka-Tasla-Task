import type { AuthSession } from "@/lib/api/types";

export const SESSION_STORAGE_KEY = "dhaka-tesla-pool.session";
export const SESSION_EXPIRED_EVENT = "dhaka-tesla-pool:session-expired";

function isAuthSession(value: unknown): value is AuthSession {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<AuthSession>;
  return (
    typeof candidate.token === "string" &&
    candidate.token.length > 0 &&
    !!candidate.user &&
    typeof candidate.user.id === "number" &&
    typeof candidate.user.name === "string" &&
    typeof candidate.user.email === "string" &&
    (candidate.user.role === "passenger" || candidate.user.role === "driver")
  );
}

export function readStoredSession(): AuthSession | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isAuthSession(parsed)) {
      window.localStorage.removeItem(SESSION_STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function writeStoredSession(session: AuthSession): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
}

export function clearStoredSession(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(SESSION_STORAGE_KEY);
}
