/**
 * @jest-environment jsdom
 */
import React from "react";
import { ActivityIndicator } from "react-native";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { ServiceScreen } from "@/components/admin/menus/ServiceScreen";
import * as menusApi from "@/api/menus";
import type { MenuDto, MenuItemDto } from "@/api/menus";
import { adminGetRestaurants } from "@/api/admin";
import { haptics } from "@/utils/haptics";
import { category, item, menu, ok, refused } from "@/tests/helpers/menuFixtures";

const mockPush = jest.fn();
// The first render in a cold worker compiles half the component tree, which has been seen to
// take over the default five seconds when several suites start at once.
jest.setTimeout(20_000);

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush }),
  Stack: { Screen: () => null },
}));
jest.mock("@/context/BrandContext", () => ({
  useBrand: () => ({ appName: "Open Resto", primaryColor: "#0a7ea4" }),
}));
jest.mock("@/utils/haptics", () => ({
  haptics: { selection: jest.fn(), press: jest.fn(), outcome: jest.fn() },
}));
jest.mock("@/api/admin", () => ({ adminGetRestaurants: jest.fn() }));
jest.mock("@/services/storage", () => ({
  StorageService: { getItem: jest.fn(() => null), setItem: jest.fn(), removeItem: jest.fn() },
}));
jest.mock("@/api/menus", () => ({
  ...jest.requireActual("@/api/menus"),
  adminListMenus: jest.fn(),
  adminSetItemAvailability: jest.fn(),
}));

const getRestaurants = adminGetRestaurants as jest.Mock;
const listMenus = menusApi.adminListMenus as jest.Mock;
const setAvailability = menusApi.adminSetItemAvailability as jest.Mock;

const SOUP = item({ id: 1, name: "Soup", priceMinor: 850 });
const SALAD = item({ id: 2, name: "Salad", priceMinor: null, availability: "SoldOut" });
const SECRET = item({ id: 3, name: "Chef's secret", availability: "Hidden" });
const DRAFT = item({ id: 4, name: "Draft dish", availability: "SoldOut" });

/** A published menu with two live dishes and a hidden one, beside a draft that must stay out. */
const standardMenus = (): MenuDto[] => [
  menu({
    id: 1,
    name: "Lunch",
    isPublished: true,
    categories: [
      category({ id: 10, name: "Starters", items: [SOUP, SALAD, SECRET] }),
      category({
        id: 11,
        name: "Secrets",
        items: [item({ id: 5, name: "Hush", availability: "Hidden" })],
      }),
    ],
  }),
  menu({
    id: 2,
    name: "Next season",
    isPublished: false,
    categories: [category({ id: 12, name: "Autumn", items: [DRAFT] })],
  }),
];

const renderScreen = async (
  menus: MenuDto[] = standardMenus(),
  restaurants = [{ id: 1, name: "Place 1" }]
) => {
  getRestaurants.mockResolvedValue(restaurants);
  listMenus.mockResolvedValue(ok(menus));
  render(<ServiceScreen />);
  await screen.findByTestId("service-search");
  await waitFor(() => expect(screen.queryByTestId("service-item-1")).toBeTruthy());
};

const row = (id: number) => screen.getByTestId(`service-item-${id}`);
const isSoldOut = (id: number) => row(id).props.accessibilityState.checked as boolean;
const listedIds = () =>
  screen
    .queryAllByTestId(/^service-item-\d+$/)
    .map((node) => Number(String(node.props.testID).split("-").pop()));

const press = async (testID: string) => {
  await act(async () => {
    fireEvent.press(screen.getByTestId(testID));
  });
};

/** The server's answer to a flip: the dish as asked for. */
const echoFlip = () =>
  setAvailability.mockImplementation(
    async (_r: number, dish: MenuItemDto, next: MenuItemDto["availability"]) =>
      ok({ ...dish, availability: next })
  );

beforeEach(() => jest.clearAllMocks());

describe("ServiceScreen listing", () => {
  it("lists the dishes of the published menus, with their price", async () => {
    await renderScreen();
    expect(listedIds()).toEqual([1, 2]);
    expect(screen.getByText("Soup")).toBeTruthy();
    expect(screen.getByText("€8.50")).toBeTruthy();
    expect(screen.getByText("Price on request")).toBeTruthy();
    expect(screen.getByText("Starters")).toBeTruthy();
  });

  it("leaves out an unpublished menu and a hidden dish", async () => {
    await renderScreen();
    expect(screen.queryByText("Draft dish")).toBeNull();
    expect(screen.queryByText("Chef's secret")).toBeNull();
    expect(screen.queryByText("Autumn")).toBeNull();
  });

  it("leaves out a category whose dishes are all hidden", async () => {
    await renderScreen();
    expect(screen.queryByText("Secrets")).toBeNull();
    expect(screen.queryByText("Hush")).toBeNull();
  });

  it("names the menus only when more than one is published", async () => {
    await renderScreen();
    expect(screen.queryByText("Lunch")).toBeNull();
    screen.unmount();
    await renderScreen([
      menu({
        id: 1,
        name: "Lunch",
        isPublished: true,
        categories: [category({ id: 10, items: [SOUP] })],
      }),
      menu({
        id: 2,
        name: "Dinner",
        isPublished: true,
        categories: [category({ id: 11, name: "Mains", items: [item({ id: 6, name: "Steak" })] })],
      }),
    ]);
    expect(screen.getByText("Lunch")).toBeTruthy();
    expect(screen.getByText("Dinner")).toBeTruthy();
  });

  it("shows each dish's state in its label: available or sold out", async () => {
    await renderScreen();
    expect(isSoldOut(1)).toBe(false);
    expect(isSoldOut(2)).toBe(true);
    expect(screen.getAllByText("Available")).toHaveLength(1);
    expect(screen.getAllByText("Sold out").length).toBeGreaterThanOrEqual(1);
  });

  it("links back to the menu editor", async () => {
    await renderScreen();
    fireEvent.press(screen.getByTestId("service-back"));
    expect(mockPush).toHaveBeenCalledWith("/admin/menus");
  });
});

describe("ServiceScreen flipping a dish", () => {
  it("marks an available dish sold out at once, before the server has answered", async () => {
    await renderScreen();
    let answer: (value: unknown) => void = () => {};
    setAvailability.mockReturnValue(new Promise((resolve) => (answer = resolve)));
    fireEvent.press(row(1));
    expect(isSoldOut(1)).toBe(true);
    expect(haptics.press).toHaveBeenCalledTimes(1);
    expect(setAvailability).toHaveBeenCalledWith(1, SOUP, "SoldOut");
    await act(async () => answer(ok({ ...SOUP, availability: "SoldOut" })));
    expect(isSoldOut(1)).toBe(true);
  });

  it("puts a sold-out dish back on sale", async () => {
    await renderScreen();
    echoFlip();
    await press("service-item-2");
    expect(setAvailability).toHaveBeenCalledWith(1, SALAD, "Available");
    expect(isSoldOut(2)).toBe(false);
  });

  it("takes the flip back and says so when the server refuses", async () => {
    await renderScreen();
    setAvailability.mockResolvedValue(refused("Not today."));
    await press("service-item-1");
    expect(isSoldOut(1)).toBe(false);
    expect(screen.getByText("Couldn’t update “Soup”. It was left as it was.")).toBeTruthy();
  });

  it("clears the failure message when the next flip starts", async () => {
    await renderScreen();
    setAvailability.mockResolvedValueOnce(refused("Not today."));
    await press("service-item-1");
    expect(screen.getByText(/Couldn’t update/)).toBeTruthy();
    echoFlip();
    await press("service-item-1");
    expect(screen.queryByText(/Couldn’t update/)).toBeNull();
  });

  it("ignores a second press on a dish whose flip is still in flight, and takes the next one after", async () => {
    await renderScreen();
    let answer: (value: unknown) => void = () => {};
    setAvailability.mockReturnValueOnce(new Promise((resolve) => (answer = resolve)));
    fireEvent.press(row(1));
    fireEvent.press(row(1));
    expect(setAvailability).toHaveBeenCalledTimes(1);
    expect(haptics.press).toHaveBeenCalledTimes(1);
    expect(isSoldOut(1)).toBe(true);
    await act(async () => answer(ok({ ...SOUP, availability: "SoldOut" })));
    echoFlip();
    await press("service-item-1");
    expect(setAvailability).toHaveBeenCalledTimes(2);
    expect(setAvailability).toHaveBeenLastCalledWith(
      1,
      expect.objectContaining({ id: 1, availability: "SoldOut" }),
      "Available"
    );
    expect(isSoldOut(1)).toBe(false);
  });

  it("lets two different dishes be in flight at once", async () => {
    await renderScreen();
    setAvailability.mockReturnValue(new Promise(() => {}));
    fireEvent.press(row(1));
    fireEvent.press(row(2));
    expect(setAvailability).toHaveBeenCalledTimes(2);
  });

  it("copes with the answer to a flip landing after the location was switched", async () => {
    await renderScreen(standardMenus(), [
      { id: 1, name: "Place 1" },
      { id: 2, name: "Place 2" },
    ]);
    let answer: (value: unknown) => void = () => {};
    setAvailability.mockReturnValueOnce(new Promise((resolve) => (answer = resolve)));
    fireEvent.press(row(1));
    listMenus.mockReturnValue(new Promise(() => {}));
    await act(async () => {
      fireEvent.press(screen.getByLabelText("Place 2"));
    });
    await act(async () => answer(ok({ ...SOUP, availability: "SoldOut" })));
    expect(screen.UNSAFE_getByType(ActivityIndicator)).toBeTruthy();
    expect(screen.queryByTestId("service-item-1")).toBeNull();
  });
});

describe("ServiceScreen filter and search", () => {
  it("counts the sold-out dishes of the published menus only", async () => {
    await renderScreen();
    expect(screen.getByText("Sold out (1)")).toBeTruthy();
  });

  it("shows only sold-out dishes under the 'Sold out' filter, and everything again under 'All dishes'", async () => {
    await renderScreen();
    fireEvent.press(screen.getByTestId("service-filter-sold-out"));
    expect(listedIds()).toEqual([2]);
    expect(screen.getByTestId("service-filter-sold-out").props.accessibilityState.checked).toBe(
      true
    );
    fireEvent.press(screen.getByTestId("service-filter-all"));
    expect(listedIds()).toEqual([1, 2]);
    expect(screen.getByTestId("service-filter-all").props.accessibilityState.checked).toBe(true);
  });

  it("updates the count as dishes are flipped", async () => {
    await renderScreen();
    echoFlip();
    await press("service-item-1");
    expect(screen.getByText("Sold out (2)")).toBeTruthy();
  });

  it("searches by name, ignoring case and surrounding spaces", async () => {
    await renderScreen();
    fireEvent.changeText(screen.getByTestId("service-search"), "  SOU ");
    expect(listedIds()).toEqual([1]);
    fireEvent.changeText(screen.getByTestId("service-search"), "sAlAd");
    expect(listedIds()).toEqual([2]);
  });

  it("combines the search with the sold-out filter", async () => {
    await renderScreen();
    fireEvent.press(screen.getByTestId("service-filter-sold-out"));
    fireEvent.changeText(screen.getByTestId("service-search"), "soup");
    expect(listedIds()).toEqual([]);
    expect(screen.getByText("No dish matches.")).toBeTruthy();
  });

  it("never finds a hidden dish by searching for it", async () => {
    await renderScreen();
    fireEvent.changeText(screen.getByTestId("service-search"), "secret");
    expect(listedIds()).toEqual([]);
    expect(screen.getByText("No dish matches.")).toBeTruthy();
  });

  it("says so when nothing matches, and lists again once the search is cleared", async () => {
    await renderScreen();
    fireEvent.changeText(screen.getByTestId("service-search"), "zzz");
    expect(screen.getByText("No dish matches.")).toBeTruthy();
    fireEvent.changeText(screen.getByTestId("service-search"), "");
    expect(listedIds()).toEqual([1, 2]);
    expect(screen.queryByText("No dish matches.")).toBeNull();
  });
});

describe("ServiceScreen states", () => {
  it("shows a spinner while the locations load", () => {
    getRestaurants.mockReturnValue(new Promise(() => {}));
    render(<ServiceScreen />);
    expect(screen.UNSAFE_getByType(ActivityIndicator)).toBeTruthy();
    expect(screen.queryByTestId("service-search")).toBeNull();
  });

  it("asks for a location when there is none", async () => {
    getRestaurants.mockResolvedValue([]);
    render(<ServiceScreen />);
    expect(await screen.findByText("Add a location to start building a menu.")).toBeTruthy();
    expect(screen.queryByTestId("service-search")).toBeNull();
    expect(listMenus).not.toHaveBeenCalled();
  });

  it("shows a spinner under the search while the menus load", async () => {
    getRestaurants.mockResolvedValue([{ id: 1, name: "Place 1" }]);
    listMenus.mockReturnValue(new Promise(() => {}));
    render(<ServiceScreen />);
    await screen.findByTestId("service-search");
    expect(screen.UNSAFE_getByType(ActivityIndicator)).toBeTruthy();
  });

  it("says the menus could not be loaded when the call fails", async () => {
    getRestaurants.mockResolvedValue([{ id: 1, name: "Place 1" }]);
    listMenus.mockResolvedValue(refused("Network error."));
    render(<ServiceScreen />);
    expect(
      await screen.findByText("Couldn’t load the menus. Check your connection and try again.")
    ).toBeTruthy();
  });

  it("says nothing is published when the location has no menu", async () => {
    getRestaurants.mockResolvedValue([{ id: 1, name: "Place 1" }]);
    listMenus.mockResolvedValue(ok([]));
    render(<ServiceScreen />);
    expect(
      await screen.findByText(
        "No menu is published for this location. Publish one to manage it here."
      )
    ).toBeTruthy();
  });

  it("says nothing is published when every menu is a draft", async () => {
    getRestaurants.mockResolvedValue([{ id: 1, name: "Place 1" }]);
    listMenus.mockResolvedValue(
      ok([menu({ id: 2, isPublished: false, categories: [category({ items: [DRAFT] })] })])
    );
    render(<ServiceScreen />);
    expect(
      await screen.findByText(
        "No menu is published for this location. Publish one to manage it here."
      )
    ).toBeTruthy();
    expect(screen.queryByText("Draft dish")).toBeNull();
  });

  it("offers no location selector for a single location", async () => {
    await renderScreen();
    expect(screen.queryByLabelText("Place 1")).toBeNull();
  });

  it("offers a selector for several locations and loads the one picked", async () => {
    await renderScreen(standardMenus(), [
      { id: 1, name: "Place 1" },
      { id: 2, name: "Place 2" },
    ]);
    listMenus.mockResolvedValue(
      ok([
        menu({
          id: 9,
          isPublished: true,
          categories: [category({ id: 20, items: [item({ id: 30, name: "Pizza" })] })],
        }),
      ])
    );
    await act(async () => {
      fireEvent.press(screen.getByLabelText("Place 2"));
    });
    expect(listMenus).toHaveBeenLastCalledWith(2);
    expect(await screen.findByText("Pizza")).toBeTruthy();
    expect(screen.queryByText("Soup")).toBeNull();
  });

  it("ignores a slow answer for a location that is no longer selected", async () => {
    getRestaurants.mockResolvedValue([
      { id: 1, name: "Place 1" },
      { id: 2, name: "Place 2" },
    ]);
    let answerFirst: (value: unknown) => void = () => {};
    listMenus.mockReturnValueOnce(new Promise((resolve) => (answerFirst = resolve)));
    listMenus.mockResolvedValueOnce(
      ok([
        menu({
          id: 9,
          isPublished: true,
          categories: [category({ id: 20, items: [item({ id: 30, name: "Pizza" })] })],
        }),
      ])
    );
    render(<ServiceScreen />);
    await screen.findByLabelText("Place 2");
    await act(async () => {
      fireEvent.press(screen.getByLabelText("Place 2"));
    });
    await screen.findByText("Pizza");
    await act(async () => answerFirst(ok(standardMenus())));
    expect(screen.queryByText("Soup")).toBeNull();
    expect(screen.getByText("Pizza")).toBeTruthy();
  });
});
