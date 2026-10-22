/**
 * @jest-environment jsdom
 */
import React from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react-native";
import { Platform } from "react-native";
import { PublicMenuScreen } from "@/components/menu/PublicMenuScreen";
import {
  fetchPublicMenu,
  type PublicMenu,
  type PublicMenuItem,
  type PublicMenuOutcome,
  type PublicMenuResponse,
} from "@/api/menus";
import { useRouteDefaultLocale } from "@/context/LocaleContext";
import * as useAppThemeModule from "@/hooks/use-app-theme";
import { MENU_FILTER_STORAGE_KEY } from "@/hooks/use-menu-filter";
import { StorageService } from "@/services/storage";
import i18n from "@/i18n";

jest.mock("@/api/menus", () => ({ fetchPublicMenu: jest.fn() }));

jest.mock("@/context/LocaleContext", () => ({
  useRouteDefaultLocale: jest.fn(),
  useLocale: () => ({ locale: "en", setLocale: jest.fn() }),
}));

jest.mock("@/components/common/LanguageSwitcher", () => {
  const ReactLib = require("react");
  const { View } = require("react-native");
  return { __esModule: true, default: () => ReactLib.createElement(View, { testID: "language" }) };
});

jest.mock("@/components/menu/MenuPhoto", () => {
  const ReactLib = require("react");
  const { View } = require("react-native");
  return {
    MenuPhoto: (props: { uri: string }) =>
      ReactLib.createElement(View, { testID: "menu-photo", ...props }),
  };
});

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 20, left: 0, right: 0 }),
}));

const mockFetch = fetchPublicMenu as jest.Mock;

const dish = (name: string, over: Partial<PublicMenuItem> = {}): PublicMenuItem => ({
  name,
  description: null,
  priceMinor: 900,
  imageUrl: null,
  availability: "Available",
  allergens: [],
  dietaryTags: [],
  ...over,
});

const lunch: PublicMenu = {
  name: "Lunch",
  description: "Served until 3pm",
  currency: "EUR",
  categories: [
    {
      name: "Starters",
      description: "To share",
      items: [
        dish("Leek tart", { dietaryTags: ["Vegetarian"], allergens: ["Gluten"] }),
        dish("Vegan bowl", { dietaryTags: ["Vegan"] }),
        dish("Pâté", { allergens: ["Eggs"] }),
      ],
    },
    {
      name: "Mains",
      description: null,
      items: [
        dish("Steak", { allergens: ["Milk"] }),
        dish("Fish of the day", { availability: "SoldOut", allergens: ["Fish"] }),
      ],
    },
    {
      name: "Desserts",
      description: null,
      items: [dish("Crème brûlée", { allergens: ["Eggs", "Milk"], priceMinor: 0 })],
    },
  ],
};

const dinner: PublicMenu = {
  name: "Dinner",
  description: null,
  currency: "EUR",
  categories: [{ name: "Tasting", description: null, items: [dish("Seven courses")] }],
};

const response = (
  menus: PublicMenu[] = [lunch],
  over: Partial<PublicMenuResponse> = {}
): PublicMenuResponse => ({
  restaurant: { id: 7, name: "Chez Paul", timezone: "Europe/Paris" },
  table: null,
  menus,
  ...over,
});

const ok = (menus?: PublicMenu[], over?: Partial<PublicMenuResponse>): PublicMenuOutcome => ({
  status: "ok",
  menu: response(menus, over),
});

async function showMenu(outcome: PublicMenuOutcome = ok()) {
  mockFetch.mockResolvedValue(outcome);
  const view = render(<PublicMenuScreen kind="r" token="tok" />);
  await screen.findByTestId("menu-restaurant-name");
  return view;
}

const dishNames = () =>
  screen
    .queryAllByTestId("menu-item")
    .map((row) => within(row).getAllByText(/./)[0].props.children);
const categoryNames = () =>
  screen
    .queryAllByTestId("menu-category")
    .map((c) => within(c).getAllByText(/./)[0].props.children);

describe("PublicMenuScreen", () => {
  const originalOS = Platform.OS;

  beforeEach(() => {
    jest.clearAllMocks();
    document.title = "";
  });

  afterEach(async () => {
    Object.defineProperty(Platform, "OS", { value: originalOS, configurable: true });
    await act(async () => {
      await i18n.changeLanguage("en");
    });
  });

  describe("loading and failure states", () => {
    it("says it is loading while the menu is on its way, and asks for it by kind and token", () => {
      mockFetch.mockReturnValue(new Promise(() => {}));
      render(<PublicMenuScreen kind="t" token="table-token" />);
      expect(screen.getByText("Loading the menu…")).toBeTruthy();
      expect(screen.queryByTestId("menu-restaurant-name")).toBeNull();
      expect(mockFetch).toHaveBeenCalledWith("t", "table-token");
    });

    it("opens in French for a guest who has not picked a language", () => {
      mockFetch.mockReturnValue(new Promise(() => {}));
      render(<PublicMenuScreen kind="r" token="tok" />);
      expect(useRouteDefaultLocale).toHaveBeenCalledWith("fr");
    });

    it("shows one unavailable state for a menu the server answers 404 for", async () => {
      mockFetch.mockResolvedValue({ status: "notFound" });
      render(<PublicMenuScreen kind="r" token="gone" />);
      expect(await screen.findByText("Menu unavailable")).toBeTruthy();
      expect(
        screen.getByText("This menu isn’t available right now. Please ask a member of staff.")
      ).toBeTruthy();
      expect(screen.queryByText("Try again")).toBeNull();
      expect(screen.queryByTestId("menu-book")).toBeNull();
    });

    it("tells a network failure apart and offers to try again", async () => {
      mockFetch.mockResolvedValue({ status: "error" });
      render(<PublicMenuScreen kind="r" token="tok" />);
      expect(await screen.findByText("Couldn’t load the menu")).toBeTruthy();
      expect(screen.getByText("Check your connection and try again.")).toBeTruthy();
      expect(screen.queryByText("Menu unavailable")).toBeNull();
      expect(screen.getByText("Try again")).toBeTruthy();
    });

    it("asks again on Try again and shows the menu once it answers", async () => {
      mockFetch.mockResolvedValueOnce({ status: "error" }).mockResolvedValueOnce(ok());
      render(<PublicMenuScreen kind="r" token="tok" />);
      fireEvent.press(await screen.findByText("Try again"));

      expect(await screen.findByTestId("menu-restaurant-name")).toBeTruthy();
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(screen.queryByText("Couldn’t load the menu")).toBeNull();
    });

    it("shows the loading state again while a retry is in flight", async () => {
      let resolveRetry: (outcome: PublicMenuOutcome) => void = () => {};
      mockFetch
        .mockResolvedValueOnce({ status: "error" })
        .mockReturnValueOnce(new Promise((resolve) => (resolveRetry = resolve)));
      render(<PublicMenuScreen kind="r" token="tok" />);
      fireEvent.press(await screen.findByText("Try again"));

      expect(screen.getByText("Loading the menu…")).toBeTruthy();
      await act(async () => resolveRetry(ok()));
      expect(screen.getByTestId("menu-restaurant-name")).toBeTruthy();
    });

    it("ignores an answer that arrives after the screen has gone", async () => {
      let resolve: (outcome: PublicMenuOutcome) => void = () => {};
      mockFetch.mockReturnValue(new Promise((r) => (resolve = r)));
      const errors = jest.spyOn(console, "error").mockImplementation(() => {});
      const { unmount } = render(<PublicMenuScreen kind="r" token="tok" />);
      unmount();

      await act(async () => resolve(ok()));

      expect(errors).not.toHaveBeenCalled();
      errors.mockRestore();
    });

    it("keeps the answer for the token now on screen when an earlier one lands late", async () => {
      let resolveOld: (outcome: PublicMenuOutcome) => void = () => {};
      mockFetch
        .mockReturnValueOnce(new Promise((r) => (resolveOld = r)))
        .mockResolvedValueOnce(
          ok([dinner], { restaurant: { id: 8, name: "New Place", timezone: "UTC" } })
        );
      const { rerender } = render(<PublicMenuScreen kind="r" token="old" />);
      rerender(<PublicMenuScreen kind="r" token="new" />);
      expect(await screen.findByText("New Place")).toBeTruthy();

      await act(async () => resolveOld(ok()));

      expect(screen.getByText("New Place")).toBeTruthy();
      expect(screen.queryByText("Chez Paul")).toBeNull();
    });
  });

  describe("header", () => {
    it("shows the restaurant's name and the language picker", async () => {
      await showMenu();
      expect(screen.getByTestId("menu-restaurant-name").props.children).toBe("Chez Paul");
      expect(screen.getByTestId("language")).toBeTruthy();
    });

    it("shows a Table pill when the QR was a table's and the table has a name", async () => {
      await showMenu(ok([lunch], { table: { name: "12" } }));
      expect(screen.getByText("Table 12")).toBeTruthy();
    });

    it("shows no pill for a table without a name", async () => {
      await showMenu(ok([lunch], { table: { name: null } }));
      expect(screen.queryByText(/^Table/)).toBeNull();
    });

    it("shows no pill on the restaurant's own code", async () => {
      await showMenu(ok([lunch], { table: null }));
      expect(screen.queryByText(/^Table/)).toBeNull();
    });

    it("words the pill in the active language", async () => {
      await i18n.changeLanguage("de");
      await showMenu(ok([lunch], { table: { name: "7" } }));
      expect(
        screen.getByText(i18n.t("restaurant.publicMenu.tableLabel", { name: "7" }))
      ).toBeTruthy();
    });
  });

  describe("document title", () => {
    it("is the restaurant's name on web", async () => {
      Object.defineProperty(Platform, "OS", { value: "web", configurable: true });
      await showMenu();
      await waitFor(() => expect(document.title).toBe("Chez Paul — Menu"));
    });

    it("is left alone off web", async () => {
      Object.defineProperty(Platform, "OS", { value: "ios", configurable: true });
      await showMenu();
      expect(document.title).toBe("");
    });

    it("is not set before the restaurant is known", () => {
      Object.defineProperty(Platform, "OS", { value: "web", configurable: true });
      mockFetch.mockReturnValue(new Promise(() => {}));
      render(<PublicMenuScreen kind="r" token="tok" />);
      expect(document.title).toBe("");
    });
  });

  describe("menu switcher", () => {
    it("is absent with a single menu", async () => {
      await showMenu(ok([lunch]));
      expect(screen.queryAllByTestId("menu-tab")).toHaveLength(0);
    });

    it("lists every menu when there are several, the first selected", async () => {
      await showMenu(ok([lunch, dinner]));
      const tabs = screen.getAllByTestId("menu-tab");
      expect(tabs).toHaveLength(2);
      expect(within(tabs[0]).getByText("Lunch")).toBeTruthy();
      expect(tabs[0].props.accessibilityState).toEqual({ selected: true });
      expect(tabs[1].props.accessibilityState).toEqual({ selected: false });
      // react-native-web reads the aria prop, which native folds into the state above.
      const ariaSelected = screen
        .UNSAFE_getAllByProps({ testID: "menu-tab" })
        .map((node) => node.props["aria-selected"])
        .filter((value) => value !== undefined);
      expect(ariaSelected).toEqual([true, false]);
      expect(categoryNames()).toEqual(["Starters", "Mains", "Desserts"]);
    });

    it("draws the selected tab's label in what the theme says reads on the brand fill, not in a fixed white", async () => {
      const real = jest.requireActual("@/hooks/use-app-theme").useAppTheme;
      const spy = jest
        .spyOn(useAppThemeModule, "useAppTheme")
        .mockImplementation(() => ({ ...real(), onPrimary: "#123456" }));
      try {
        await showMenu(ok([lunch, dinner]));
        const [selected, other] = screen.getAllByTestId("menu-tab");
        expect(within(selected).getByText("Lunch")).toHaveStyle({ color: "#123456" });
        expect(within(other).getByText("Dinner")).not.toHaveStyle({ color: "#123456" });
      } finally {
        spy.mockRestore();
      }
    });

    it("switches the dishes shown, and the description, to the pressed menu", async () => {
      await showMenu(ok([lunch, dinner]));
      expect(screen.getByText("Served until 3pm")).toBeTruthy();

      fireEvent.press(screen.getAllByTestId("menu-tab")[1]);

      expect(screen.getAllByTestId("menu-tab")[1].props.accessibilityState).toEqual({
        selected: true,
      });
      expect(categoryNames()).toEqual(["Tasting"]);
      expect(dishNames()).toEqual(["Seven courses"]);
      expect(screen.queryByText("Served until 3pm")).toBeNull();
    });

    it("falls back to the last menu when the list shrinks under the selected tab", async () => {
      mockFetch.mockResolvedValueOnce(ok([lunch, dinner])).mockResolvedValueOnce(ok([lunch]));
      const { rerender } = render(<PublicMenuScreen kind="r" token="a" />);
      await screen.findByTestId("menu-restaurant-name");
      fireEvent.press(screen.getAllByTestId("menu-tab")[1]);

      rerender(<PublicMenuScreen kind="r" token="b" />);

      await waitFor(() => expect(categoryNames()).toEqual(["Starters", "Mains", "Desserts"]));
    });

    it("shows a menu's description only when it has one", async () => {
      await showMenu(ok([dinner]));
      expect(screen.queryByText("Served until 3pm")).toBeNull();
    });
  });

  describe("dishes", () => {
    it("lists every category with its dishes and its description", async () => {
      await showMenu();
      expect(categoryNames()).toEqual(["Starters", "Mains", "Desserts"]);
      expect(dishNames()).toEqual([
        "Leek tart",
        "Vegan bowl",
        "Pâté",
        "Steak",
        "Fish of the day",
        "Crème brûlée",
      ]);
      expect(screen.getByText("To share")).toBeTruthy();
    });

    it("keeps a sold-out dish listed and marked", async () => {
      await showMenu();
      expect(screen.getByText("Fish of the day")).toBeTruthy();
      expect(screen.getAllByText("Sold out")).toHaveLength(1);
    });

    it("marks it Épuisé when the active language is French", async () => {
      await i18n.changeLanguage("fr");
      await showMenu();
      expect(screen.getAllByText("Épuisé")).toHaveLength(1);
      expect(screen.queryByText("Sold out")).toBeNull();
    });

    it("prices a dish as an amount, as Free for 0, and as Price on request for null", async () => {
      const priced: PublicMenu = {
        ...lunch,
        categories: [
          {
            name: "Prices",
            description: null,
            items: [
              dish("Paid", { priceMinor: 1250 }),
              dish("Gift", { priceMinor: 0 }),
              dish("Ask", { priceMinor: null }),
            ],
          },
        ],
      };
      await showMenu(ok([priced]));
      expect(screen.getByText(/€\s?12\.50/)).toBeTruthy();
      expect(screen.getByText("Free")).toBeTruthy();
      expect(screen.getByText("Price on request")).toBeTruthy();
    });

    it("shows a photo only for a dish that has an image", async () => {
      const photographed: PublicMenu = {
        ...lunch,
        categories: [
          {
            name: "Photos",
            description: null,
            items: [dish("With", { imageUrl: "/media/with.jpg" }), dish("Without")],
          },
        ],
      };
      await showMenu(ok([photographed]));
      const photos = screen.getAllByTestId("menu-photo");
      expect(photos).toHaveLength(1);
      expect(photos[0].props.uri).toBe("/media/with.jpg");
    });

    it("says the menu is empty when it has no categories and no filter is set", async () => {
      await showMenu(ok([{ ...lunch, categories: [] }]));
      expect(screen.getByTestId("menu-empty").props.children).toBe("Nothing on this menu yet.");
    });

    it("says the same when the response carries no menu at all", async () => {
      await showMenu(ok([]));
      expect(screen.getByTestId("menu-empty").props.children).toBe("Nothing on this menu yet.");
      expect(screen.queryAllByTestId("menu-tab")).toHaveLength(0);
    });
  });

  describe("filters", () => {
    it("keeps the disclaimer out of sight until a filter is used", async () => {
      await showMenu();
      expect(screen.queryByTestId("menu-filters-disclaimer")).toBeNull();

      fireEvent.press(screen.getByTestId("menu-diet-Vegan"));
      expect(screen.getByTestId("menu-filters-disclaimer")).toBeTruthy();
    });

    it("shows the disclaimer once the allergen panel is open", async () => {
      await showMenu();
      fireEvent.press(screen.getByTestId("menu-allergens-toggle"));
      expect(screen.getByTestId("menu-filters-disclaimer")).toBeTruthy();
    });

    it("lets a vegan dish through a Vegetarian filter and hides what declares neither", async () => {
      await showMenu();
      fireEvent.press(screen.getByTestId("menu-diet-Vegetarian"));
      expect(dishNames()).toEqual(["Leek tart", "Vegan bowl"]);
    });

    it("does not let a vegetarian dish through a Vegan filter", async () => {
      await showMenu();
      fireEvent.press(screen.getByTestId("menu-diet-Vegan"));
      expect(dishNames()).toEqual(["Vegan bowl"]);
    });

    it("hides the dishes that declare an avoided allergen", async () => {
      await showMenu();
      fireEvent.press(screen.getByTestId("menu-allergens-toggle"));
      fireEvent.press(screen.getByTestId("menu-allergen-Gluten"));
      expect(dishNames()).not.toContain("Leek tart");
      expect(dishNames()).toEqual(
        expect.arrayContaining(["Vegan bowl", "Pâté", "Steak", "Fish of the day", "Crème brûlée"])
      );
    });

    describe("remembered between scans", () => {
      let getItem: jest.SpyInstance;
      let setItem: jest.SpyInstance;
      let removeItem: jest.SpyInstance;
      const remember = (value: unknown) =>
        getItem.mockImplementation((key: string) =>
          key === MENU_FILTER_STORAGE_KEY ? JSON.stringify(value) : null
        );

      beforeEach(() => {
        getItem = jest.spyOn(StorageService, "getItem").mockReturnValue(null);
        setItem = jest.spyOn(StorageService, "setItem").mockImplementation(() => {});
        removeItem = jest.spyOn(StorageService, "removeItem").mockImplementation(() => {});
      });

      afterEach(() => {
        getItem.mockRestore();
        setItem.mockRestore();
        removeItem.mockRestore();
      });

      it("opens already filtered, allergen panel showing the choice, for a guest who left one on", async () => {
        remember({ avoid: ["Eggs", "Milk"], diets: [] });
        await showMenu();

        expect(dishNames()).toEqual(["Leek tart", "Vegan bowl", "Fish of the day"]);
        expect(screen.getByTestId("menu-allergen-Eggs")).toBeTruthy();
        expect(screen.getByTestId("menu-filters-clear")).toBeTruthy();
      });

      it("opens unfiltered, panel folded, for a guest with nothing remembered", async () => {
        await showMenu();

        expect(dishNames()).toHaveLength(6);
        expect(screen.queryByTestId("menu-allergen-Eggs")).toBeNull();
      });

      it("remembers the allergen a guest ticks, for the next table", async () => {
        await showMenu();
        fireEvent.press(screen.getByTestId("menu-allergens-toggle"));
        fireEvent.press(screen.getByTestId("menu-allergen-Gluten"));

        expect(setItem).toHaveBeenLastCalledWith(
          MENU_FILTER_STORAGE_KEY,
          JSON.stringify({ avoid: ["Gluten"], diets: [] })
        );
      });

      it("forgets it once the guest clears the filter", async () => {
        remember({ avoid: ["Gluten"], diets: [] });
        await showMenu();
        fireEvent.press(screen.getByTestId("menu-filters-clear"));

        expect(removeItem).toHaveBeenCalledWith(MENU_FILTER_STORAGE_KEY);
        expect(dishNames()).toHaveLength(6);
      });
    });

    it("hides a dish declaring any one of several avoided allergens", async () => {
      await showMenu();
      fireEvent.press(screen.getByTestId("menu-allergens-toggle"));
      fireEvent.press(screen.getByTestId("menu-allergen-Eggs"));
      fireEvent.press(screen.getByTestId("menu-allergen-Milk"));
      expect(dishNames()).toEqual(["Leek tart", "Vegan bowl", "Fish of the day"]);
    });

    it("drops a category left with no dish", async () => {
      await showMenu();
      fireEvent.press(screen.getByTestId("menu-allergens-toggle"));
      fireEvent.press(screen.getByTestId("menu-allergen-Eggs"));
      fireEvent.press(screen.getByTestId("menu-allergen-Milk"));
      expect(categoryNames()).toEqual(["Starters", "Mains"]);
      expect(screen.queryByText("Desserts")).toBeNull();
    });

    it("says no dish matches, which is not the same as an empty menu", async () => {
      await showMenu();
      fireEvent.press(screen.getByTestId("menu-diet-Vegan"));
      fireEvent.press(screen.getByTestId("menu-diet-GlutenFree"));
      expect(screen.getByTestId("menu-empty").props.children).toBe("No dish matches your filters.");
      expect(screen.queryByText("Nothing on this menu yet.")).toBeNull();
    });

    it("brings every dish back when the filters are cleared", async () => {
      await showMenu();
      fireEvent.press(screen.getByTestId("menu-diet-Vegan"));
      expect(dishNames()).toEqual(["Vegan bowl"]);

      fireEvent.press(screen.getByTestId("menu-filters-clear"));
      expect(dishNames()).toHaveLength(6);
      expect(screen.queryByTestId("menu-empty")).toBeNull();
    });

    it("keeps the filter when the guest moves to another menu that declares something", async () => {
      const vegan: PublicMenu = {
        ...dinner,
        categories: [
          {
            name: "Tasting",
            description: null,
            items: [dish("Seven courses", { allergens: ["Fish"] })],
          },
        ],
      };
      await showMenu(ok([lunch, vegan]));
      fireEvent.press(screen.getByTestId("menu-diet-Vegan"));
      fireEvent.press(screen.getAllByTestId("menu-tab")[1]);
      expect(screen.getByTestId("menu-empty").props.children).toBe("No dish matches your filters.");
    });
  });

  describe("a menu that declares no allergen and no diet", () => {
    it("offers no filter, lists every dish and tells the guest the information is missing", async () => {
      await showMenu(ok([dinner]));

      expect(screen.queryByTestId("menu-diet-Vegan")).toBeNull();
      expect(screen.queryByTestId("menu-allergens-toggle")).toBeNull();
      expect(dishNames()).toEqual(["Seven courses"]);
      expect(screen.getByTestId("menu-no-declarations").props.children).toBe(
        "This restaurant has not listed the allergens or diets of its dishes. If you have an allergy, ask the staff before ordering."
      );
    });

    it("offers the filters, and no such notice, as soon as one dish declares an allergen or a diet", async () => {
      const oneDeclared: PublicMenu = {
        ...dinner,
        categories: [
          {
            name: "Tasting",
            description: null,
            items: [dish("Seven courses"), dish("Green plate", { dietaryTags: ["Vegan"] })],
          },
        ],
      };
      await showMenu(ok([oneDeclared]));

      expect(screen.getByTestId("menu-diet-Vegan")).toBeTruthy();
      expect(screen.queryByTestId("menu-no-declarations")).toBeNull();
    });

    it("does not let a filter remembered from another menu hide its dishes", async () => {
      const getItem = jest
        .spyOn(StorageService, "getItem")
        .mockImplementation((key: string) =>
          key === MENU_FILTER_STORAGE_KEY ? JSON.stringify({ avoid: [], diets: ["Vegan"] }) : null
        );
      try {
        await showMenu(ok([dinner]));

        expect(dishNames()).toEqual(["Seven courses"]);
        expect(screen.queryByTestId("menu-empty")).toBeNull();
      } finally {
        getItem.mockRestore();
      }
    });

    it("shows the filters again, still set, when the guest returns to a menu that declares", async () => {
      await showMenu(ok([lunch, dinner]));
      fireEvent.press(screen.getByTestId("menu-diet-Vegan"));

      fireEvent.press(screen.getAllByTestId("menu-tab")[1]);
      expect(dishNames()).toEqual(["Seven courses"]);
      expect(screen.getByTestId("menu-no-declarations")).toBeTruthy();

      fireEvent.press(screen.getAllByTestId("menu-tab")[0]);
      expect(dishNames()).toEqual(["Vegan bowl"]);
    });
  });

  describe("booking button", () => {
    it("opens the booking page of this restaurant, not the list of every restaurant", async () => {
      await showMenu();
      expect(screen.getByText("Book a table")).toBeTruthy();
      expect(mockPush).not.toHaveBeenCalled();

      fireEvent.press(screen.getByTestId("menu-book"));

      expect(mockPush).toHaveBeenCalledTimes(1);
      expect(mockPush).toHaveBeenCalledWith("/locations/7");
    });

    it("follows the restaurant the menu belongs to", async () => {
      await showMenu(
        ok([lunch], { restaurant: { id: 42, name: "Chez Paul", timezone: "Europe/Paris" } })
      );

      fireEvent.press(screen.getByTestId("menu-book"));

      expect(mockPush).toHaveBeenCalledWith("/locations/42");
    });

    it("words the button in the active language", async () => {
      await i18n.changeLanguage("fr");
      await showMenu();
      expect(screen.getByText("Réserver une table")).toBeTruthy();
    });
  });
});
