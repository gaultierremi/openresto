/**
 * @jest-environment jsdom
 */
import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { SitePublishCard } from "@/components/admin/site/SitePublishCard";
import * as siteApi from "@/api/site";
import { copyToClipboard } from "@/components/admin/settings/clipboard";
import { openExternal } from "@/utils/openExternal";
import { ok, refused, site } from "@/tests/helpers/siteFixtures";
import { useFakeClock } from "@/tests/helpers/menuFixtures";

jest.setTimeout(20_000);

jest.mock("@/context/BrandContext", () => ({
  useBrand: () => ({ appName: "Open Resto", primaryColor: "#0a7ea4" }),
}));
jest.mock("@/utils/haptics", () => ({
  haptics: { selection: jest.fn(), press: jest.fn(), outcome: jest.fn() },
}));
jest.mock("@/utils/openExternal", () => ({ openExternal: jest.fn() }));
jest.mock("@/components/admin/settings/clipboard", () => ({
  ...jest.requireActual("@/components/admin/settings/clipboard"),
  copyToClipboard: jest.fn(),
}));
jest.mock("@/api/site", () => ({
  ...jest.requireActual("@/api/site"),
  adminSetSitePublished: jest.fn(),
}));

const setPublished = siteApi.adminSetSitePublished as jest.Mock;
const copy = copyToClipboard as jest.Mock;
const open = openExternal as jest.Mock;

const RESTAURANT_ID = 7;

const renderCard = (over: Parameters<typeof site>[0] = {}) => {
  const onSite = jest.fn();
  render(<SitePublishCard restaurantId={RESTAURANT_ID} site={site(over)} onSite={onSite} />);
  return onSite;
};

const press = async (testID: string) => {
  await act(async () => {
    fireEvent.press(screen.getByTestId(testID));
  });
};

beforeEach(() => jest.clearAllMocks());

describe("SitePublishCard", () => {
  useFakeClock();

  describe("a draft with nothing missing", () => {
    it("says it is a draft and offers an enabled publish button, with no checklist", () => {
      renderCard();
      expect(screen.getByTestId("site-status")).toHaveTextContent("Draft");
      expect(
        screen.getByTestId("site-publish-button").props.accessibilityState.disabled
      ).toBeFalsy();
      expect(screen.queryByTestId("site-checklist")).toBeNull();
      expect(screen.queryByTestId("site-public-url")).toBeNull();
      expect(screen.queryByTestId("site-open")).toBeNull();
    });

    it("publishes, and hands the answer up", async () => {
      const live = site({ isPublished: true });
      setPublished.mockResolvedValue(ok(live));
      const onSite = renderCard();

      await press("site-publish-button");

      expect(setPublished).toHaveBeenCalledWith(RESTAURANT_ID, true);
      expect(onSite).toHaveBeenCalledWith(live);
    });

    it("shows the server's message when publishing is refused", async () => {
      setPublished.mockResolvedValue(refused("An archived location cannot have a live website."));
      const onSite = renderCard();

      await press("site-publish-button");

      expect(screen.getByText("An archived location cannot have a live website.")).toBeTruthy();
      expect(onSite).not.toHaveBeenCalled();
    });
  });

  describe("a draft with something missing", () => {
    it("lists each missing item as something to do", () => {
      renderCard({
        missing: ["legal.name", "legal.companyNumber", "contact.email", "instance.publicUrl"],
      });
      expect(
        screen.getByText(
          "Set the website address of this instance in Brand settings (the site's links and search listing need it)"
        )
      ).toBeTruthy();
      expect(screen.getByText("Enter the legal name (legal notice)")).toBeTruthy();
      expect(screen.getByText("Enter the company number (legal notice)")).toBeTruthy();
      expect(
        screen.getByText("Set a contact e-mail address, on the location or in the brand")
      ).toBeTruthy();
    });

    it.each(["legal.name", "legal.companyNumber", "contact.email", "instance.publicUrl"] as const)(
      "disables publishing while only %s is missing, and says why",
      async (field) => {
        renderCard({ missing: [field] });
        expect(screen.getByTestId("site-publish-button").props.accessibilityState.disabled).toBe(
          true
        );
        expect(
          screen.getByText("The button unlocks as soon as the list above is empty.")
        ).toBeTruthy();

        await press("site-publish-button");
        expect(setPublished).not.toHaveBeenCalled();
      }
    );
  });

  describe("a live site", () => {
    it("says it is live, shows its public address, and offers to unpublish instead of publish", () => {
      renderCard({ isPublished: true });
      expect(screen.getByTestId("site-status")).toHaveTextContent("Live");
      expect(screen.getByTestId("site-public-url")).toHaveTextContent(
        `${window.location.origin}/r/brasserie-test`
      );
      expect(screen.getByTestId("site-unpublish")).toBeTruthy();
      expect(screen.queryByTestId("site-publish-button")).toBeNull();
    });

    it("unpublishes", async () => {
      const draft = site();
      setPublished.mockResolvedValue(ok(draft));
      const onSite = renderCard({ isPublished: true });

      await press("site-unpublish");

      expect(setPublished).toHaveBeenCalledWith(RESTAURANT_ID, false);
      expect(onSite).toHaveBeenCalledWith(draft);
    });

    it("can still be unpublished when its details have since gone missing", async () => {
      setPublished.mockResolvedValue(ok(site()));
      renderCard({ isPublished: true, missing: ["contact.email"] });
      expect(screen.getByTestId("site-checklist")).toBeTruthy();
      expect(
        screen.queryByText("The button unlocks as soon as the list above is empty.")
      ).toBeNull();

      await press("site-unpublish");
      expect(setPublished).toHaveBeenCalledWith(RESTAURANT_ID, false);
    });

    it("opens the public page", async () => {
      renderCard({ isPublished: true });
      await press("site-open");
      expect(open).toHaveBeenCalledWith(`${window.location.origin}/r/brasserie-test`);
    });

    it("confirms a copied link, then returns to its resting label", async () => {
      copy.mockResolvedValue(true);
      renderCard({ isPublished: true });
      expect(screen.getByText("Copy the link")).toBeTruthy();

      await press("site-copy");
      expect(copy).toHaveBeenCalledWith(`${window.location.origin}/r/brasserie-test`);
      expect(screen.getByText("Link copied")).toBeTruthy();

      await act(async () => {
        jest.advanceTimersByTime(2100);
      });
      expect(screen.getByText("Copy the link")).toBeTruthy();
    });

    it("does not claim a copy that did not land", async () => {
      copy.mockResolvedValue(false);
      renderCard({ isPublished: true });
      await press("site-copy");
      expect(screen.queryByText("Link copied")).toBeNull();
    });
  });
});
