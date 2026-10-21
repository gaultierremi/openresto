/**
 * @jest-environment jsdom
 */
import React from "react";

// Mock useWindowDimensions by targeting the internal module
jest.mock("react-native/Libraries/Utilities/useWindowDimensions", () => ({
  __esModule: true,
  default: jest.fn().mockReturnValue({ width: 1024, height: 768 }),
}));

import { render, screen, waitFor } from "@testing-library/react-native";
import { useWindowDimensions } from "react-native";
import AdminLayout from "@/app/admin/_layout";
import { checkSession } from "@/api/auth";
import { useRouter, usePathname } from "expo-router";

jest.mock("@/api/auth", () => ({
  checkSession: jest.fn(),
}));

jest.mock("expo-router", () => {
  const { View } = require("react-native");
  const React = require("react");
  const Slot = () => React.createElement(View, { testID: "slot" });
  const Stack = ({ children }: any) => React.createElement(View, { testID: "stack" }, children);
  Stack.Screen = () => null;
  return {
    Slot,
    Stack,
    Redirect: ({ href }: { href: string }) =>
      React.createElement(View, { testID: `redirect-${href}` }),
    useRouter: jest.fn(),
    usePathname: jest.fn().mockReturnValue("/admin/dashboard"),
    useSegments: jest.fn().mockReturnValue(["admin", "dashboard"]),
  };
});

jest.mock("@/components/layout/AdminSidebar", () => {
  const { View } = require("react-native");
  const React = require("react");
  return () => React.createElement(View, { testID: "sidebar" });
});

jest.mock("@expo/vector-icons", () => ({
  Ionicons: () => null,
}));

jest.mock("@/context/BrandContext", () => ({
  useBrand: () => ({ appName: "Test App", primaryColor: "#000" }),
}));

describe("AdminLayout", () => {
  const mockRouter = {
    replace: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (useRouter as jest.Mock).mockReturnValue(mockRouter);
    (usePathname as jest.Mock).mockReturnValue("/dashboard");
    (useWindowDimensions as jest.Mock).mockReturnValue({ width: 1024, height: 768 });
    const { Platform } = require("react-native");
    Platform.OS = "web";
  });

  it("renders loading state initially", async () => {
    (checkSession as jest.Mock).mockReturnValue(new Promise(() => {}));
    render(<AdminLayout />);
    expect(screen.getByTestId("loading-screen")).toBeTruthy();
  });

  it("redirects to login if unauthenticated", async () => {
    (checkSession as jest.Mock).mockResolvedValue(null);
    render(<AdminLayout />);
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith("/admin/login"));
  });

  it("renders slot if authenticated and on web", async () => {
    (checkSession as jest.Mock).mockResolvedValue({ user: "admin" });
    render(<AdminLayout />);
    await waitFor(() => expect(screen.getByTestId("sidebar")).toBeTruthy());
    expect(screen.getByTestId("slot")).toBeTruthy();
  });

  it("sends a native visitor to the guest home rather than mounting the admin", async () => {
    const { Platform } = require("react-native");
    Platform.OS = "ios";
    (checkSession as jest.Mock).mockResolvedValue({ user: "admin" });
    render(<AdminLayout />);
    expect(screen.getByTestId("redirect-/")).toBeTruthy();
    expect(screen.queryByTestId("sidebar")).toBeNull();
    expect(screen.queryByTestId("slot")).toBeNull();
    // No session check either — the admin never mounts, so nothing asks who is signed in.
    expect(checkSession).not.toHaveBeenCalled();
  });

  it("renders login screen without gate", async () => {
    (usePathname as jest.Mock).mockReturnValue("/admin/login");
    (checkSession as jest.Mock).mockResolvedValue(null);
    render(<AdminLayout />);
    await waitFor(() => expect(screen.getByTestId("slot")).toBeTruthy());
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  it("renders screen-too-small wall on narrow web screens", async () => {
    (checkSession as jest.Mock).mockResolvedValue({ user: "admin" });
    (useWindowDimensions as jest.Mock).mockReturnValue({ width: 400, height: 700 });
    render(<AdminLayout />);
    await waitFor(() => expect(screen.getByText("Screen too small")).toBeTruthy());
  });

  it("does not show wall for tablet-portrait-width screens", async () => {
    (checkSession as jest.Mock).mockResolvedValue({ user: "admin" });
    (useWindowDimensions as jest.Mock).mockReturnValue({ width: 768, height: 1024 });
    render(<AdminLayout />);
    await waitFor(() => expect(screen.getByTestId("sidebar")).toBeTruthy());
    expect(screen.queryByText("Screen too small")).toBeNull();
  });

  describe("routes built for a phone or for paper", () => {
    const signedIn = () => (checkSession as jest.Mock).mockResolvedValue({ user: "admin" });
    const at = (pathname: string, width: number) => {
      (usePathname as jest.Mock).mockReturnValue(pathname);
      (useWindowDimensions as jest.Mock).mockReturnValue({ width, height: 800 });
    };

    describe("the desktop-only wall", () => {
      it("is shown on a phone for an ordinary admin screen", async () => {
        signedIn();
        at("/admin/menus", 400);
        render(<AdminLayout />);
        await waitFor(() => expect(screen.getByText("Screen too small")).toBeTruthy());
      });

      it("is not shown on a phone for the sign-in", async () => {
        (checkSession as jest.Mock).mockResolvedValue(null);
        at("/admin/login", 400);
        render(<AdminLayout />);
        await waitFor(() => expect(screen.getByTestId("slot")).toBeTruthy());
        expect(screen.queryByText("Screen too small")).toBeNull();
      });

      it("is not shown on a phone for the service screen", async () => {
        signedIn();
        at("/admin/menus/service", 400);
        render(<AdminLayout />);
        await waitFor(() => expect(screen.getByTestId("slot")).toBeTruthy());
        expect(screen.queryByText("Screen too small")).toBeNull();
      });

      it("is still shown on a phone for the print sheet", async () => {
        signedIn();
        at("/admin/qr-codes/print", 400);
        render(<AdminLayout />);
        await waitFor(() => expect(screen.getByText("Screen too small")).toBeTruthy());
      });

      it("is shown for the menus list one pixel under the boundary and not at it", async () => {
        signedIn();
        at("/admin/menus", 599);
        const narrow = render(<AdminLayout />);
        await waitFor(() => expect(screen.getByText("Screen too small")).toBeTruthy());
        narrow.unmount();

        at("/admin/menus", 600);
        render(<AdminLayout />);
        await waitFor(() => expect(screen.getByTestId("sidebar")).toBeTruthy());
        expect(screen.queryByText("Screen too small")).toBeNull();
      });
    });

    describe("the sidebar", () => {
      it("is hidden on the service screen below 600px, which has no width to spare", async () => {
        signedIn();
        at("/admin/menus/service", 599);
        render(<AdminLayout />);
        await waitFor(() => expect(screen.getByTestId("slot")).toBeTruthy());
        expect(screen.queryByTestId("sidebar")).toBeNull();
      });

      it("is shown on the service screen from 600px up", async () => {
        signedIn();
        at("/admin/menus/service", 600);
        render(<AdminLayout />);
        await waitFor(() => expect(screen.getByTestId("sidebar")).toBeTruthy());
        expect(screen.getByTestId("slot")).toBeTruthy();
      });

      it("is shown on the menus editor at desktop width", async () => {
        signedIn();
        at("/admin/menus", 1024);
        render(<AdminLayout />);
        await waitFor(() => expect(screen.getByTestId("sidebar")).toBeTruthy());
      });

      it("is hidden on the print sheet at any width, since it is printed from the browser", async () => {
        signedIn();
        for (const width of [600, 1024, 1920]) {
          at("/admin/qr-codes/print", width);
          const view = render(<AdminLayout />);
          await waitFor(() => expect(screen.getByTestId("slot")).toBeTruthy());
          expect(screen.queryByTestId("sidebar")).toBeNull();
          view.unmount();
        }
      });

      it("is shown on the QR codes page itself, which is not the sheet", async () => {
        signedIn();
        at("/admin/qr-codes", 1024);
        render(<AdminLayout />);
        await waitFor(() => expect(screen.getByTestId("sidebar")).toBeTruthy());
        expect(screen.getByTestId("slot")).toBeTruthy();
      });

      it("does not let a signed-out visitor see the print sheet or the service screen", async () => {
        for (const path of ["/admin/qr-codes/print", "/admin/menus/service"]) {
          (checkSession as jest.Mock).mockResolvedValue(null);
          mockRouter.replace.mockClear();
          at(path, 1024);
          const view = render(<AdminLayout />);
          await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith("/admin/login"));
          expect(screen.queryByTestId("slot")).toBeNull();
          view.unmount();
        }
      });
    });

    describe("the tab title", () => {
      it.each([
        ["/admin/menus", "Menus | Test App"],
        ["/admin/menus/service", "Service mode | Test App"],
        ["/admin/qr-codes", "QR codes | Test App"],
        ["/admin/qr-codes/print", "QR sheet | Test App"],
      ])("names %s", async (pathname, title) => {
        signedIn();
        at(pathname, 1024);
        document.title = "";
        render(<AdminLayout />);
        await waitFor(() => expect(document.title).toBe(title));
      });
    });
  });
});
