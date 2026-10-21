/**
 * @jest-environment jsdom
 */
import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { SiteSettingsCard } from "@/components/admin/site/SiteSettingsCard";
import * as siteApi from "@/api/site";
import type { SaveSiteInput, SiteDto } from "@/api/site";
import { ok, refused, site } from "@/tests/helpers/siteFixtures";
import { useFakeClock } from "@/tests/helpers/menuFixtures";
import { MAX_TAGLINE_LENGTH } from "@/constants/site";

jest.setTimeout(20_000);

const mockPush = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock("@/context/BrandContext", () => ({
  useBrand: () => ({ appName: "Open Resto", primaryColor: "#0a7ea4" }),
}));
jest.mock("@/utils/haptics", () => ({
  haptics: { selection: jest.fn(), press: jest.fn(), outcome: jest.fn() },
}));
jest.mock("@/components/common/Select", () => {
  const { Pressable, Text } = require("react-native");
  return {
    __esModule: true,
    default: ({
      options,
      onSelect,
    }: {
      options: { label: string; value: string }[];
      onSelect: (value: string) => void;
    }) => (
      <Pressable testID="network-to-tiktok" onPress={() => onSelect("TikTok")}>
        <Text>{options.length}</Text>
      </Pressable>
    ),
  };
});
jest.mock("@/api/site", () => ({
  ...jest.requireActual("@/api/site"),
  adminSaveSite: jest.fn(),
}));

const save = siteApi.adminSaveSite as jest.Mock;
const RESTAURANT_ID = 7;

/** The card as the screen hosts it: the site it shows is whatever the last save answered. */
function Host({
  initial,
  onSiteSpy,
  onThemeChange,
}: {
  initial: SiteDto;
  onSiteSpy: (site: SiteDto) => void;
  onThemeChange: (theme: string) => void;
}) {
  const [current, setCurrent] = React.useState(initial);
  return (
    <SiteSettingsCard
      restaurantId={RESTAURANT_ID}
      site={current}
      onSite={(next) => {
        onSiteSpy(next);
        setCurrent(next);
      }}
      onThemeChange={onThemeChange}
    />
  );
}

const echo = (base: SiteDto) =>
  save.mockImplementation(async (_id: number, input: SaveSiteInput) =>
    ok({
      ...base,
      slug: input.slug,
      theme: input.theme,
      tagline: input.tagline,
      socialLinks: input.socialLinks,
      legal: input.legal,
    })
  );

function renderCard(base: SiteDto = site()) {
  const onSiteSpy = jest.fn();
  const onThemeChange = jest.fn();
  render(<Host initial={base} onSiteSpy={onSiteSpy} onThemeChange={onThemeChange} />);
  return { onSiteSpy, onThemeChange };
}

const flush = async () => {
  await act(async () => {
    jest.advanceTimersByTime(1000);
  });
};

const type = (testID: string, value: string) =>
  fireEvent.changeText(screen.getByTestId(testID), value);

beforeEach(() => jest.clearAllMocks());

describe("SiteSettingsCard", () => {
  useFakeClock();

  it("shows the saved values in their fields", () => {
    renderCard(
      site({
        tagline: "Cuisine belge",
        slug: "la-senne",
        legal: { name: "Senne SRL", companyNumber: "0123", vatNumber: "BE1", address: "Rue 1" },
      })
    );
    expect(screen.getByTestId("site-tagline").props.value).toBe("Cuisine belge");
    expect(screen.getByTestId("site-slug").props.value).toBe("la-senne");
    expect(screen.getByTestId("site-legal-name").props.value).toBe("Senne SRL");
    expect(screen.getByTestId("site-company-number").props.value).toBe("0123");
    expect(screen.getByTestId("site-vat-number").props.value).toBe("BE1");
    expect(screen.getByTestId("site-legal-address").props.value).toBe("Rue 1");
  });

  it("starts empty fields for a site that has none of them", () => {
    renderCard(
      site({
        tagline: null,
        legal: { name: null, companyNumber: null, vatNumber: null, address: null },
      })
    );
    expect(screen.getByTestId("site-tagline").props.value).toBe("");
    expect(screen.getByTestId("site-legal-name").props.value).toBe("");
  });

  it("saves nothing until something is edited", async () => {
    renderCard();
    await flush();
    expect(save).not.toHaveBeenCalled();
  });

  it("autosaves the whole payload once typing stops, and hands the answer up", async () => {
    const base = site();
    echo(base);
    const { onSiteSpy } = renderCard(base);
    type("site-tagline", "Bières d'abbaye");
    await flush();

    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(RESTAURANT_ID, {
      slug: "brasserie-test",
      theme: "Brasserie",
      tagline: "Bières d'abbaye",
      socialLinks: [],
      legal: { name: "Senne SRL", companyNumber: "0123.456.789", vatNumber: null, address: null },
    });
    expect(onSiteSpy).toHaveBeenCalledWith(expect.objectContaining({ tagline: "Bières d'abbaye" }));
    expect(screen.getByText("Saved")).toBeTruthy();
  });

  it("is one write for a burst of typing", async () => {
    echo(site());
    renderCard();
    type("site-tagline", "A");
    type("site-tagline", "AB");
    type("site-tagline", "ABC");
    await flush();
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0][1].tagline).toBe("ABC");
  });

  it("saves each of the legal fields", async () => {
    echo(site());
    renderCard();
    type("site-legal-name", "Nouvelle SRL");
    type("site-company-number", "9999");
    type("site-vat-number", "BE 9999");
    type("site-legal-address", "Rue Neuve 2");
    await flush();
    expect(save.mock.calls[0][1].legal).toEqual({
      name: "Nouvelle SRL",
      companyNumber: "9999",
      vatNumber: "BE 9999",
      address: "Rue Neuve 2",
    });
  });

  it("counts the tagline against its cap and stops typing at it", () => {
    renderCard(site({ tagline: "abcd" }));
    expect(screen.getByTestId("site-tagline-count")).toHaveTextContent("4 / 160 characters");
    expect(screen.getByTestId("site-tagline").props.maxLength).toBe(MAX_TAGLINE_LENGTH);
  });

  it("folds the address to lower case and turns spaces into hyphens as it is typed", async () => {
    echo(site());
    renderCard();
    type("site-slug", "Ma Brasserie");
    await flush();
    expect(screen.getByTestId("site-slug").props.value).toBe("ma-brasserie");
    expect(save.mock.calls[0][1].slug).toBe("ma-brasserie");
  });

  it("withholds an invalid address and says why, then saves once it is valid", async () => {
    echo(site());
    renderCard();
    type("site-slug", "ab");
    await flush();
    expect(save).not.toHaveBeenCalled();
    expect(screen.getByText(/The website address must be 3 to 60 characters/)).toBeTruthy();

    type("site-slug", "abc");
    await flush();
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("withholds a link that is not https, and a network listed twice", async () => {
    echo(site());
    renderCard(site({ socialLinks: [{ kind: "Facebook", url: "https://facebook.com/a" }] }));
    fireEvent.press(screen.getByTestId("site-social-add"));
    type("site-social-url-1", "http://insecure.example");
    await flush();
    expect(save).not.toHaveBeenCalled();
    expect(screen.getByText(/Every network link must be an https:\/\/ address/)).toBeTruthy();

    type("site-social-url-1", "https://instagram.com/x");
    fireEvent.press(screen.getAllByTestId("network-to-tiktok")[0]);
    fireEvent.press(screen.getAllByTestId("network-to-tiktok")[1]);
    await flush();
    expect(save).not.toHaveBeenCalled();
    expect(screen.getByText(/A network can only appear once/)).toBeTruthy();
  });

  it("does not save a row added but not yet filled", async () => {
    echo(site());
    renderCard();
    fireEvent.press(screen.getByTestId("site-social-add"));
    await flush();
    expect(save).not.toHaveBeenCalled();
  });

  it("withholds a company number with characters the server would refuse", async () => {
    echo(site());
    renderCard();
    type("site-company-number", "01_23");
    await flush();
    expect(save).not.toHaveBeenCalled();
    expect(screen.getByText(/only accept letters, digits, spaces/)).toBeTruthy();
  });

  it("lets a draft empty its legal identity", async () => {
    echo(site({ isPublished: false }));
    renderCard(site({ isPublished: false }));
    type("site-legal-name", "");
    await flush();
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("holds back emptying the legal identity of a live site", async () => {
    echo(site({ isPublished: true }));
    renderCard(site({ isPublished: true }));
    type("site-legal-name", "");
    await flush();
    expect(save).not.toHaveBeenCalled();
    expect(screen.getByText(/The website is live: the legal name and company number/)).toBeTruthy();
  });

  it("tells the preview which theme is chosen, and saves it", async () => {
    echo(site());
    const { onThemeChange } = renderCard();
    fireEvent.press(screen.getByTestId("site-theme-Gastronomique"));
    expect(onThemeChange).toHaveBeenCalledWith("Gastronomique");
    await flush();
    expect(save.mock.calls[0][1].theme).toBe("Gastronomique");
  });

  it("puts the fields and the preview's theme back when a save is undone", async () => {
    const base = site({ tagline: "Avant" });
    echo(base);
    const { onThemeChange } = renderCard(base);
    type("site-tagline", "Après");
    fireEvent.press(screen.getByTestId("site-theme-Cafe"));
    await flush();
    await act(async () => {
      fireEvent.press(screen.getByText("Undo"));
    });
    expect(screen.getByTestId("site-tagline").props.value).toBe("Avant");
    expect(onThemeChange).toHaveBeenLastCalledWith("Brasserie");
  });

  it("shows the server's message when a save is refused", async () => {
    save.mockResolvedValue(refused("Another website already uses this address."));
    renderCard();
    type("site-slug", "taken");
    await flush();
    expect(screen.getByText("Another website already uses this address.")).toBeTruthy();
  });

  it("shows the brand colour it paints with, and links to where it is set", () => {
    renderCard(site({ brandColor: "#b45309" }));
    expect(screen.getByText(/Main colour: #b45309, taken from the brand/)).toBeTruthy();
    fireEvent.press(screen.getByTestId("site-brand-link"));
    expect(mockPush).toHaveBeenCalledWith("/admin/settings/brand");
  });
});
