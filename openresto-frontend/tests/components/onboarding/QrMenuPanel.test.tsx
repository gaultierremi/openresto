/**
 * @jest-environment jsdom
 */
import React from "react";
import { render, screen } from "@testing-library/react-native";
import { QrMenuPanel } from "@/components/onboarding/QrMenuPanel";
import { qrToSvg, svgToDataUri } from "@/utils/qrCode";
import { setActiveLocale } from "@/utils/locale";
import { preview } from "@/tests/helpers/onboardingFixtures";

jest.mock("@/context/BrandContext", () => ({
  useBrand: () => ({ appName: "Open Resto", primaryColor: "#0a7ea4" }),
}));

const ADDRESS = `${window.location.origin}/menu/r/tok-abc`;

beforeAll(() => setActiveLocale("en"));
afterAll(() => setActiveLocale(undefined));

describe("QrMenuPanel", () => {
  it("draws a code for the menu page of this instance, and prints the address under it", () => {
    render(<QrMenuPanel menu={preview().menu} menuToken="tok-abc" published={false} />);
    expect(screen.getByTestId("qr-url").props.children).toBe(ADDRESS);
    expect(screen.getByLabelText("QR code of your menu").props.source).toEqual({
      uri: svgToDataUri(qrToSvg(ADDRESS)),
    });
  });

  it("encodes a token that needs it", () => {
    render(<QrMenuPanel menu={preview().menu} menuToken="a b/c" published={false} />);
    expect(screen.getByTestId("qr-url").props.children).toBe(
      `${window.location.origin}/menu/r/a%20b%2Fc`
    );
  });

  it("says the code only works once published, and that it works once it is", () => {
    const { rerender } = render(
      <QrMenuPanel menu={preview().menu} menuToken="tok-abc" published={false} />
    );
    expect(
      screen.getByText("This code will only work once your restaurant is published.")
    ).toBeTruthy();

    rerender(<QrMenuPanel menu={preview().menu} menuToken="tok-abc" published />);
    expect(screen.getByText("This code is live: your guests can scan it right now.")).toBeTruthy();
  });

  it("draws no code when the restaurant has no token", () => {
    render(<QrMenuPanel menu={preview().menu} menuToken={null} published={false} />);
    expect(screen.queryByTestId("qr-url")).toBeNull();
    expect(screen.queryByLabelText("QR code of your menu")).toBeNull();
  });

  it("lists the categories and dishes, with a price in euros or 'price on request'", () => {
    render(<QrMenuPanel menu={preview().menu} menuToken="tok-abc" published={false} />);
    expect(screen.getByText("Entrées")).toBeTruthy();
    expect(screen.getByText("Croquettes aux crevettes")).toBeTruthy();
    expect(screen.getByText("Maison")).toBeTruthy();
    expect(screen.getByText("€14.50")).toBeTruthy();
    expect(screen.getByText("Soupe du jour")).toBeTruthy();
    expect(screen.getByText("Price on request")).toBeTruthy();
  });

  it("says the menu is empty when it has no category", () => {
    render(
      <QrMenuPanel
        menu={{ menuId: null, name: "Carte", categories: [] }}
        menuToken="tok-abc"
        published={false}
      />
    );
    expect(screen.getByTestId("qr-menu-empty")).toHaveTextContent(
      'Your menu is empty. Go back to the "Menu" step to add dishes.'
    );
  });

  it("copes with rows the server sent without ids", () => {
    render(
      <QrMenuPanel
        menu={{
          menuId: null,
          name: "Carte",
          categories: [
            { name: "Plats", items: [{ name: "Stoemp", description: null, priceMinor: 1700 }] },
          ],
        }}
        menuToken="tok-abc"
        published={false}
      />
    );
    expect(screen.getByText("Stoemp")).toBeTruthy();
    expect(screen.getByText("€17.00")).toBeTruthy();
  });
});
