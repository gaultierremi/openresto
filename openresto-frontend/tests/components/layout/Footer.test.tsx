/**
 * @jest-environment jsdom
 */
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react-native";
import { Linking, Platform, StyleSheet, useWindowDimensions } from "react-native";
import Footer from "@/components/layout/Footer";
import { fetchSocialLinks } from "@/api/restaurants";

jest.mock("react-native/Libraries/Utilities/useWindowDimensions", () => ({
  __esModule: true,
  default: jest.fn().mockReturnValue({ width: 1024, height: 768 }),
}));

jest.mock("@/hooks/use-app-theme", () => ({
  useAppTheme: jest.fn(),
}));

import { useAppTheme } from "@/hooks/use-app-theme";

jest.mock("expo-router", () => {
  const { View } = require("react-native");
  return {
    // Names the destination in the tree, so a test can say where a link goes.
    Link: ({ href, children }: any) => <View testID={`link:${href}`}>{children}</View>,
  };
});

jest.mock("@expo/vector-icons", () => ({
  Ionicons: () => null,
}));

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock("@/api/restaurants", () => ({
  fetchSocialLinks: jest.fn(),
}));

jest.mock("@/utils/openExternal", () => ({
  openExternal: jest.fn(),
}));

import { openExternal } from "@/utils/openExternal";

function setPlatform(os: string) {
  Object.defineProperty(Platform, "OS", { value: os, configurable: true });
}

// jest-expo runs as "ios" by default; the block below describes the web footer, which is the
// one with an admin link and a single space-between row.
setPlatform("web");

describe("Footer", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useWindowDimensions as jest.Mock).mockReturnValue({ width: 1024, height: 768 });
    (useAppTheme as jest.Mock).mockReturnValue({
      brand: { appName: "Test App", primaryColor: "#0a7ea4" },
      colors: { border: "#ccc", muted: "#666" },
    });
    (fetchSocialLinks as jest.Mock).mockResolvedValue([]);
    jest.spyOn(Linking, "openURL").mockResolvedValue(undefined as never);
  });

  it("renders a default copyright when none is configured", () => {
    render(<Footer />);
    const year = new Date().getFullYear();
    expect(screen.getByText(`© ${year} Test App. All rights reserved.`)).toBeTruthy();
  });

  it("renders a custom copyright when configured", () => {
    (useAppTheme as jest.Mock).mockReturnValue({
      brand: { appName: "Test App", primaryColor: "#0a7ea4", copyrightText: "© 2020 Custom Co." },
      colors: { border: "#ccc", muted: "#666" },
    });
    render(<Footer />);
    expect(screen.getByText("© 2020 Custom Co.")).toBeTruthy();
  });

  it("renders the Admin link", () => {
    render(<Footer />);
    expect(screen.getByText("Admin")).toBeTruthy();
  });

  it("renders no external privacy policy link when the brand configures none", () => {
    render(<Footer />);
    expect(screen.queryByLabelText("Privacy policy")).toBeNull();
  });

  it("links the platform's privacy page when the brand configures no policy of its own", () => {
    render(<Footer />);
    expect(screen.getByTestId("link:/legal/privacy")).toBeTruthy();
    expect(screen.getByLabelText("Privacy")).toBeTruthy();
    expect(openExternal).not.toHaveBeenCalled();
  });

  it("keeps the configured privacy policy and does not also link the platform's", () => {
    (useAppTheme as jest.Mock).mockReturnValue({
      brand: {
        appName: "Test App",
        primaryColor: "#0a7ea4",
        privacyPolicyUrl: "https://example.com/privacy",
      },
      colors: { border: "#ccc", muted: "#666" },
    });
    render(<Footer />);

    expect(screen.queryByTestId("link:/legal/privacy")).toBeNull();
    expect(screen.queryByLabelText("Privacy")).toBeNull();
    expect(screen.getByLabelText("Privacy policy")).toBeTruthy();
  });

  it("always links the platform's terms and legal notice, whatever the brand configures", () => {
    const { unmount } = render(<Footer />);
    expect(screen.getByTestId("link:/legal/terms")).toBeTruthy();
    expect(screen.getByLabelText("Terms")).toBeTruthy();
    expect(screen.getByTestId("link:/legal/legal-notice")).toBeTruthy();
    expect(screen.getByLabelText("Legal notice")).toBeTruthy();
    unmount();

    (useAppTheme as jest.Mock).mockReturnValue({
      brand: {
        appName: "Test App",
        primaryColor: "#0a7ea4",
        privacyPolicyUrl: "https://example.com/privacy",
      },
      colors: { border: "#ccc", muted: "#666" },
    });
    render(<Footer />);
    expect(screen.getByTestId("link:/legal/terms")).toBeTruthy();
    expect(screen.getByTestId("link:/legal/legal-notice")).toBeTruthy();
  });

  it("renders a privacy policy link when the brand configures one, and opens it externally", () => {
    (useAppTheme as jest.Mock).mockReturnValue({
      brand: {
        appName: "Test App",
        primaryColor: "#0a7ea4",
        privacyPolicyUrl: "https://example.com/privacy",
      },
      colors: { border: "#ccc", muted: "#666" },
    });
    render(<Footer />);

    fireEvent.press(screen.getByLabelText("Privacy policy"));

    expect(openExternal).toHaveBeenCalledWith("https://example.com/privacy");
  });

  it("renders no social icons when none are configured", async () => {
    render(<Footer />);
    await waitFor(() => expect(fetchSocialLinks).toHaveBeenCalled());
    expect(screen.queryByLabelText("Instagram")).toBeNull();
  });

  it("renders configured social links and opens their URL on press", async () => {
    (fetchSocialLinks as jest.Mock).mockResolvedValue([
      {
        id: 1,
        label: "Instagram",
        url: "https://instagram.com/resto",
        iconKey: "logo-instagram",
        sortOrder: 0,
      },
    ]);
    render(<Footer />);

    const instagramBtn = await screen.findByLabelText("Instagram");
    expect(screen.queryByLabelText("Facebook")).toBeNull();
    fireEvent.press(instagramBtn);
    expect(Linking.openURL).toHaveBeenCalledWith("https://instagram.com/resto");
  });

  it("stacks copyright and links vertically on mobile widths", () => {
    (useWindowDimensions as jest.Mock).mockReturnValue({ width: 500, height: 768 });
    render(<Footer />);
    expect(screen.getByText("Admin")).toBeTruthy();
  });

  // The footer ends the page, so nothing of its own is reserved for the scroll-to-top FAB: the
  // FAB's rail is a row of the scroll content above it and holds its own band clear.
  it("ends the page on its own height, with no band reserved under it", () => {
    (useWindowDimensions as jest.Mock).mockReturnValue({ width: 1024, height: 768 });
    render(<Footer />);
    expect(StyleSheet.flatten(screen.getByTestId("site-footer").props.style).paddingBottom).toBe(0);
  });

  it("lays its links out in one unwrapped row beside the copyright", () => {
    render(<Footer />);
    expect(StyleSheet.flatten(screen.getByTestId("footer-inner").props.style).flexDirection).toBe(
      "row"
    );
    expect(
      StyleSheet.flatten(screen.getByTestId("footer-links").props.style).flexWrap
    ).toBeUndefined();
  });

  /**
   * A footer is a document paradigm — the bottom of one long page. The native app has screens
   * instead, so the same band under every screen read as a website in a wrapper and stacked
   * above the tab bar. Its contents moved into GuestSettingsSheet's About section, which
   * GuestSettingsSheet.test.tsx pins; here we only pin that nothing is left behind.
   */
  describe("off web", () => {
    beforeEach(() => setPlatform("ios"));
    afterEach(() => setPlatform("web"));

    it("renders nothing at all", () => {
      render(<Footer />);
      expect(screen.queryByTestId("site-footer")).toBeNull();
    });

    it("asks the server for nothing it will not draw", () => {
      render(<Footer />);
      expect(fetchSocialLinks).not.toHaveBeenCalled();
    });
  });
});
