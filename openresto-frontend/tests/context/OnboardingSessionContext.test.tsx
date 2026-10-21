import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { Pressable, Text } from "react-native";
import {
  OnboardingSessionProvider,
  useOnboardingSession,
} from "@/context/OnboardingSessionContext";
import { getMe } from "@/api/onboarding";
import { logout } from "@/api/auth";
import { me, ok, refused } from "@/tests/helpers/onboardingFixtures";

jest.mock("@/api/onboarding", () => ({ getMe: jest.fn() }));
jest.mock("@/api/auth", () => ({ logout: jest.fn() }));

const mockGetMe = getMe as jest.Mock;
const mockLogout = logout as jest.Mock;

function Probe() {
  const { status, me: current, refresh, expire, signOut } = useOnboardingSession();
  return (
    <>
      <Text testID="status">{status}</Text>
      <Text testID="email">{current?.email ?? "none"}</Text>
      <Pressable testID="refresh" onPress={() => void refresh()} />
      <Pressable testID="expire" onPress={expire} />
      <Pressable testID="sign-out" onPress={() => void signOut()} />
    </>
  );
}

const renderProbe = () =>
  render(
    <OnboardingSessionProvider>
      <Probe />
    </OnboardingSessionProvider>
  );

const status = () => screen.getByTestId("status").props.children;

beforeEach(() => {
  jest.clearAllMocks();
  mockLogout.mockResolvedValue(undefined);
});

describe("OnboardingSessionProvider", () => {
  it("is loading until the session check answers, then authenticated with the account", async () => {
    mockGetMe.mockResolvedValue(ok(me()));
    renderProbe();
    expect(status()).toBe("loading");
    await waitFor(() => expect(status()).toBe("authenticated"));
    expect(screen.getByTestId("email").props.children).toBe("paul@chezpaul.be");
  });

  it("asks only once on mount", async () => {
    mockGetMe.mockResolvedValue(ok(me()));
    renderProbe();
    await waitFor(() => expect(status()).toBe("authenticated"));
    expect(mockGetMe).toHaveBeenCalledTimes(1);
  });

  it("asks only once even when React runs the mount effect twice", async () => {
    mockGetMe.mockResolvedValue(ok(me()));
    render(
      <React.StrictMode>
        <OnboardingSessionProvider>
          <Probe />
        </OnboardingSessionProvider>
      </React.StrictMode>
    );
    await waitFor(() => expect(status()).toBe("authenticated"));
    expect(mockGetMe).toHaveBeenCalledTimes(1);
  });

  it("reads a 401 as nobody signed in", async () => {
    mockGetMe.mockResolvedValue(refused("x", 401));
    renderProbe();
    await waitFor(() => expect(status()).toBe("unauthenticated"));
    expect(screen.getByTestId("email").props.children).toBe("none");
  });

  it("reads a 403 as an account that is not a restaurateur", async () => {
    mockGetMe.mockResolvedValue(refused("x", 403));
    renderProbe();
    await waitFor(() => expect(status()).toBe("forbidden"));
  });

  it("does not take a failed check for a missing session", async () => {
    mockGetMe.mockResolvedValue(refused("x", 500));
    renderProbe();
    await waitFor(() => expect(status()).toBe("error"));
  });

  it("asks again on refresh and takes the new answer", async () => {
    mockGetMe.mockResolvedValueOnce(refused("x", 401)).mockResolvedValueOnce(ok(me()));
    renderProbe();
    await waitFor(() => expect(status()).toBe("unauthenticated"));
    fireEvent.press(screen.getByTestId("refresh"));
    await waitFor(() => expect(status()).toBe("authenticated"));
  });

  it("ends a session the screen believed in when a call says it is over", async () => {
    mockGetMe.mockResolvedValue(ok(me()));
    renderProbe();
    await waitFor(() => expect(status()).toBe("authenticated"));
    fireEvent.press(screen.getByTestId("expire"));
    expect(status()).toBe("unauthenticated");
    expect(screen.getByTestId("email").props.children).toBe("none");
  });

  it("signs out on the server first, then ends the session here", async () => {
    mockGetMe.mockResolvedValue(ok(me()));
    renderProbe();
    await waitFor(() => expect(status()).toBe("authenticated"));
    await act(async () => {
      fireEvent.press(screen.getByTestId("sign-out"));
    });
    expect(mockLogout).toHaveBeenCalledTimes(1);
    expect(status()).toBe("unauthenticated");
  });
});

describe("useOnboardingSession", () => {
  it("refuses to be used outside the provider", () => {
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Probe />)).toThrow(/OnboardingSessionProvider/);
    spy.mockRestore();
  });
});
