import React from "react";
import { Platform } from "react-native";
import { render, screen } from "@testing-library/react-native";
import LegalLayout from "@/app/legal/_layout";
import { useNoIndex } from "@/hooks/use-noindex";
import { useBrowserLocaleOptOut } from "@/context/LocaleContext";

jest.mock("expo-router", () => {
  const { View } = require("react-native");
  const Stack = ({ screenOptions }: { screenOptions: { title?: string } }) => (
    <View testID="stack" accessibilityLabel={screenOptions.title} />
  );
  return { Slot: () => <View testID="slot" />, Stack };
});
jest.mock("@/components/layout/Navbar", () => {
  const { View } = require("react-native");
  return { __esModule: true, default: () => <View testID="navbar" /> };
});
jest.mock("@/components/layout/GuestTabStack", () => ({
  guestHeader: () => ({ headerShadowVisible: false }),
}));
jest.mock("@/hooks/use-noindex", () => ({ useNoIndex: jest.fn() }));
jest.mock("@/context/LocaleContext", () => ({ useBrowserLocaleOptOut: jest.fn() }));

const original = Platform.OS;
afterEach(() => {
  Object.defineProperty(Platform, "OS", { value: original, configurable: true });
});

describe("legal layout", () => {
  it("wraps the page in the guest navbar on web", () => {
    Object.defineProperty(Platform, "OS", { value: "web", configurable: true });
    render(<LegalLayout />);
    expect(screen.getByTestId("navbar")).toBeTruthy();
    expect(screen.getByTestId("slot")).toBeTruthy();
    expect(screen.queryByTestId("stack")).toBeNull();
  });

  it("is a native stack with the guest header off web, titled in the visitor's language", () => {
    render(<LegalLayout />);
    expect(screen.getByTestId("stack").props.accessibilityLabel).toBe("Legal documents");
    expect(screen.queryByTestId("navbar")).toBeNull();
  });

  // The pages are public and indexable, and their chrome follows the visitor's language.
  it("neither hides the pages from search engines nor pins the chrome to the admin's language", () => {
    Object.defineProperty(Platform, "OS", { value: "web", configurable: true });
    render(<LegalLayout />);
    expect(useNoIndex).not.toHaveBeenCalled();
    expect(useBrowserLocaleOptOut).not.toHaveBeenCalled();
  });
});
