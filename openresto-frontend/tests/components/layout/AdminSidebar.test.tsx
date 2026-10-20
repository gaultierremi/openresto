import React from "react";
import { render, screen, waitFor, fireEvent, act } from "@testing-library/react-native";
import { usePathname } from "expo-router";
import AdminSidebar from "@/components/layout/AdminSidebar";
import { AuthProvider } from "@/context/AuthContext";

jest.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));
jest.mock("@/hooks/use-color-scheme", () => ({ useColorScheme: () => "light" }));
jest.mock("@/utils/colors", () => ({ hexToRgba: (_h: string, _a: number) => "rgba(0,0,0,0.1)" }));

const mockPush = jest.fn();
const mockReplace = jest.fn();
jest.mock("expo-router", () => ({
  usePathname: jest.fn(() => "/dashboard"),
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
}));

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const mockBrand: { primaryColor: string; appName: string; faviconIcon?: string } = {
  primaryColor: "#0a7ea4",
  appName: "Open Resto",
};

jest.mock("@/context/BrandContext", () => ({
  useBrand: () => mockBrand,
}));

jest.mock("@/context/ThemeContext", () => ({
  useTheme: () => ({ toggle: jest.fn() }),
}));

jest.mock("@/api/auth", () => ({
  logout: jest.fn().mockResolvedValue(undefined),
  checkSession: jest.fn().mockResolvedValue({
    id: 1,
    email: "admin@test.com",
    displayName: "Admin Person",
    role: "Owner",
  }),
}));

jest.mock("@/api/restaurants", () => ({
  fetchRestaurants: jest.fn().mockResolvedValue([{ id: 1 }, { id: 2 }]),
}));

describe("AdminSidebar", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    const { fetchRestaurants } = require("@/api/restaurants");
    (fetchRestaurants as jest.Mock).mockResolvedValue([{ id: 1 }, { id: 2 }]);
  });

  it("renders app name", async () => {
    render(
      <AuthProvider>
        <AdminSidebar />
      </AuthProvider>
    );
    await waitFor(() => expect(screen.getByText("Open Resto")).toBeTruthy());
  });

  it("shows location count after data loads", async () => {
    render(
      <AuthProvider>
        <AdminSidebar />
      </AuthProvider>
    );
    await waitFor(() => expect(screen.getByText("Managing 2 locations")).toBeTruthy());
  });

  it("renders navigation items grouped into sections", async () => {
    render(
      <AuthProvider>
        <AdminSidebar />
      </AuthProvider>
    );
    await waitFor(() => {
      expect(screen.getByText("MANAGE")).toBeTruthy();
      expect(screen.getByText("Overview")).toBeTruthy();
      expect(screen.getByText("Bookings")).toBeTruthy();
      expect(screen.getByText("CONFIGURE")).toBeTruthy();
      expect(screen.getByText("Brand")).toBeTruthy();
      expect(screen.getByText("Email & Push")).toBeTruthy();
      expect(screen.getByText("Account")).toBeTruthy();
    });
  });

  it("shows the Users entry to an Owner", async () => {
    render(
      <AuthProvider>
        <AdminSidebar />
      </AuthProvider>
    );
    await waitFor(() => expect(screen.getByText("Users")).toBeTruthy());
    fireEvent.press(screen.getByText("Users"));
    expect(mockPush).toHaveBeenCalledWith("/admin/settings/users");
  });

  it("navigates to the native app page", async () => {
    render(
      <AuthProvider>
        <AdminSidebar />
      </AuthProvider>
    );
    await waitFor(() => expect(screen.getByText("Native app")).toBeTruthy());
    fireEvent.press(screen.getByText("Native app"));
    expect(mockPush).toHaveBeenCalledWith("/admin/settings/native-app");
  });

  it("hides the Users entry from a Manager", async () => {
    const { checkSession } = require("@/api/auth");
    (checkSession as jest.Mock).mockResolvedValueOnce({
      id: 2,
      email: "manager@test.com",
      displayName: "Manager Person",
      role: "Manager",
    });
    render(
      <AuthProvider>
        <AdminSidebar />
      </AuthProvider>
    );
    await waitFor(() => expect(screen.getByText("CONFIGURE")).toBeTruthy());
    expect(screen.queryByText("Users")).toBeNull();
  });

  it("shows the API Keys entry to an Owner", async () => {
    render(
      <AuthProvider>
        <AdminSidebar />
      </AuthProvider>
    );
    await waitFor(() => expect(screen.getByText("API Keys")).toBeTruthy());
    fireEvent.press(screen.getByText("API Keys"));
    expect(mockPush).toHaveBeenCalledWith("/admin/settings/api-keys");
  });

  it("hides the API Keys entry from a Manager", async () => {
    const { checkSession } = require("@/api/auth");
    (checkSession as jest.Mock).mockResolvedValueOnce({
      id: 2,
      email: "manager@test.com",
      displayName: "Manager Person",
      role: "Manager",
    });
    render(
      <AuthProvider>
        <AdminSidebar />
      </AuthProvider>
    );
    await waitFor(() => expect(screen.getByText("CONFIGURE")).toBeTruthy());
    expect(screen.queryByText("API Keys")).toBeNull();
  });

  it("wears the mark the brand settings selected, not a generic one", async () => {
    mockBrand.faviconIcon = "wine";
    try {
      render(
        <AuthProvider>
          <AdminSidebar />
        </AuthProvider>
      );
      expect(await screen.findByTestId("brand-glyph")).toBeTruthy();
    } finally {
      delete mockBrand.faviconIcon;
    }
  });

  it("wears the generic mark when the brand has selected none", () => {
    render(
      <AuthProvider>
        <AdminSidebar />
      </AuthProvider>
    );
    expect(screen.queryByTestId("brand-glyph")).toBeNull();
  });

  it("navigates to brand settings when Brand is pressed", async () => {
    render(
      <AuthProvider>
        <AdminSidebar />
      </AuthProvider>
    );
    await waitFor(() => expect(screen.getByText("Brand")).toBeTruthy());
    fireEvent.press(screen.getByText("Brand"));
    expect(mockPush).toHaveBeenCalledWith("/admin/settings/brand");
  });

  it("navigates to overview when Overview is pressed", async () => {
    render(
      <AuthProvider>
        <AdminSidebar />
      </AuthProvider>
    );
    await waitFor(() => expect(screen.getByText("Overview")).toBeTruthy());
    fireEvent.press(screen.getByText("Overview"));
    expect(mockPush).toHaveBeenCalledWith("/admin/dashboard");
  });

  it("navigates to bookings when Bookings is pressed", async () => {
    render(
      <AuthProvider>
        <AdminSidebar />
      </AuthProvider>
    );
    await waitFor(() => expect(screen.getByText("Bookings")).toBeTruthy());
    fireEvent.press(screen.getByText("Bookings"));
    expect(mockPush).toHaveBeenCalledWith("/admin/bookings");
  });

  it("calls logout and redirects when Log out is pressed", async () => {
    const { logout } = require("@/api/auth");
    render(
      <AuthProvider>
        <AdminSidebar />
      </AuthProvider>
    );
    await waitFor(() => expect(screen.getByText("Log out")).toBeTruthy());
    await act(async () => {
      fireEvent.press(screen.getByText("Log out"));
    });
    expect(logout).toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledWith("/admin/login");
  });

  it("navigates to site root when Back to site is pressed", async () => {
    render(
      <AuthProvider>
        <AdminSidebar />
      </AuthProvider>
    );
    await waitFor(() => expect(screen.getByText("Back to site")).toBeTruthy());
    fireEvent.press(screen.getByText("Back to site"));
    expect(mockPush).toHaveBeenCalledWith("/");
  });

  it("shows dark mode toggle text", async () => {
    render(
      <AuthProvider>
        <AdminSidebar />
      </AuthProvider>
    );
    await waitFor(() => expect(screen.getByText("Dark mode")).toBeTruthy());
  });

  it("shows single location text for 1 restaurant", async () => {
    const { fetchRestaurants } = require("@/api/restaurants");
    (fetchRestaurants as jest.Mock).mockResolvedValue([{ id: 1 }]);
    render(
      <AuthProvider>
        <AdminSidebar />
      </AuthProvider>
    );
    await waitFor(() => expect(screen.getByText("Managing 1 location")).toBeTruthy());
  });

  describe("menus and QR codes", () => {
    afterEach(() => {
      (usePathname as jest.Mock).mockImplementation(() => "/dashboard");
    });

    const renderAt = async (pathname: string) => {
      (usePathname as jest.Mock).mockImplementation(() => pathname);
      render(
        <AuthProvider>
          <AdminSidebar />
        </AuthProvider>
      );
      await screen.findByText("Menus");
    };

    const selected = (name: string) =>
      screen.getByRole("link", { name }).props.accessibilityState.selected;

    it("navigates to the menus editor when Menus is pressed", async () => {
      await renderAt("/admin/dashboard");
      fireEvent.press(screen.getByText("Menus"));
      expect(mockPush).toHaveBeenCalledWith("/admin/menus");
    });

    it("navigates to the QR codes page when QR codes is pressed", async () => {
      await renderAt("/admin/dashboard");
      fireEvent.press(screen.getByText("QR codes"));
      expect(mockPush).toHaveBeenCalledWith("/admin/qr-codes");
    });

    it("lists both entries for a Manager, neither being owner-only", async () => {
      const { checkSession } = require("@/api/auth");
      (checkSession as jest.Mock).mockResolvedValueOnce({
        id: 2,
        email: "manager@test.com",
        displayName: "Manager Person",
        role: "Manager",
      });
      await renderAt("/admin/dashboard");
      expect(screen.getByText("Menus")).toBeTruthy();
      expect(screen.getByText("QR codes")).toBeTruthy();
    });

    it("lights Menus on its own page", async () => {
      await renderAt("/admin/menus");
      expect(selected("Menus")).toBe(true);
      expect(selected("QR codes")).toBe(false);
    });

    it("keeps Menus lit on a sub-route", async () => {
      await renderAt("/admin/menus/service");
      expect(selected("Menus")).toBe(true);
      expect(selected("QR codes")).toBe(false);
    });

    it("lights QR codes on its own page", async () => {
      await renderAt("/admin/qr-codes");
      expect(selected("QR codes")).toBe(true);
      expect(selected("Menus")).toBe(false);
    });

    it("keeps QR codes lit on the print sheet beneath it", async () => {
      await renderAt("/admin/qr-codes/print");
      expect(selected("QR codes")).toBe(true);
      expect(selected("Menus")).toBe(false);
    });

    it("lights neither on an unrelated route", async () => {
      await renderAt("/admin/bookings");
      expect(selected("Menus")).toBe(false);
      expect(selected("QR codes")).toBe(false);
      expect(selected("Bookings")).toBe(true);
    });

    it("does not light them for a route that only starts with the same letters", async () => {
      await renderAt("/admin/menus-archive");
      expect(selected("Menus")).toBe(false);
    });

    it("does not light QR codes for a lookalike prefix", async () => {
      await renderAt("/admin/qr-codes-old");
      expect(selected("QR codes")).toBe(false);
    });
  });
});
