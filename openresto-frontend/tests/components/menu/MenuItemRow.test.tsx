import React from "react";
import { StyleSheet } from "react-native";
import { act, render, renderHook, screen } from "@testing-library/react-native";
import { MenuItemRow, usePriceLabel } from "@/components/menu/MenuItemRow";
import type { PublicMenuItem } from "@/api/menus";
import i18n from "@/i18n";
import { setActiveLocale } from "@/utils/locale";

jest.mock("@/components/menu/MenuPhoto", () => {
  const ReactLib = require("react");
  const { View } = require("react-native");
  return {
    MenuPhoto: (props: { uri: string; size: number }) =>
      ReactLib.createElement(View, { testID: "menu-photo", ...props }),
  };
});

const dish = (over: Partial<PublicMenuItem> = {}): PublicMenuItem => ({
  name: "Soupe à l’oignon",
  description: null,
  priceMinor: 1250,
  imageUrl: null,
  availability: "Available",
  allergens: [],
  dietaryTags: [],
  ...over,
});

describe("usePriceLabel", () => {
  afterEach(async () => {
    await act(async () => {
      await i18n.changeLanguage("en");
    });
    setActiveLocale("en");
  });

  const label = (minor: number | null, currency = "EUR") =>
    renderHook(() => usePriceLabel()).result.current(minor, currency);

  it("formats an amount in the currency, in the active language", () => {
    setActiveLocale("en");
    expect(label(1250)).toMatch(/€\s?12\.50/);
  });

  it("follows the active locale's number format", () => {
    setActiveLocale("fr");
    expect(label(1250)).toMatch(/12,50\s?€/);
  });

  it("says Free for 0", () => {
    expect(label(0)).toBe("Free");
  });

  it("says Price on request for null, which is not the same as free", () => {
    expect(label(null)).toBe("Price on request");
  });

  it("speaks the active UI language for the two words", async () => {
    await i18n.changeLanguage("fr");
    expect(label(0)).toBe("Offert");
    expect(label(null)).toBe("Prix sur demande");
  });
});

describe("MenuItemRow", () => {
  afterEach(async () => {
    await act(async () => {
      await i18n.changeLanguage("en");
    });
    setActiveLocale("en");
  });

  it("shows the name and the formatted price", () => {
    render(<MenuItemRow item={dish()} currency="EUR" />);
    expect(screen.getByText("Soupe à l’oignon")).toBeTruthy();
    expect(screen.getByText(/€\s?12\.50/)).toBeTruthy();
  });

  it("shows Free and Price on request in place of an amount", () => {
    const { rerender } = render(<MenuItemRow item={dish({ priceMinor: 0 })} currency="EUR" />);
    expect(screen.getByText("Free")).toBeTruthy();

    rerender(<MenuItemRow item={dish({ priceMinor: null })} currency="EUR" />);
    expect(screen.getByText("Price on request")).toBeTruthy();
    expect(screen.queryByText("Free")).toBeNull();
  });

  describe("sold-out mark", () => {
    it("keeps a sold-out dish in place and marks it", () => {
      render(<MenuItemRow item={dish({ availability: "SoldOut" })} currency="EUR" />);
      expect(screen.getByText("Soupe à l’oignon")).toBeTruthy();
      expect(screen.getByText("Sold out")).toBeTruthy();
    });

    const colorOf = (text: string | RegExp) =>
      StyleSheet.flatten(screen.getByText(text).props.style)?.color;

    it("greys the name and the price in the muted colour, not with opacity", () => {
      const { rerender } = render(<MenuItemRow item={dish()} currency="EUR" />);
      const availableName = colorOf("Soupe à l’oignon");

      rerender(<MenuItemRow item={dish({ availability: "SoldOut" })} currency="EUR" />);
      const muted = colorOf("Sold out");
      expect(muted).toBeTruthy();
      expect(colorOf("Soupe à l’oignon")).toBe(muted);
      expect(colorOf(/€\s?12\.50/)).toBe(muted);
      expect(colorOf("Soupe à l’oignon")).not.toBe(availableName);
    });

    it("never dims the row: opacity would halve the contrast of the allergen line", () => {
      render(
        <MenuItemRow
          item={dish({ availability: "SoldOut", allergens: ["Milk"], description: "Gratinée" })}
          currency="EUR"
        />
      );
      const opacityOf = (node: { props: { style?: unknown } }) =>
        StyleSheet.flatten(node.props.style as never)?.opacity;
      expect(opacityOf(screen.getByTestId("menu-item"))).toBeUndefined();
      expect(opacityOf(screen.getByText("Contains: Milk"))).toBeUndefined();
      expect(opacityOf(screen.getByText("Gratinée"))).toBeUndefined();
    });

    it("keeps the allergen line as readable on a sold-out dish as on an available one", () => {
      const { rerender } = render(
        <MenuItemRow item={dish({ allergens: ["Milk"] })} currency="EUR" />
      );
      const available = colorOf("Contains: Milk");

      rerender(
        <MenuItemRow item={dish({ availability: "SoldOut", allergens: ["Milk"] })} currency="EUR" />
      );
      expect(colorOf("Contains: Milk")).toBe(available);
    });

    it("does not mark an available dish", () => {
      render(<MenuItemRow item={dish()} currency="EUR" />);
      expect(screen.queryByText("Sold out")).toBeNull();
    });

    it("says Épuisé when the active language is French", async () => {
      await i18n.changeLanguage("fr");
      render(<MenuItemRow item={dish({ availability: "SoldOut" })} currency="EUR" />);
      expect(screen.getByText("Épuisé")).toBeTruthy();
      expect(screen.queryByText("Sold out")).toBeNull();
    });
  });

  describe("description", () => {
    it("is printed when there is one", () => {
      render(<MenuItemRow item={dish({ description: "Gratinée au comté" })} currency="EUR" />);
      expect(screen.getByText("Gratinée au comté")).toBeTruthy();
    });

    it("leaves no empty line without one", () => {
      render(<MenuItemRow item={dish({ description: null })} currency="EUR" />);
      expect(screen.queryByText("Gratinée au comté")).toBeNull();
    });
  });

  describe("dietary tags and allergens", () => {
    it("lists each dietary tag by its translated name", () => {
      render(<MenuItemRow item={dish({ dietaryTags: ["Vegan", "GlutenFree"] })} currency="EUR" />);
      expect(screen.getByText("Vegan")).toBeTruthy();
      expect(screen.getByText("Gluten-free")).toBeTruthy();
    });

    it("lists the allergens in one Contains line", () => {
      render(<MenuItemRow item={dish({ allergens: ["Milk", "Gluten"] })} currency="EUR" />);
      expect(screen.getByText("Contains: Milk, Gluten")).toBeTruthy();
    });

    it("shows neither with none declared", () => {
      render(<MenuItemRow item={dish()} currency="EUR" />);
      expect(screen.queryByText(/Contains/)).toBeNull();
      expect(screen.queryByText("Vegan")).toBeNull();
    });
  });

  describe("photo", () => {
    it("is shown only when the dish has an image", () => {
      render(<MenuItemRow item={dish({ imageUrl: "/media/dish.jpg" })} currency="EUR" />);
      const photo = screen.getByTestId("menu-photo");
      expect(photo.props.uri).toBe("/media/dish.jpg");
      expect(photo.props.size).toBe(76);
    });

    it("is left out without an image", () => {
      render(<MenuItemRow item={dish({ imageUrl: null })} currency="EUR" />);
      expect(screen.queryByTestId("menu-photo")).toBeNull();
    });
  });
});
