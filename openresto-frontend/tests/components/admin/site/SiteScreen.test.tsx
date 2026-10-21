/**
 * @jest-environment jsdom
 */
import React from "react";
import { ActivityIndicator, useWindowDimensions } from "react-native";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react-native";
import { SiteScreen } from "@/components/admin/site/SiteScreen";
import * as siteApi from "@/api/site";
import { adminGetRestaurants } from "@/api/admin";
import { ok, refused, site } from "@/tests/helpers/siteFixtures";

jest.setTimeout(20_000);

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn() }),
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
jest.mock("react-native/Libraries/Utilities/useWindowDimensions", () => ({
  __esModule: true,
  default: jest.fn(() => ({ width: 1400, height: 900, scale: 1, fontScale: 1 })),
}));
// Each card has its own suite; here it is a stand-in that shows the props the screen hands it.
const mockCaptured: { onSite?: (s: siteApi.SiteDto) => void; onThemeChange?: (t: string) => void } =
  {};
jest.mock("@/components/admin/site/SitePublishCard", () => {
  const { Text } = require("react-native");
  return {
    SitePublishCard: (p: { restaurantId: number; site: { slug: string }; onSite: never }) => {
      mockCaptured.onSite = p.onSite;
      return <Text testID="publish-card">{`publish|${p.restaurantId}|${p.site.slug}`}</Text>;
    },
  };
});
jest.mock("@/components/admin/site/SiteSettingsCard", () => {
  const { Text } = require("react-native");
  return {
    SiteSettingsCard: (p: { restaurantId: number; onThemeChange: never }) => {
      mockCaptured.onThemeChange = p.onThemeChange;
      return <Text testID="settings-card">{`settings|${p.restaurantId}`}</Text>;
    },
  };
});
jest.mock("@/components/admin/site/SiteImagesCard", () => {
  const { Text } = require("react-native");
  return { SiteImagesCard: () => <Text testID="images-card">images</Text> };
});
jest.mock("@/components/admin/site/SiteGalleryCard", () => {
  const { Text } = require("react-native");
  return { SiteGalleryCard: () => <Text testID="gallery-card">gallery</Text> };
});
jest.mock("@/components/admin/site/SitePreview", () => {
  const { Text } = require("react-native");
  return {
    SitePreview: (p: { restaurantId: number; theme: string; version: string | null }) => (
      <Text testID="preview">{`preview|${p.restaurantId}|${p.theme}|${p.version}`}</Text>
    ),
  };
});
jest.mock("@/api/site", () => ({ ...jest.requireActual("@/api/site"), adminGetSite: jest.fn() }));

const getRestaurants = adminGetRestaurants as jest.Mock;
const getSite = siteApi.adminGetSite as jest.Mock;
const dimensions = useWindowDimensions as jest.Mock;

const places = (...ids: number[]) => ids.map((id) => ({ id, name: `Place ${id}` }));

const renderScreen = async (restaurants = places(1), loaded = site()) => {
  getRestaurants.mockResolvedValue(restaurants);
  getSite.mockResolvedValue(ok(loaded));
  render(<SiteScreen />);
  await waitFor(() => expect(screen.queryByTestId("publish-card")).toBeTruthy());
};

beforeEach(() => {
  jest.clearAllMocks();
  dimensions.mockReturnValue({ width: 1400, height: 900, scale: 1, fontScale: 1 });
});

describe("SiteScreen states", () => {
  it("shows a spinner and nothing else while the locations load", () => {
    getRestaurants.mockReturnValue(new Promise(() => {}));
    render(<SiteScreen />);
    expect(screen.UNSAFE_getByType(ActivityIndicator)).toBeTruthy();
    expect(screen.queryByTestId("publish-card")).toBeNull();
  });

  it("asks for a location when there is none, and loads no site", async () => {
    getRestaurants.mockResolvedValue([]);
    render(<SiteScreen />);
    expect(await screen.findByText("Add a location to create its website.")).toBeTruthy();
    expect(getSite).not.toHaveBeenCalled();
  });

  it("shows a spinner while the site loads", async () => {
    getRestaurants.mockResolvedValue(places(1));
    getSite.mockReturnValue(new Promise(() => {}));
    render(<SiteScreen />);
    await waitFor(() => expect(getSite).toHaveBeenCalled());
    expect(screen.UNSAFE_getByType(ActivityIndicator)).toBeTruthy();
    expect(screen.queryByTestId("publish-card")).toBeNull();
  });

  it("says so when the site cannot be loaded, and shows no card", async () => {
    getRestaurants.mockResolvedValue(places(1));
    getSite.mockResolvedValue(refused("Network error."));
    render(<SiteScreen />);
    expect(await screen.findByText(/Couldn’t load the website/)).toBeTruthy();
    expect(screen.queryByTestId("publish-card")).toBeNull();
    expect(screen.queryByTestId("preview")).toBeNull();
  });

  it("hands the location and its site to every card", async () => {
    await renderScreen(places(4), site({ slug: "la-senne" }));
    expect(getSite).toHaveBeenCalledWith(4);
    expect(screen.getByTestId("publish-card")).toHaveTextContent("publish|4|la-senne");
    expect(screen.getByTestId("settings-card")).toHaveTextContent("settings|4");
    expect(screen.getByTestId("images-card")).toBeTruthy();
    expect(screen.getByTestId("gallery-card")).toBeTruthy();
  });
});

describe("SiteScreen locations", () => {
  it("offers no picker for a single location", async () => {
    await renderScreen(places(1));
    expect(screen.queryByRole("radio")).toBeNull();
  });

  it("loads the other location's site when it is picked", async () => {
    await renderScreen(places(1, 2));
    getSite.mockResolvedValue(ok(site({ slug: "other" })));

    await act(async () => {
      fireEvent.press(screen.getByRole("radio", { name: "Place 2" }));
    });

    await waitFor(() =>
      expect(screen.getByTestId("publish-card")).toHaveTextContent("publish|2|other")
    );
    expect(getSite).toHaveBeenLastCalledWith(2);
  });

  it("ignores a site that arrives for a location no longer selected", async () => {
    getRestaurants.mockResolvedValue(places(1, 2));
    let resolveFirst: (value: unknown) => void = () => {};
    getSite.mockReturnValueOnce(new Promise((resolve) => (resolveFirst = resolve)));
    render(<SiteScreen />);
    await waitFor(() => expect(getSite).toHaveBeenCalledWith(1));
    getSite.mockResolvedValue(ok(site({ slug: "second" })));
    await act(async () => {
      fireEvent.press(screen.getByRole("radio", { name: "Place 2" }));
    });
    await waitFor(() => expect(screen.getByTestId("publish-card")).toHaveTextContent(/second/));

    await act(async () => resolveFirst(ok(site({ slug: "first" }))));

    expect(screen.getByTestId("publish-card")).toHaveTextContent(/second/);
  });
});

describe("SiteScreen updates", () => {
  it("replaces its copy of the site with each answer a card hands up", async () => {
    await renderScreen(places(1), site({ slug: "avant" }));

    act(() => mockCaptured.onSite?.(site({ slug: "apres" })));

    expect(screen.getByTestId("publish-card")).toHaveTextContent("publish|1|apres");
  });

  it("ignores an answer that arrives while no site is shown", async () => {
    await renderScreen(places(1, 2));
    getSite.mockReturnValue(new Promise(() => {}));
    await act(async () => {
      fireEvent.press(screen.getByRole("radio", { name: "Place 2" }));
    });

    act(() => mockCaptured.onSite?.(site({ slug: "late" })));

    expect(screen.queryByTestId("publish-card")).toBeNull();
  });
});

describe("SiteScreen preview", () => {
  it("starts on the saved theme and the saved version", async () => {
    await renderScreen(places(1), site({ theme: "Cafe", updatedAt: "2026-10-20T12:00:00Z" }));
    expect(screen.getByTestId("preview")).toHaveTextContent("preview|1|Cafe|2026-10-20T12:00:00Z");
  });

  it("follows the theme chosen in the form before it is saved", async () => {
    await renderScreen(places(1), site({ theme: "Brasserie" }));

    act(() => mockCaptured.onThemeChange?.("Gastronomique"));

    expect(screen.getByTestId("preview")).toHaveTextContent(/\|Gastronomique\|/);
  });

  it("is drawn once on a wide viewport, in the settings page's aside rather than after the cards", async () => {
    await renderScreen();
    expect(screen.getAllByTestId("preview")).toHaveLength(1);
    expect(within(screen.getByTestId("site-stack")).queryByTestId("preview")).toBeNull();
  });

  it("comes after the cards, once, on a narrow viewport", async () => {
    dimensions.mockReturnValue({ width: 900, height: 900, scale: 1, fontScale: 1 });
    await renderScreen();
    expect(screen.getAllByTestId("preview")).toHaveLength(1);
    const stack = within(screen.getByTestId("site-stack"));
    expect(stack.getByTestId("preview")).toBeTruthy();
    const order = stack.getAllByTestId(/card|preview/).map((n) => n.props.testID);
    expect(order[order.length - 1]).toBe("preview");
  });

  it("switches layout when the window crosses the split width", async () => {
    dimensions.mockReturnValue({ width: 1099, height: 900, scale: 1, fontScale: 1 });
    await renderScreen();
    expect(within(screen.getByTestId("site-stack")).queryByTestId("preview")).toBeTruthy();
  });

  it("puts the preview beside the form at exactly the split width", async () => {
    dimensions.mockReturnValue({ width: 1100, height: 900, scale: 1, fontScale: 1 });
    await renderScreen();
    expect(within(screen.getByTestId("site-stack")).queryByTestId("preview")).toBeNull();
  });
});
