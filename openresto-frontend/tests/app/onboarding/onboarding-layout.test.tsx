/**
 * @jest-environment jsdom
 */
import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { Platform } from "react-native";
import OnboardingLayout from "@/app/onboarding/_layout";
import { getMe } from "@/api/onboarding";
import { usePathname } from "expo-router";
import { me, ok, refused } from "@/tests/helpers/onboardingFixtures";

jest.setTimeout(20_000);

jest.mock("@/api/onboarding", () => ({ getMe: jest.fn() }));
jest.mock("@/api/auth", () => ({ logout: jest.fn() }));
jest.mock("@/context/BrandContext", () => ({
  useBrand: () => ({ appName: "Open Resto", primaryColor: "#0a7ea4" }),
}));
jest.mock("@/utils/haptics", () => ({
  haptics: { selection: jest.fn(), press: jest.fn(), outcome: jest.fn() },
}));

const mockOptOut = jest.fn();
jest.mock("@/context/LocaleContext", () => ({ useBrowserLocaleOptOut: () => mockOptOut() }));
jest.mock("@/components/common/LanguageSwitcher", () => {
  const { View } = require("react-native");
  return () => <View testID="language-switcher" />;
});
const mockNoIndex = jest.fn();
jest.mock("@/hooks/use-noindex", () => ({ useNoIndex: () => mockNoIndex() }));

const mockReplace = jest.fn();
jest.mock("expo-router", () => {
  const { Pressable: RNPressable, Text: RNText, View } = require("react-native");
  const ReactLib = require("react");
  const { useOnboardingSession } = jest.requireActual("@/context/OnboardingSessionContext");
  const Slot = () => {
    const { expire } = useOnboardingSession();
    return ReactLib.createElement(
      View,
      { testID: "slot" },
      ReactLib.createElement(RNText, null, "screen"),
      ReactLib.createElement(RNPressable, { testID: "expire", onPress: expire })
    );
  };
  return {
    Slot,
    Redirect: ({ href }: { href: string }) =>
      ReactLib.createElement(View, { testID: `redirect-${href}` }),
    useRouter: () => ({ replace: mockReplace }),
    usePathname: jest.fn(),
  };
});

const mockGetMe = getMe as jest.Mock;
const mockPath = usePathname as jest.Mock;

const renderLayout = async () => {
  render(<OnboardingLayout />);
  await act(async () => {});
};

beforeEach(() => {
  jest.clearAllMocks();
  Platform.OS = "web";
  mockPath.mockReturnValue("/onboarding/restaurant/7");
  mockGetMe.mockResolvedValue(ok(me()));
});

describe("OnboardingLayout off web", () => {
  it("sends a native visitor to the guest home and mounts nothing of the restaurateur's space", async () => {
    Platform.OS = "ios";
    await renderLayout();
    expect(screen.getByTestId("redirect-/")).toBeTruthy();
    expect(screen.queryByTestId("slot")).toBeNull();
    expect(mockOptOut).not.toHaveBeenCalled();
    expect(mockNoIndex).not.toHaveBeenCalled();
    expect(mockGetMe).not.toHaveBeenCalled();
  });
});

describe("OnboardingLayout on web", () => {
  it("follows the browser, offers a language switcher and stays out of search engines", async () => {
    await renderLayout();
    expect(mockOptOut).not.toHaveBeenCalled();
    expect(screen.getByTestId("language-switcher")).toBeTruthy();
    expect(mockNoIndex).toHaveBeenCalled();
  });

  it("titles the tab for the platform", async () => {
    await renderLayout();
    expect(document.title).toBe("Set up your restaurant | Open Resto");
  });

  describe("a screen that needs a session", () => {
    it("shows a loader, not the screen, while the session is being checked", async () => {
      mockGetMe.mockReturnValue(new Promise(() => {}));
      await renderLayout();
      expect(screen.getByTestId("loading-screen")).toBeTruthy();
      expect(screen.queryByTestId("slot")).toBeNull();
      expect(mockReplace).not.toHaveBeenCalled();
    });

    it("shows the screen to a restaurateur and goes nowhere", async () => {
      await renderLayout();
      expect(screen.getByTestId("slot")).toBeTruthy();
      expect(mockReplace).not.toHaveBeenCalled();
    });

    it("sends a visitor with no session to sign in, showing none of the screen", async () => {
      mockGetMe.mockResolvedValue(refused("x", 401));
      await renderLayout();
      expect(mockReplace).toHaveBeenCalledWith("/onboarding/login");
      expect(screen.queryByTestId("slot")).toBeNull();
      expect(screen.getByTestId("loading-screen")).toBeTruthy();
    });

    it("sends an account that is not a restaurateur to sign in too", async () => {
      mockGetMe.mockResolvedValue(refused("x", 403));
      await renderLayout();
      expect(mockReplace).toHaveBeenCalledWith("/onboarding/login");
      expect(screen.queryByTestId("slot")).toBeNull();
    });

    it("sends the visitor to sign in when a call from the screen says the session ended", async () => {
      await renderLayout();
      expect(mockReplace).not.toHaveBeenCalled();

      await act(async () => {
        fireEvent.press(screen.getByTestId("expire"));
      });

      expect(mockReplace).toHaveBeenCalledWith("/onboarding/login");
      expect(screen.queryByTestId("slot")).toBeNull();
    });

    it("does not take a failed session check for a missing session: it offers to try again", async () => {
      mockGetMe.mockResolvedValueOnce(refused("down", 500)).mockResolvedValueOnce(ok(me()));
      await renderLayout();
      expect(mockReplace).not.toHaveBeenCalled();
      expect(screen.queryByTestId("slot")).toBeNull();

      await act(async () => {
        fireEvent.press(screen.getByRole("button", { name: "Try again" }));
      });

      expect(mockGetMe).toHaveBeenCalledTimes(2);
      expect(screen.getByTestId("slot")).toBeTruthy();
    });
  });

  describe.each(["/onboarding/login", "/onboarding/invitation/abc123"])(
    "the public screen %s",
    (path) => {
      beforeEach(() => mockPath.mockReturnValue(path));

      it("opens without a session, with nowhere to be sent", async () => {
        mockGetMe.mockResolvedValue(refused("x", 401));
        await renderLayout();
        expect(screen.getByTestId("slot")).toBeTruthy();
        expect(mockReplace).not.toHaveBeenCalled();
      });

      it("opens at once, without waiting for the session check", async () => {
        mockGetMe.mockReturnValue(new Promise(() => {}));
        await renderLayout();
        expect(screen.getByTestId("slot")).toBeTruthy();
      });

      it("opens even for an account that is not a restaurateur, and when the check fails", async () => {
        mockGetMe.mockResolvedValue(refused("x", 403));
        await renderLayout();
        expect(screen.getByTestId("slot")).toBeTruthy();
        expect(mockReplace).not.toHaveBeenCalled();
      });

      it("shows no error screen when the check fails", async () => {
        mockGetMe.mockResolvedValue(refused("down", 500));
        await renderLayout();
        expect(screen.getByTestId("slot")).toBeTruthy();
        expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
      });
    }
  );

  it("does not treat a path that merely starts like the login as public", async () => {
    mockPath.mockReturnValue("/onboarding/login-help");
    mockGetMe.mockResolvedValue(refused("x", 401));
    await renderLayout();
    expect(mockReplace).toHaveBeenCalledWith("/onboarding/login");
  });

  it("sends the index to sign in too, when nobody is", async () => {
    mockPath.mockReturnValue("/onboarding");
    mockGetMe.mockResolvedValue(refused("x", 401));
    await renderLayout();
    expect(mockReplace).toHaveBeenCalledWith("/onboarding/login");
  });
});
