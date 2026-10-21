import { apiErrorMessage } from "@/api/errors";

/**
 * What a call answers: the value, or the refusal in the viewer's language plus the stable
 * `ErrorCodes` identifier it was translated from, so a caller can tell one refusal from
 * another without matching on wording.
 */
export type ApiResult<T> = { ok: true; value: T } | { ok: false; message: string; code?: string };

/**
 * Runs one request and folds every way it can fail into the result. A refusal's body carries
 * `message` and `code` (see `apiErrorMessage`); a request that never got an answer has neither.
 *
 * @see [platform.test.ts](../tests/api/platform.test.ts) — pins the refusal's translated
 * message and code, and the network failure.
 */
export async function apiRequest<T>(
  call: () => Promise<Response>,
  read: (res: Response) => Promise<T>
): Promise<ApiResult<T>> {
  try {
    const res = await call();
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const code = (body as { code?: unknown } | null)?.code;
      return {
        ok: false,
        message: apiErrorMessage(body, "Request failed."),
        code: typeof code === "string" ? code : undefined,
      };
    }
    return { ok: true, value: await read(res) };
  } catch {
    return { ok: false, message: "Network error." };
  }
}

export const readJson = <T>(res: Response): Promise<T> => res.json() as Promise<T>;
