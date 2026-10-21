import { act, renderHook } from "@testing-library/react-native";
import { useOnboardingCall } from "@/hooks/use-onboarding-call";
import { ok, refused } from "@/tests/helpers/onboardingFixtures";

describe("useOnboardingCall", () => {
  it("returns the value of a call that succeeded and keeps no error", async () => {
    const onExpired = jest.fn();
    const { result } = renderHook(() => useOnboardingCall(onExpired));

    let value: unknown;
    await act(async () => {
      value = await result.current.run(async () => ok({ id: 1 }));
    });

    expect(value).toEqual({ id: 1 });
    expect(result.current.error).toBeNull();
    expect(result.current.busy).toBe(false);
    expect(onExpired).not.toHaveBeenCalled();
  });

  it("is busy while the call is in flight", async () => {
    const { result } = renderHook(() => useOnboardingCall(jest.fn()));
    let release: (v: ReturnType<typeof ok>) => void = () => {};
    let pending: Promise<unknown> = Promise.resolve();

    act(() => {
      pending = result.current.run(() => new Promise((resolve) => (release = resolve)));
    });
    expect(result.current.busy).toBe(true);

    await act(async () => {
      release(ok(1));
      await pending;
    });
    expect(result.current.busy).toBe(false);
  });

  it("keeps the refusal with its code, returns null, and does not end the session", async () => {
    const onExpired = jest.fn();
    const { result } = renderHook(() => useOnboardingCall(onExpired));

    let value: unknown = "unset";
    await act(async () => {
      value = await result.current.run(async () => refused("Nope.", 400, "onboarding.vat_invalid"));
    });

    expect(value).toBeNull();
    expect(result.current.error).toEqual({ message: "Nope.", code: "onboarding.vat_invalid" });
    expect(onExpired).not.toHaveBeenCalled();
  });

  it("clears the last refusal when the next call starts", async () => {
    const { result } = renderHook(() => useOnboardingCall(jest.fn()));
    await act(async () => {
      await result.current.run(async () => refused("Nope."));
    });
    expect(result.current.error).not.toBeNull();

    await act(async () => {
      await result.current.run(async () => ok(1));
    });
    expect(result.current.error).toBeNull();
  });

  it("hands a 401 to onExpired and shows no message of its own", async () => {
    const onExpired = jest.fn();
    const { result } = renderHook(() => useOnboardingCall(onExpired));

    let value: unknown = "unset";
    await act(async () => {
      value = await result.current.run(async () => refused("Request failed.", 401));
    });

    expect(value).toBeNull();
    expect(onExpired).toHaveBeenCalledTimes(1);
    expect(result.current.error).toBeNull();
  });

  it("lets a screen put its own refusal in the same place and take it away", () => {
    const { result } = renderHook(() => useOnboardingCall(jest.fn()));
    act(() => result.current.fail("Mine."));
    expect(result.current.error).toEqual({ message: "Mine." });
    act(() => result.current.clear());
    expect(result.current.error).toBeNull();
  });
});
