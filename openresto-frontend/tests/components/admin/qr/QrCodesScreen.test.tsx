/**
 * @jest-environment jsdom
 */
import React from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react-native";
import { printHref, QrCodesScreen } from "@/components/admin/qr/QrCodesScreen";
import {
  adminGetPublicTokens,
  adminRegenerateRestaurantToken,
  adminRegenerateTableToken,
  type PublicTokens,
} from "@/api/menus";
import { useCan } from "@/context/AuthContext";

jest.mock("@/api/menus", () => ({
  adminGetPublicTokens: jest.fn(),
  adminRegenerateRestaurantToken: jest.fn(),
  adminRegenerateTableToken: jest.fn(),
}));

jest.mock("@/context/AuthContext", () => ({ useCan: jest.fn() }));

const mockBrand: { primaryColor: string; websiteUrl?: string } = { primaryColor: "#0a7ea4" };
jest.mock("@/context/BrandContext", () => ({ useBrand: () => mockBrand }));

const mockSelect = jest.fn();
const mockLocation: {
  restaurants: { id: number; name: string }[];
  loading: boolean;
  selected: { id: number; name: string } | null;
} = { restaurants: [], loading: false, selected: null };
jest.mock("@/hooks/use-admin-location", () => ({
  useAdminLocation: () => ({ ...mockLocation, select: mockSelect }),
}));

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush }),
  Stack: { Screen: () => null },
}));

jest.mock("@/utils/qrDownload", () => ({
  ...jest.requireActual("@/utils/qrDownload"),
  downloadQrPng: jest.fn().mockResolvedValue(true),
  downloadQrSvg: jest.fn(),
}));

const mockGetTokens = adminGetPublicTokens as jest.Mock;
const mockRegenRestaurant = adminRegenerateRestaurantToken as jest.Mock;
const mockRegenTable = adminRegenerateTableToken as jest.Mock;
const mockUseCan = useCan as jest.Mock;

const PAUL = { id: 1, name: "Chez Paul" };
const MARIE = { id: 2, name: "Chez Marie" };

const tokens = (over: Partial<PublicTokens> = {}): PublicTokens => ({
  restaurantToken: "rtok",
  tables: [
    { tableId: 4, tableName: "4", sectionName: "Terrace", token: "t4" },
    { tableId: 9, tableName: null, sectionName: "Inside", token: "t9" },
  ],
  ...over,
});

const urlOf = (testID: string) => screen.getByTestId(`${testID}-url`).props.children;

async function showScreen(data: PublicTokens = tokens()) {
  mockLocation.selected = PAUL;
  mockLocation.restaurants = [PAUL];
  mockGetTokens.mockResolvedValue({ ok: true, value: data });
  const view = render(<QrCodesScreen />);
  await screen.findByTestId("qr-restaurant");
  return view;
}

async function confirmRegenerate(testID: string) {
  fireEvent.press(screen.getByTestId(`${testID}-regenerate`));
  await act(async () => fireEvent.press(screen.getByText("Regenerate and stop the old code")));
}

describe("printHref", () => {
  it("addresses the print route with the location, the format and what to print", () => {
    expect(printHref(7, "a4", "tables")).toBe(
      "/admin/qr-codes/print?restaurant=7&format=a4&scope=tables"
    );
    expect(printHref(7, "a6", "restaurant")).toBe(
      "/admin/qr-codes/print?restaurant=7&format=a6&scope=restaurant"
    );
  });
});

describe("QrCodesScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLocation.restaurants = [];
    mockLocation.loading = false;
    mockLocation.selected = null;
    mockBrand.websiteUrl = undefined;
    mockUseCan.mockReturnValue(true);
  });

  describe("before there are codes", () => {
    it("shows the page title and subtitle", () => {
      mockLocation.loading = true;
      render(<QrCodesScreen />);
      expect(screen.getByText("QR codes")).toBeTruthy();
      expect(
        screen.getByText("Print a code for each table: guests scan it to open your menu.")
      ).toBeTruthy();
    });

    it("waits while the locations load, asking for no tokens", () => {
      mockLocation.loading = true;
      render(<QrCodesScreen />);
      expect(screen.queryByText("Add a location to create QR codes.")).toBeNull();
      expect(screen.queryByTestId("qr-restaurant")).toBeNull();
      expect(mockGetTokens).not.toHaveBeenCalled();
    });

    it("says so when there is no location to make codes for, asking for no tokens", () => {
      render(<QrCodesScreen />);
      expect(screen.getByText("Add a location to create QR codes.")).toBeTruthy();
      expect(mockGetTokens).not.toHaveBeenCalled();
    });

    it("waits while the tokens load", () => {
      mockLocation.selected = PAUL;
      mockLocation.restaurants = [PAUL];
      mockGetTokens.mockReturnValue(new Promise(() => {}));
      render(<QrCodesScreen />);
      expect(mockGetTokens).toHaveBeenCalledWith(1);
      expect(screen.queryByTestId("qr-restaurant")).toBeNull();
      expect(screen.queryByRole("alert")).toBeNull();
    });

    it("says the codes could not be loaded when the request fails", async () => {
      mockLocation.selected = PAUL;
      mockLocation.restaurants = [PAUL];
      mockGetTokens.mockResolvedValue({ ok: false, message: "Network error." });
      render(<QrCodesScreen />);

      const alert = await screen.findByRole("alert");
      expect(alert.props.children).toBe(
        "Couldn’t load the QR codes. Check your connection and try again."
      );
      expect(screen.queryByTestId("qr-restaurant")).toBeNull();
    });
  });

  describe("location selector", () => {
    it("offers none with a single location", async () => {
      await showScreen();
      expect(screen.queryAllByRole("radio")).toHaveLength(0);
    });

    it("lists the locations when there are several, and selects the one pressed", async () => {
      mockLocation.restaurants = [PAUL, MARIE];
      mockLocation.selected = PAUL;
      mockGetTokens.mockResolvedValue({ ok: true, value: tokens() });
      render(<QrCodesScreen />);
      await screen.findByTestId("qr-restaurant");

      const pills = screen.getAllByRole("radio");
      expect(pills).toHaveLength(2);
      fireEvent.press(screen.getByLabelText("Chez Marie"));
      expect(mockSelect).toHaveBeenCalledWith(2);
    });

    it("loads the codes of the newly selected location", async () => {
      mockLocation.restaurants = [PAUL, MARIE];
      mockLocation.selected = PAUL;
      mockGetTokens.mockImplementation((id: number) =>
        Promise.resolve({
          ok: true,
          value: tokens({ restaurantToken: id === 1 ? "paul-token" : "marie-token" }),
        })
      );
      const { rerender } = render(<QrCodesScreen />);
      await screen.findByTestId("qr-restaurant");
      expect(urlOf("qr-restaurant")).toContain("/menu/r/paul-token");

      mockLocation.selected = MARIE;
      rerender(<QrCodesScreen />);

      expect(mockGetTokens).toHaveBeenLastCalledWith(2);
      await act(async () => {});
      expect(urlOf("qr-restaurant")).toContain("/menu/r/marie-token");
    });

    it("ignores the answer for a location that is no longer selected", async () => {
      mockLocation.restaurants = [PAUL, MARIE];
      mockLocation.selected = PAUL;
      let resolvePaul: (value: unknown) => void = () => {};
      mockGetTokens.mockImplementation((id: number) =>
        id === 1
          ? new Promise((resolve) => (resolvePaul = resolve))
          : Promise.resolve({ ok: true, value: tokens({ restaurantToken: "marie-token" }) })
      );
      const { rerender } = render(<QrCodesScreen />);
      mockLocation.selected = MARIE;
      rerender(<QrCodesScreen />);
      await screen.findByTestId("qr-restaurant");

      await act(async () =>
        resolvePaul({ ok: true, value: tokens({ restaurantToken: "paul-token" }) })
      );

      expect(urlOf("qr-restaurant")).toContain("/menu/r/marie-token");
    });
  });

  describe("the codes", () => {
    it("shows the restaurant's code and one tile per table", async () => {
      await showScreen();
      expect(screen.getByText("Restaurant code")).toBeTruthy();
      expect(screen.getByText("Table codes")).toBeTruthy();
      expect(within(screen.getByTestId("qr-restaurant")).getByText("Chez Paul")).toBeTruthy();
      expect(screen.getByTestId("qr-table-4")).toBeTruthy();
      expect(screen.getByTestId("qr-table-9")).toBeTruthy();
    });

    it("titles a table by its name, falls back to its id, and shows its section", async () => {
      await showScreen();
      expect(within(screen.getByTestId("qr-table-4")).getByText("Table 4")).toBeTruthy();
      expect(within(screen.getByTestId("qr-table-4")).getByText("Terrace")).toBeTruthy();
      expect(within(screen.getByTestId("qr-table-9")).getByText("Table 9")).toBeTruthy();
      expect(within(screen.getByTestId("qr-table-9")).getByText("Inside")).toBeTruthy();
    });

    it("builds each address from the origin the admin is open on when no website is set", async () => {
      await showScreen();
      expect(urlOf("qr-restaurant")).toBe(`${window.location.origin}/menu/r/rtok`);
      expect(urlOf("qr-table-4")).toBe(`${window.location.origin}/menu/t/t4`);
      expect(urlOf("qr-table-9")).toBe(`${window.location.origin}/menu/t/t9`);
    });

    it("builds them from the configured website when it is an http(s) address", async () => {
      mockBrand.websiteUrl = "https://menu.chezpaul.fr/";
      await showScreen();
      expect(urlOf("qr-restaurant")).toBe("https://menu.chezpaul.fr/menu/r/rtok");
      expect(urlOf("qr-table-4")).toBe("https://menu.chezpaul.fr/menu/t/t4");
    });

    it("ignores a configured website that is not an http(s) address", async () => {
      mockBrand.websiteUrl = "ftp://menu.chezpaul.fr";
      await showScreen();
      expect(urlOf("qr-restaurant")).toBe(`${window.location.origin}/menu/r/rtok`);
    });

    it("says so when the location has no table, and offers no table print sheet", async () => {
      await showScreen(tokens({ tables: [] }));
      expect(
        screen.getByText("This location has no tables yet. Add some under Locations.")
      ).toBeTruthy();
      expect(screen.queryByTestId("qr-print-a4")).toBeNull();
      expect(screen.queryByTestId("qr-print-a6")).toBeNull();
      expect(screen.getByTestId("qr-print-restaurant")).toBeTruthy();
    });
  });

  describe("print links", () => {
    it("opens the A6 restaurant card", async () => {
      await showScreen();
      fireEvent.press(screen.getByTestId("qr-print-restaurant"));
      expect(mockPush).toHaveBeenCalledWith(
        "/admin/qr-codes/print?restaurant=1&format=a6&scope=restaurant"
      );
    });

    it("opens the A4 table sheet", async () => {
      await showScreen();
      fireEvent.press(screen.getByTestId("qr-print-a4"));
      expect(mockPush).toHaveBeenCalledWith(
        "/admin/qr-codes/print?restaurant=1&format=a4&scope=tables"
      );
    });

    it("opens the A6 table cards", async () => {
      await showScreen();
      fireEvent.press(screen.getByTestId("qr-print-a6"));
      expect(mockPush).toHaveBeenCalledWith(
        "/admin/qr-codes/print?restaurant=1&format=a6&scope=tables"
      );
    });

    it("prints nothing until a link is pressed", async () => {
      await showScreen();
      expect(mockPush).not.toHaveBeenCalled();
    });
  });

  describe("regenerating", () => {
    it("asks whether the caller may regenerate QR tokens", async () => {
      await showScreen();
      expect(mockUseCan).toHaveBeenCalledWith("regenerate:qr-token");
    });

    it("offers Regenerate on every tile to an Owner", async () => {
      await showScreen();
      expect(screen.getByTestId("qr-restaurant-regenerate")).toBeTruthy();
      expect(screen.getByTestId("qr-table-4-regenerate")).toBeTruthy();
      expect(screen.getByTestId("qr-table-9-regenerate")).toBeTruthy();
    });

    it("offers it nowhere to a Manager, who still sees the codes and can print", async () => {
      mockUseCan.mockReturnValue(false);
      await showScreen();
      expect(screen.queryByText("Regenerate")).toBeNull();
      expect(screen.getByTestId("qr-restaurant")).toBeTruthy();
      expect(screen.getByTestId("qr-print-a4")).toBeTruthy();
    });

    it("replaces the restaurant's token and shows the new address", async () => {
      mockRegenRestaurant.mockResolvedValue({ ok: true, value: "rtok-new" });
      await showScreen();

      await confirmRegenerate("qr-restaurant");

      expect(mockRegenRestaurant).toHaveBeenCalledWith(1);
      expect(urlOf("qr-restaurant")).toBe(`${window.location.origin}/menu/r/rtok-new`);
      expect(mockRegenTable).not.toHaveBeenCalled();
      expect(urlOf("qr-table-4")).toContain("/menu/t/t4");
    });

    it("replaces one table's token and leaves the others as they were", async () => {
      mockRegenTable.mockResolvedValue({ ok: true, value: "t4-new" });
      await showScreen();

      await confirmRegenerate("qr-table-4");

      expect(mockRegenTable).toHaveBeenCalledWith(1, 4);
      expect(urlOf("qr-table-4")).toBe(`${window.location.origin}/menu/t/t4-new`);
      expect(urlOf("qr-table-9")).toBe(`${window.location.origin}/menu/t/t9`);
      expect(urlOf("qr-restaurant")).toBe(`${window.location.origin}/menu/r/rtok`);
      expect(mockRegenRestaurant).not.toHaveBeenCalled();
    });

    it("regenerates nothing when the question is cancelled", async () => {
      await showScreen();
      fireEvent.press(screen.getByTestId("qr-table-4-regenerate"));
      fireEvent.press(screen.getByText("Cancel"));
      expect(mockRegenTable).not.toHaveBeenCalled();
      expect(mockRegenRestaurant).not.toHaveBeenCalled();
      expect(urlOf("qr-table-4")).toContain("/menu/t/t4");
    });

    it("keeps the old address and shows the server's message when the restaurant's fails", async () => {
      mockRegenRestaurant.mockResolvedValue({ ok: false, message: "Owners only." });
      await showScreen();

      await confirmRegenerate("qr-restaurant");

      expect(within(screen.getByTestId("qr-restaurant")).getByRole("alert").props.children).toBe(
        "Owners only."
      );
      expect(urlOf("qr-restaurant")).toBe(`${window.location.origin}/menu/r/rtok`);
    });

    it("keeps the old address and shows the message when a table's fails", async () => {
      mockRegenTable.mockResolvedValue({ ok: false, message: "Network error." });
      await showScreen();

      await confirmRegenerate("qr-table-9");

      expect(within(screen.getByTestId("qr-table-9")).getByRole("alert").props.children).toBe(
        "Network error."
      );
      expect(urlOf("qr-table-9")).toBe(`${window.location.origin}/menu/t/t9`);
    });

    it("does not bring the old screen back when the location changed while it was in flight", async () => {
      mockLocation.restaurants = [PAUL, MARIE];
      mockLocation.selected = PAUL;
      let finish: (value: unknown) => void = () => {};
      mockRegenRestaurant.mockReturnValue(new Promise((resolve) => (finish = resolve)));
      mockGetTokens.mockImplementation((id: number) =>
        id === 1 ? Promise.resolve({ ok: true, value: tokens() }) : new Promise(() => {})
      );
      const { rerender } = render(<QrCodesScreen />);
      await screen.findByTestId("qr-restaurant");
      await confirmRegenerate("qr-restaurant");

      mockLocation.selected = MARIE;
      rerender(<QrCodesScreen />);
      await act(async () => finish({ ok: true, value: "late-token" }));

      expect(screen.queryByTestId("qr-restaurant")).toBeNull();
    });
  });
});
