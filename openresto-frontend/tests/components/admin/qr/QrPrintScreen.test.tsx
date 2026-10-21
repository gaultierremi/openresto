/**
 * @jest-environment jsdom
 */
import React from "react";
import { act, render, screen } from "@testing-library/react-native";
import { QrPrintScreen } from "@/components/admin/qr/QrPrintScreen";
import { adminGetPublicTokens, type PublicTokens } from "@/api/menus";
import { adminGetRestaurants } from "@/api/admin";
import { qrToSvg } from "@/utils/qrCode";
import type { QrSheetProps } from "@/components/admin/qr/QrSheet";

jest.mock("@/api/menus", () => ({ adminGetPublicTokens: jest.fn() }));
jest.mock("@/api/admin", () => ({ adminGetRestaurants: jest.fn() }));

const mockBrand: { primaryColor: string; websiteUrl?: string } = { primaryColor: "#0a7ea4" };
jest.mock("@/context/BrandContext", () => ({ useBrand: () => mockBrand }));

const mockSheet = jest.fn();
jest.mock("@/components/admin/qr/QrSheet", () => ({
  QrSheet: (props: unknown) => {
    mockSheet(props);
    const ReactLib = require("react");
    const { View } = require("react-native");
    return ReactLib.createElement(View, { testID: "sheet" });
  },
}));

const mockParams = jest.fn();
const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => mockParams(),
  useRouter: () => ({ push: mockPush }),
}));

const mockGetTokens = adminGetPublicTokens as jest.Mock;
const mockGetRestaurants = adminGetRestaurants as jest.Mock;

const TOKENS: PublicTokens = {
  restaurantToken: "rtok",
  tables: [
    { tableId: 4, tableName: "4", sectionName: "Terrace", token: "t4" },
    { tableId: 9, tableName: null, sectionName: "Inside", token: "t9" },
  ],
};

const ORIGIN = () => window.location.origin;

const sheetProps = () => mockSheet.mock.calls.at(-1)?.[0] as QrSheetProps;

async function showSheet(params: Record<string, string> = { restaurant: "1" }) {
  mockParams.mockReturnValue(params);
  const view = render(<QrPrintScreen />);
  await screen.findByTestId("sheet");
  return view;
}

describe("QrPrintScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockBrand.websiteUrl = undefined;
    mockParams.mockReturnValue({ restaurant: "1" });
    mockGetRestaurants.mockResolvedValue([
      { id: 1, name: "Chez Paul" },
      { id: 2, name: "Chez Marie" },
    ]);
    mockGetTokens.mockResolvedValue({ ok: true, value: TOKENS });
  });

  it("waits while the location and its tokens load, drawing no sheet", () => {
    mockGetRestaurants.mockReturnValue(new Promise(() => {}));
    render(<QrPrintScreen />);
    expect(screen.queryByTestId("sheet")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("asks for the restaurant named in the address", async () => {
    await showSheet({ restaurant: "2" });
    expect(mockGetTokens).toHaveBeenCalledWith(2);
  });

  describe("table cells", () => {
    it("makes one cell per table, labelled by name or id, captioned by section", async () => {
      await showSheet();
      expect(sheetProps().cells).toEqual([
        {
          key: "table-4",
          svg: qrToSvg(`${ORIGIN()}/menu/t/t4`),
          label: "Table 4",
          caption: "Terrace",
        },
        {
          key: "table-9",
          svg: qrToSvg(`${ORIGIN()}/menu/t/t9`),
          label: "Table 9",
          caption: "Inside",
        },
      ]);
    });

    it("is what a missing scope falls back to", async () => {
      await showSheet({ restaurant: "1" });
      expect(sheetProps().cells.map((c) => c.key)).toEqual(["table-4", "table-9"]);
    });

    it("is what an unknown scope falls back to", async () => {
      await showSheet({ restaurant: "1", scope: "everything" });
      expect(sheetProps().cells.map((c) => c.key)).toEqual(["table-4", "table-9"]);
    });

    it("builds the addresses from the configured website when there is one", async () => {
      mockBrand.websiteUrl = "https://menu.chezpaul.fr/";
      await showSheet({ restaurant: "1", scope: "tables" });
      expect(sheetProps().cells[0].svg).toBe(qrToSvg("https://menu.chezpaul.fr/menu/t/t4"));
    });
  });

  describe("restaurant cell", () => {
    it("is the single restaurant code, labelled Our menu", async () => {
      await showSheet({ restaurant: "1", scope: "restaurant" });
      expect(sheetProps().cells).toEqual([
        { key: "restaurant", svg: qrToSvg(`${ORIGIN()}/menu/r/rtok`), label: "Our menu" },
      ]);
    });

    it("needs no table, so a location without any still prints", async () => {
      mockGetTokens.mockResolvedValue({ ok: true, value: { ...TOKENS, tables: [] } });
      await showSheet({ restaurant: "1", scope: "restaurant" });
      expect(sheetProps().cells).toHaveLength(1);
    });

    it("builds its address from the configured website when there is one", async () => {
      mockBrand.websiteUrl = "https://menu.chezpaul.fr";
      await showSheet({ restaurant: "1", scope: "restaurant" });
      expect(sheetProps().cells[0].svg).toBe(qrToSvg("https://menu.chezpaul.fr/menu/r/rtok"));
    });
  });

  describe("format", () => {
    it("is A4 by default, with the A4 hint", async () => {
      await showSheet();
      expect(sheetProps().format).toBe("a4");
      expect(sheetProps().labels.hint).toBe(
        "Set the paper size to A4, margins to “None”, and turn off headers and footers."
      );
    });

    it("is A6 when asked, with the A6 hint", async () => {
      await showSheet({ restaurant: "1", format: "a6" });
      expect(sheetProps().format).toBe("a6");
      expect(sheetProps().labels.hint).toBe(
        "Set the paper size to A6, margins to “None”, and turn off headers and footers."
      );
    });

    it("falls back to A4 for a format it does not know", async () => {
      await showSheet({ restaurant: "1", format: "a3" });
      expect(sheetProps().format).toBe("a4");
    });
  });

  describe("the sheet it hands over", () => {
    it("carries the restaurant's name and the translated labels", async () => {
      await showSheet();
      expect(sheetProps().restaurantName).toBe("Chez Paul");
      expect(sheetProps().labels).toMatchObject({
        scan: "Scan to see our menu",
        noApp: "No app needed: your phone’s camera is enough.",
        print: "Print",
        back: "Back",
      });
    });

    it("names the restaurant that was asked for, not the first in the list", async () => {
      await showSheet({ restaurant: "2" });
      expect(sheetProps().restaurantName).toBe("Chez Marie");
    });

    it("goes back to the QR codes page", async () => {
      await showSheet();
      expect(mockPush).not.toHaveBeenCalled();
      sheetProps().onBack();
      expect(mockPush).toHaveBeenCalledWith("/admin/qr-codes");
    });
  });

  describe("when there is nothing to print", () => {
    const expectUnavailable = async () => {
      const alert = await screen.findByRole("alert");
      expect(alert.props.children).toBe(
        "This sheet can’t be shown: the location was not found or has nothing to print."
      );
      expect(screen.queryByTestId("sheet")).toBeNull();
      expect(mockSheet).not.toHaveBeenCalled();
    };

    it("says so for a location that is not in the list", async () => {
      mockParams.mockReturnValue({ restaurant: "99" });
      render(<QrPrintScreen />);
      await expectUnavailable();
    });

    it("says so when the address names no location", async () => {
      mockParams.mockReturnValue({});
      render(<QrPrintScreen />);
      await expectUnavailable();
    });

    it("says so when the tokens cannot be loaded", async () => {
      mockGetTokens.mockResolvedValue({ ok: false, message: "Network error." });
      render(<QrPrintScreen />);
      await expectUnavailable();
    });

    it("says so when the location list is empty, as it is when that request fails", async () => {
      mockGetRestaurants.mockResolvedValue([]);
      render(<QrPrintScreen />);
      await expectUnavailable();
    });

    it("says so rather than print an empty sheet for a location with no tables", async () => {
      mockGetTokens.mockResolvedValue({ ok: true, value: { ...TOKENS, tables: [] } });
      mockParams.mockReturnValue({ restaurant: "1", scope: "tables" });
      render(<QrPrintScreen />);
      await expectUnavailable();
    });
  });

  describe("late answers", () => {
    it("are dropped once the screen has gone", async () => {
      let resolve: (value: unknown) => void = () => {};
      mockGetRestaurants.mockReturnValue(new Promise((r) => (resolve = r)));
      const errors = jest.spyOn(console, "error").mockImplementation(() => {});
      const { unmount } = render(<QrPrintScreen />);
      unmount();

      await act(async () => resolve([{ id: 1, name: "Chez Paul" }]));

      expect(errors).not.toHaveBeenCalled();
      expect(mockSheet).not.toHaveBeenCalled();
      errors.mockRestore();
    });

    it("are dropped when the address has moved to another restaurant", async () => {
      let resolveFirst: (value: unknown) => void = () => {};
      mockGetRestaurants
        .mockReturnValueOnce(new Promise((r) => (resolveFirst = r)))
        .mockResolvedValue([
          { id: 1, name: "Chez Paul" },
          { id: 2, name: "Chez Marie" },
        ]);
      mockParams.mockReturnValue({ restaurant: "1" });
      const { rerender } = render(<QrPrintScreen />);
      mockParams.mockReturnValue({ restaurant: "2" });
      rerender(<QrPrintScreen />);
      await screen.findByTestId("sheet");

      await act(async () => resolveFirst([{ id: 1, name: "Chez Paul" }]));

      expect(sheetProps().restaurantName).toBe("Chez Marie");
    });
  });
});
