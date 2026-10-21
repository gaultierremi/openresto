/**
 * @jest-environment jsdom
 */
import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { SiteImagesCard } from "@/components/admin/site/SiteImagesCard";
import * as siteApi from "@/api/site";
import { pickSiteImage } from "@/utils/siteImage";
import { ok, pickedFile, refused, site } from "@/tests/helpers/siteFixtures";

jest.setTimeout(20_000);

jest.mock("@/context/BrandContext", () => ({
  useBrand: () => ({ appName: "Open Resto", primaryColor: "#0a7ea4" }),
}));
jest.mock("@/utils/haptics", () => ({
  haptics: { selection: jest.fn(), press: jest.fn(), outcome: jest.fn() },
}));
jest.mock("@/components/menu/MenuPhoto", () => {
  const { Text } = require("react-native");
  return { MenuPhoto: ({ uri }: { uri: string }) => <Text testID="thumbnail">{uri}</Text> };
});
jest.mock("@/utils/siteImage", () => ({
  ...jest.requireActual("@/utils/siteImage"),
  pickSiteImage: jest.fn(),
}));
jest.mock("@/api/site", () => ({
  ...jest.requireActual("@/api/site"),
  adminUploadSiteImage: jest.fn(),
  adminDeleteSiteImage: jest.fn(),
}));

const upload = siteApi.adminUploadSiteImage as jest.Mock;
const remove = siteApi.adminDeleteSiteImage as jest.Mock;
const pick = pickSiteImage as jest.Mock;

const RESTAURANT_ID = 7;

const renderCard = (base = site()) => {
  const onSite = jest.fn();
  render(<SiteImagesCard restaurantId={RESTAURANT_ID} site={base} onSite={onSite} />);
  return onSite;
};

const press = async (testID: string) => {
  await act(async () => {
    fireEvent.press(screen.getByTestId(testID));
  });
};

beforeEach(() => jest.clearAllMocks());

describe("SiteImagesCard", () => {
  it("offers to add a logo and a cover when there are none, with nothing to remove", () => {
    renderCard();
    expect(screen.getByText("Add a logo")).toBeTruthy();
    expect(screen.getByText("Add a cover photo")).toBeTruthy();
    expect(screen.queryByTestId("thumbnail")).toBeNull();
    expect(screen.queryByTestId("site-image-logo-remove")).toBeNull();
    expect(screen.queryByTestId("site-image-cover-remove")).toBeNull();
  });

  it("shows each picture it has, and offers to replace or remove it", () => {
    renderCard(site({ logoUrl: "/media/site-logo-x.png", coverUrl: "/media/site-cover-y.jpg" }));
    expect(screen.getAllByTestId("thumbnail").map((n) => n.props.children)).toEqual([
      "/media/site-logo-x.png",
      "/media/site-cover-y.jpg",
    ]);
    expect(screen.getByText("Replace the logo")).toBeTruthy();
    expect(screen.getByText("Replace the photo")).toBeTruthy();
    expect(screen.getByText("Remove the logo")).toBeTruthy();
    expect(screen.getByText("Remove the photo")).toBeTruthy();
  });

  it.each(["logo", "cover"] as const)("uploads the chosen file to the %s slot", async (slot) => {
    const file = pickedFile();
    pick.mockResolvedValue({ file, refusal: null });
    const updated = site({ logoUrl: "/media/new.png" });
    upload.mockResolvedValue(ok(updated));
    const onSite = renderCard();

    await press(`site-image-${slot}-upload`);

    expect(upload).toHaveBeenCalledWith(RESTAURANT_ID, slot, file);
    expect(onSite).toHaveBeenCalledWith(updated);
  });

  it("does nothing when the chooser is dismissed", async () => {
    pick.mockResolvedValue(null);
    const onSite = renderCard();
    await press("site-image-logo-upload");
    expect(upload).not.toHaveBeenCalled();
    expect(onSite).not.toHaveBeenCalled();
  });

  it("refuses a file of the wrong type or size without reaching the server", async () => {
    const onSite = renderCard();

    pick.mockResolvedValue({ file: null, refusal: "type" });
    await press("site-image-logo-upload");
    expect(screen.getByText("Only JPEG, PNG, and WebP images are accepted.")).toBeTruthy();

    pick.mockResolvedValue({ file: null, refusal: "size" });
    await press("site-image-logo-upload");
    expect(screen.getByText("The picture must be under 6 MB.")).toBeTruthy();

    expect(upload).not.toHaveBeenCalled();
    expect(onSite).not.toHaveBeenCalled();
  });

  it("shows the server's message when an upload is refused, and keeps the screen's site", async () => {
    pick.mockResolvedValue({ file: pickedFile(), refusal: null });
    upload.mockResolvedValue(refused("That file is not a readable picture."));
    const onSite = renderCard();

    await press("site-image-cover-upload");

    expect(screen.getByText("That file is not a readable picture.")).toBeTruthy();
    expect(onSite).not.toHaveBeenCalled();
  });

  it("clears an earlier message when the next attempt starts", async () => {
    const onSite = renderCard();
    pick.mockResolvedValue({ file: null, refusal: "type" });
    await press("site-image-logo-upload");
    pick.mockResolvedValue({ file: pickedFile(), refusal: null });
    upload.mockResolvedValue(ok(site()));
    await press("site-image-logo-upload");

    expect(screen.queryByRole("alert")).toBeNull();
    expect(onSite).toHaveBeenCalled();
  });

  it.each(["logo", "cover"] as const)("removes the %s", async (slot) => {
    const updated = site();
    remove.mockResolvedValue(ok(updated));
    const onSite = renderCard(site({ logoUrl: "/media/a.png", coverUrl: "/media/b.jpg" }));

    await press(`site-image-${slot}-remove`);

    expect(remove).toHaveBeenCalledWith(RESTAURANT_ID, slot);
    expect(onSite).toHaveBeenCalledWith(updated);
  });

  it("shows the server's message when a removal is refused", async () => {
    remove.mockResolvedValue(refused("Network error."));
    renderCard(site({ logoUrl: "/media/a.png" }));
    await press("site-image-logo-remove");
    expect(screen.getByText("Network error.")).toBeTruthy();
  });
});
