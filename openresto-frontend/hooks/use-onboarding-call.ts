import { useCallback, useState } from "react";
import type { OnboardingResult } from "@/api/onboarding";

export interface CallError {
  message: string;
  code?: string;
}

/**
 * One step's way of talking to the server: a call in flight, and the refusal of the last one.
 * A 401 is not the step's to word: the session is over, so it goes to `onExpired` and the step
 * shows nothing. Everything else leaves the refusal where the screen can put it beside a field.
 *
 * @see [use-onboarding-call.test.tsx](../tests/hooks/use-onboarding-call.test.tsx) — pins that a
 * value comes back on success, that a refusal is kept and cleared by the next call, and that a
 * 401 reaches `onExpired` instead.
 */
export function useOnboardingCall(onExpired: () => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<CallError | null>(null);

  const run = useCallback(
    async <T>(call: () => Promise<OnboardingResult<T>>): Promise<T | null> => {
      setBusy(true);
      setError(null);
      const result = await call();
      setBusy(false);
      if (result.ok) return result.value;
      if (result.status === 401) onExpired();
      else setError({ message: result.message, code: result.code });
      return null;
    },
    [onExpired]
  );

  const fail = useCallback((message: string) => setError({ message }), []);
  const clear = useCallback(() => setError(null), []);

  return { busy, error, run, fail, clear };
}
