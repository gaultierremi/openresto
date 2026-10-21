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
import { getMe, type OnboardingMe } from "@/api/onboarding";
import { logout } from "@/api/auth";

/**
 * `forbidden` is a signed-in account that is not a restaurateur (an admin who followed the
 * wrong link); `error` is a session check that could not be answered, which says nothing about
 * whether there is a session.
 */
export type OnboardingSessionStatus =
  "loading" | "authenticated" | "unauthenticated" | "forbidden" | "error";

export interface OnboardingSessionValue {
  me: OnboardingMe | null;
  status: OnboardingSessionStatus;
  /** Asks the server who is signed in and returns the verdict. */
  refresh: () => Promise<OnboardingSessionStatus>;
  /** A call answered 401: the session is over, whatever this screen last believed. */
  expire: () => void;
  signOut: () => Promise<void>;
}

const OnboardingSessionContext = createContext<OnboardingSessionValue | null>(null);

/**
 * The restaurateur's own session, apart from the admin's `AuthContext`: `/admin/auth/me` is
 * closed to a restaurateur, so the identity is read from `/onboarding/me`, which is also what
 * says whether the account is one.
 *
 * @see [OnboardingSessionContext.test.tsx](../tests/context/OnboardingSessionContext.test.tsx)
 * — pins each verdict of the session check, that `expire` ends a session the screen thought it
 * had, and that signing out ends it on the server first.
 */
export function OnboardingSessionProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<OnboardingMe | null>(null);
  const [status, setStatus] = useState<OnboardingSessionStatus>("loading");

  const refresh = useCallback(async (): Promise<OnboardingSessionStatus> => {
    const result = await getMe();
    let next: OnboardingSessionStatus;
    if (result.ok) {
      setMe(result.value);
      next = "authenticated";
    } else {
      setMe(null);
      if (result.status === 401) next = "unauthenticated";
      else if (result.status === 403) next = "forbidden";
      else next = "error";
    }
    setStatus(next);
    return next;
  }, []);

  // One check per mount; the ref keeps StrictMode's doubled effect from asking twice.
  const checked = useRef(false);
  useEffect(() => {
    if (checked.current) return;
    checked.current = true;
    refresh();
  }, [refresh]);

  const expire = useCallback(() => {
    setMe(null);
    setStatus("unauthenticated");
  }, []);

  const signOut = useCallback(async () => {
    await logout();
    expire();
  }, [expire]);

  const value = useMemo(
    () => ({ me, status, refresh, expire, signOut }),
    [me, status, refresh, expire, signOut]
  );

  return (
    <OnboardingSessionContext.Provider value={value}>{children}</OnboardingSessionContext.Provider>
  );
}

export function useOnboardingSession(): OnboardingSessionValue {
  const ctx = useContext(OnboardingSessionContext);
  if (!ctx) {
    throw new Error("useOnboardingSession must be used inside an OnboardingSessionProvider");
  }
  return ctx;
}
