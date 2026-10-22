/**
 * @jest-environment jsdom
 */
import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { QrMenuPanel } from "@/components/onboarding/QrMenuPanel";
import { downloadQrPng, downloadQrSvg } from "@/utils/qrDownload";
import { qrToSvg, svgToDataUri } from "@/utils/qrCode";
import { setActiveLocale } from "@/utils/locale";
import { preview } from "@/tests/helpers/onboardingFixtures";

jest.mock("@/context/BrandContext", () => ({
  useBrand: () => ({ appName: "Open Resto", primaryColor: "#0a7ea4" }),
}));
jest.mock("@/utils/haptics", () => ({
  haptics: { selection: jest.fn(), press: jest.fn(), outcome: jest.fn() },
}));
jest.mock("@/utils/qrDownload", () => ({
  ...jest.requireActual("@/utils/qrDownload"),
  downloadQrPng: jest.fn(),
  downloadQrSvg: jest.fn(),
}));

const mockPng = downloadQrPng as jest.Mock;
const mockSvg = downloadQrSvg as jest.Mock;

const ADDRESS = `${window.location.origin}/menu/r/tok-abc`;

const panel = (over: Partial<React.ComponentProps<typeof QrMenuPanel>> = {}) => (
  <QrMenuPanel
    name="Chez Marguerite"
    menu={preview().menu}
    menuToken="tok-abc"
    published={false}
    {...over}
  />
);

beforeAll(() => setActiveLocale("en"));
afterAll(() => setActiveLocale(undefined));
beforeEach(() => {
  jest.clearAllMocks();
  mockPng.mockResolvedValue(true);
});

describe("QrMenuPanel", () => {
  it("draws a code for the menu page of this instance, and prints the address under it", () => {
    render(panel());
    expect(screen.getByTestId("qr-url").props.children).toBe(ADDRESS);
    expect(screen.getByLabelText("QR code of your menu").props.source).toEqual({
      uri: svgToDataUri(qrToSvg(ADDRESS)),
    });
  });

  it("encodes a token that needs it", () => {
    render(panel({ menuToken: "a b/c" }));
    expect(screen.getByTestId("qr-url").props.children).toBe(
      `${window.location.origin}/menu/r/a%20b%2Fc`
    );
  });

  it("says the code only works once published, and that it works once it is", () => {
    const { rerender } = render(panel());
    expect(
      screen.getByText("This code will only work once your restaurant is published.")
    ).toBeTruthy();

    rerender(panel({ published: true }));
    expect(screen.getByText("This code is live: your guests can scan it right now.")).toBeTruthy();
  });

  it("draws no code, and offers no download, when the restaurant has no token", () => {
    render(panel({ menuToken: null }));
    expect(screen.queryByTestId("qr-url")).toBeNull();
    expect(screen.queryByLabelText("QR code of your menu")).toBeNull();
    expect(screen.queryByTestId("qr-download-png")).toBeNull();
    expect(screen.queryByTestId("qr-download-svg")).toBeNull();
  });

  describe("downloads", () => {
    it("saves the image named after the restaurant, for the address the code carries", async () => {
      render(panel());

      await act(async () => {
        fireEvent.press(screen.getByTestId("qr-download-png"));
      });

      expect(mockPng).toHaveBeenCalledWith("chez-marguerite-carte.png", ADDRESS);
      expect(screen.queryByTestId("qr-download-failed")).toBeNull();
    });

    it("saves the vector file with the very markup that is drawn", () => {
      render(panel());

      fireEvent.press(screen.getByTestId("qr-download-svg"));

      expect(mockSvg).toHaveBeenCalledWith("chez-marguerite-carte.svg", qrToSvg(ADDRESS));
    });

    it("says so, and points to the other file, when the browser cannot make the image", async () => {
      mockPng.mockResolvedValue(false);
      render(panel());

      await act(async () => {
        fireEvent.press(screen.getByTestId("qr-download-png"));
      });

      expect(screen.getByTestId("qr-download-failed")).toHaveTextContent(
        "The image could not be created. Try the printer's file instead."
      );
    });

    it("clears that message once a later try works", async () => {
      mockPng.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
      render(panel());

      await act(async () => {
        fireEvent.press(screen.getByTestId("qr-download-png"));
      });
      await act(async () => {
        fireEvent.press(screen.getByTestId("qr-download-png"));
      });

      expect(screen.queryByTestId("qr-download-failed")).toBeNull();
    });
  });

  it("lists the categories and dishes, with a price in euros or 'price on request'", () => {
    render(panel());
    expect(screen.getByText("Entrées")).toBeTruthy();
    expect(screen.getByText("Croquettes aux crevettes")).toBeTruthy();
    expect(screen.getByText("Maison")).toBeTruthy();
    expect(screen.getByText("€14.50")).toBeTruthy();
    expect(screen.getByText("Soupe du jour")).toBeTruthy();
    expect(screen.getByText("Price on request")).toBeTruthy();
  });

  it("says the menu is empty when it has no category", () => {
    render(panel({ menu: { menuId: null, name: "Carte", categories: [] } }));
    expect(screen.getByTestId("qr-menu-empty")).toHaveTextContent(
      'Your menu is empty. Go back to the "Menu" step to add dishes.'
    );
  });

  it("copes with rows the server sent without ids", () => {
    render(
      panel({
        menu: {
          menuId: null,
          name: "Carte",
          categories: [
            { name: "Plats", items: [{ name: "Stoemp", description: null, priceMinor: 1700 }] },
          ],
        },
      })
    );
    expect(screen.getByText("Stoemp")).toBeTruthy();
    expect(screen.getByText("€17.00")).toBeTruthy();
  });
});
