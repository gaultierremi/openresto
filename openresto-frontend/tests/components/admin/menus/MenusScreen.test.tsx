/**
 * @jest-environment jsdom
 */
import React from "react";
import { ActivityIndicator } from "react-native";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { MenusScreen } from "@/components/admin/menus/MenusScreen";
import * as menusApi from "@/api/menus";
import type { MenuDto } from "@/api/menus";
import { adminGetRestaurants } from "@/api/admin";
import { openExternal } from "@/utils/openExternal";
import { menu, ok, refused } from "@/tests/helpers/menuFixtures";

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
jest.mock("@/utils/openExternal", () => ({ openExternal: jest.fn() }));
jest.mock("@/api/admin", () => ({ adminGetRestaurants: jest.fn() }));
jest.mock("@/services/storage", () => ({
  StorageService: { getItem: jest.fn(() => null), setItem: jest.fn(), removeItem: jest.fn() },
}));
// A menu card has its own suite; here it is a stand-in that shows the props the screen hands it,
// can ask to be moved, and lets a test call the screen's tree patcher directly.
const mockCaptured: { onTree?: (patch: (menus: MenuDto[]) => MenuDto[]) => void } = {};
jest.mock("@/components/admin/menus/MenuCard", () => {
  const { Pressable, Text, View } = require("react-native");
  return {
    MenuCard: (props: {
      menu: { id: number; name: string };
      restaurantId: number;
      isFirst: boolean;
      isLast: boolean;
      reorderBusy: boolean;
      defaultOpen: boolean;
      onMove: (direction: -1 | 1) => void;
      onTree: (patch: (menus: unknown[]) => unknown[]) => void;
    }) => {
      mockCaptured.onTree = props.onTree as never;
      return (
        <View testID={`card-${props.menu.id}`}>
          <Text testID={`card-${props.menu.id}-state`}>
            {`${props.menu.name}|rid=${props.restaurantId}|first=${props.isFirst}|last=${props.isLast}|busy=${props.reorderBusy}|open=${props.defaultOpen}`}
          </Text>
          <Pressable testID={`card-${props.menu.id}-up`} onPress={() => props.onMove(-1)}>
            <Text>up</Text>
          </Pressable>
          <Pressable testID={`card-${props.menu.id}-down`} onPress={() => props.onMove(1)}>
            <Text>down</Text>
          </Pressable>
        </View>
      );
    },
  };
});
jest.mock("@/api/menus", () => ({
  ...jest.requireActual("@/api/menus"),
  adminListMenus: jest.fn(),
  adminCreateMenu: jest.fn(),
  adminReorderMenus: jest.fn(),
  adminGetPublicTokens: jest.fn(),
}));

const getRestaurants = adminGetRestaurants as jest.Mock;
const listMenus = menusApi.adminListMenus as jest.Mock;
const createMenu = menusApi.adminCreateMenu as jest.Mock;
const reorderMenus = menusApi.adminReorderMenus as jest.Mock;
const getTokens = menusApi.adminGetPublicTokens as jest.Mock;
const open = openExternal as jest.Mock;

const places = (...ids: number[]) => ids.map((id) => ({ id, name: `Place ${id}` }));
const menusNamed = (...ids: number[]): MenuDto[] =>
  ids.map((id, index) => menu({ id, name: `Menu ${id}`, sortOrder: index }));

const renderScreen = async (restaurants = places(1), menus: MenuDto[] = []): Promise<void> => {
  getRestaurants.mockResolvedValue(restaurants);
  listMenus.mockResolvedValue(ok(menus));
  render(<MenusScreen />);
  await waitFor(() => expect(screen.queryByTestId("menus-service-link")).toBeTruthy());
};

const press = async (testID: string) => {
  await act(async () => {
    fireEvent.press(screen.getByTestId(testID));
  });
};

const shownOrder = () =>
  screen.queryAllByTestId(/^card-\d+-state$/).map((node) => node.props.children as string);

beforeEach(() => jest.clearAllMocks());

describe("MenusScreen states", () => {
  it("shows a spinner and nothing else while the locations load", () => {
    getRestaurants.mockReturnValue(new Promise(() => {}));
    render(<MenusScreen />);
    expect(screen.UNSAFE_getByType(ActivityIndicator)).toBeTruthy();
    expect(screen.queryByTestId("menus-service-link")).toBeNull();
  });

  it("asks for a location when there is none", async () => {
    getRestaurants.mockResolvedValue([]);
    render(<MenusScreen />);
    expect(await screen.findByText("Add a location to start building a menu.")).toBeTruthy();
    expect(screen.queryByTestId("menus-service-link")).toBeNull();
    expect(listMenus).not.toHaveBeenCalled();
  });

  it("shows a spinner under the links while the menus load", async () => {
    getRestaurants.mockResolvedValue(places(1));
    listMenus.mockReturnValue(new Promise(() => {}));
    render(<MenusScreen />);
    await waitFor(() => expect(screen.queryByTestId("menus-service-link")).toBeTruthy());
    expect(screen.UNSAFE_getByType(ActivityIndicator)).toBeTruthy();
    expect(screen.queryByTestId("add-menu")).toBeNull();
  });

  it("says the menus could not be loaded when the call fails", async () => {
    getRestaurants.mockResolvedValue(places(1));
    listMenus.mockResolvedValue(refused("Network error."));
    render(<MenusScreen />);
    expect(
      await screen.findByText("Couldn’t load the menus. Check your connection and try again.")
    ).toBeTruthy();
    expect(screen.queryByTestId("add-menu")).toBeNull();
  });

  it("invites the first menu when the location has none, and still offers to add one", async () => {
    await renderScreen(places(1), []);
    expect(
      await screen.findByText(
        "No menu yet. Add your first one: guests see it as soon as you publish it."
      )
    ).toBeTruthy();
    expect(screen.getByTestId("add-menu")).toBeTruthy();
  });

  it("lists the menus of the selected location, each with its position", async () => {
    await renderScreen(places(1), menusNamed(1, 2, 3));
    expect(listMenus).toHaveBeenCalledWith(1);
    expect(await screen.findAllByTestId(/^card-\d+-state$/)).toHaveLength(3);
    expect(shownOrder()).toEqual([
      "Menu 1|rid=1|first=true|last=false|busy=false|open=false",
      "Menu 2|rid=1|first=false|last=false|busy=false|open=false",
      "Menu 3|rid=1|first=false|last=true|busy=false|open=false",
    ]);
    expect(
      screen.queryByText(
        "No menu yet. Add your first one: guests see it as soon as you publish it."
      )
    ).toBeNull();
  });
});

describe("MenusScreen location selector", () => {
  it("offers no selector for a single location", async () => {
    await renderScreen(places(1));
    expect(screen.queryByLabelText("Place 1")).toBeNull();
  });

  it("offers a selector for several, and loads the menus of the one picked", async () => {
    await renderScreen(places(1, 2), menusNamed(1));
    expect(screen.getByLabelText("Place 1")).toBeTruthy();
    listMenus.mockResolvedValue(ok(menusNamed(9)));
    await act(async () => {
      fireEvent.press(screen.getByLabelText("Place 2"));
    });
    expect(listMenus).toHaveBeenLastCalledWith(2);
    expect(
      await screen.findByText("Menu 9|rid=2|first=true|last=true|busy=false|open=false")
    ).toBeTruthy();
    expect(screen.queryByText(/^Menu 1\|/)).toBeNull();
  });

  it("ignores a slow answer for a location that is no longer selected", async () => {
    getRestaurants.mockResolvedValue(places(1, 2));
    let answerFirst: (value: unknown) => void = () => {};
    listMenus.mockReturnValueOnce(new Promise((resolve) => (answerFirst = resolve)));
    listMenus.mockResolvedValueOnce(ok(menusNamed(9)));
    render(<MenusScreen />);
    await screen.findByLabelText("Place 2");
    await act(async () => {
      fireEvent.press(screen.getByLabelText("Place 2"));
    });
    await screen.findByText(/^Menu 9\|/);
    await act(async () => answerFirst(ok(menusNamed(1))));
    expect(screen.queryByText(/^Menu 1\|/)).toBeNull();
    expect(screen.getByText(/^Menu 9\|/)).toBeTruthy();
  });

  it("drops a patch that lands while the menus are not loaded, and keeps the list once they are", async () => {
    await renderScreen(places(1, 2), menusNamed(1));
    await screen.findByText(/^Menu 1\|/);
    const lateCall = mockCaptured.onTree!;
    let answer: (value: unknown) => void = () => {};
    listMenus.mockReturnValue(new Promise((resolve) => (answer = resolve)));
    await act(async () => {
      fireEvent.press(screen.getByLabelText("Place 2"));
    });
    const patch = jest.fn((menus: MenuDto[]) => menus);
    act(() => lateCall(patch));
    expect(patch).not.toHaveBeenCalled();
    await act(async () => answer(ok(menusNamed(5))));
    expect(await screen.findByText(/^Menu 5\|/)).toBeTruthy();
  });
});

describe("MenusScreen creating a menu", () => {
  const submit = async (name: string) => {
    fireEvent.press(screen.getByTestId("add-menu"));
    fireEvent.changeText(screen.getByTestId("add-menu-name"), name);
    await press("add-menu-submit");
  };

  it("creates the menu in euros with no description and shows it open, after the others", async () => {
    await renderScreen(places(3), menusNamed(1));
    createMenu.mockResolvedValue(ok(menu({ id: 20, name: "Dinner" })));
    await submit("Dinner");
    expect(createMenu).toHaveBeenCalledWith(3, {
      name: "Dinner",
      description: null,
      currency: "EUR",
    });
    expect(shownOrder()).toEqual([
      "Menu 1|rid=3|first=true|last=false|busy=false|open=false",
      "Dinner|rid=3|first=false|last=true|busy=false|open=true",
    ]);
    expect(screen.queryByTestId("add-menu-name")).toBeNull();
  });

  it("shows the server's message, keeps the form and adds no menu when it is refused", async () => {
    await renderScreen(places(3), []);
    createMenu.mockResolvedValue(refused("Menu name cannot be empty."));
    await submit("Dinner");
    expect(screen.getByText("Menu name cannot be empty.")).toBeTruthy();
    expect(screen.getByTestId("add-menu-name").props.value).toBe("Dinner");
    expect(shownOrder()).toEqual([]);
  });
});

describe("MenusScreen reordering", () => {
  it("shows the new order at once, and keeps it once the server accepts it", async () => {
    await renderScreen(places(1), menusNamed(1, 2, 3));
    reorderMenus.mockResolvedValue(ok(null));
    await press("card-1-down");
    expect(reorderMenus).toHaveBeenCalledWith(1, [2, 1, 3]);
    expect(shownOrder().map((line) => line.split("|")[0])).toEqual(["Menu 2", "Menu 1", "Menu 3"]);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("moves a menu up as well as down", async () => {
    await renderScreen(places(1), menusNamed(1, 2, 3));
    reorderMenus.mockResolvedValue(ok(null));
    await press("card-3-up");
    expect(reorderMenus).toHaveBeenCalledWith(1, [1, 3, 2]);
  });

  it("locks every menu's arrows while the server has not answered", async () => {
    await renderScreen(places(1), menusNamed(1, 2));
    let answer: (value: unknown) => void = () => {};
    reorderMenus.mockReturnValue(new Promise((resolve) => (answer = resolve)));
    fireEvent.press(screen.getByTestId("card-1-down"));
    expect(shownOrder().every((line) => line.includes("busy=true"))).toBe(true);
    await act(async () => answer(ok(null)));
    expect(shownOrder().every((line) => line.includes("busy=false"))).toBe(true);
  });

  it("puts the menus back in their old order and says why when the server refuses", async () => {
    await renderScreen(places(1), menusNamed(1, 2, 3));
    reorderMenus.mockResolvedValue(refused("Could not reorder."));
    await press("card-1-down");
    expect(shownOrder().map((line) => line.split("|")[0])).toEqual(["Menu 1", "Menu 2", "Menu 3"]);
    expect(screen.getByText("Could not reorder.")).toBeTruthy();
  });

  it("clears the previous failure when the next move starts", async () => {
    await renderScreen(places(1), menusNamed(1, 2, 3));
    reorderMenus.mockResolvedValueOnce(refused("Could not reorder."));
    await press("card-1-down");
    expect(screen.getByText("Could not reorder.")).toBeTruthy();
    reorderMenus.mockResolvedValueOnce(ok(null));
    await press("card-1-down");
    expect(screen.queryByText("Could not reorder.")).toBeNull();
  });

  it("calls nothing for a move off either end of the list", async () => {
    await renderScreen(places(1), menusNamed(1, 2));
    await press("card-1-up");
    await press("card-2-down");
    expect(reorderMenus).not.toHaveBeenCalled();
  });
});

describe("MenusScreen links", () => {
  it("opens service mode", async () => {
    await renderScreen();
    fireEvent.press(screen.getByTestId("menus-service-link"));
    expect(mockPush).toHaveBeenCalledWith("/admin/menus/service");
  });

  it("opens the QR codes", async () => {
    await renderScreen();
    fireEvent.press(screen.getByTestId("menus-qr-link"));
    expect(mockPush).toHaveBeenCalledWith("/admin/qr-codes");
  });

  it("opens the public page of the selected location through its token", async () => {
    await renderScreen(places(4));
    getTokens.mockResolvedValue(ok({ restaurantToken: "tok en/1", tables: [] }));
    await press("menus-public-link");
    expect(getTokens).toHaveBeenCalledWith(4);
    expect(open).toHaveBeenCalledWith(`${window.location.origin}/menu/r/tok%20en%2F1`);
  });

  it("says so and opens nothing when the token cannot be fetched", async () => {
    await renderScreen(places(4));
    getTokens.mockResolvedValue(refused("Not allowed."));
    await press("menus-public-link");
    expect(screen.getByText("Not allowed.")).toBeTruthy();
    expect(open).not.toHaveBeenCalled();
  });
});
