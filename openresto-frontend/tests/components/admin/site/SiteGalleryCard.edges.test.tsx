/**
 * @jest-environment jsdom
 */
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { SiteGalleryCard } from "@/components/admin/site/SiteGalleryCard";
import * as siteApi from "@/api/site";
import { photo, site } from "@/tests/helpers/siteFixtures";

jest.setTimeout(20_000);

jest.mock("@/context/BrandContext", () => ({
  useBrand: () => ({ appName: "Open Resto", primaryColor: "#0a7ea4" }),
}));
jest.mock("@/utils/haptics", () => ({
  haptics: { selection: jest.fn(), press: jest.fn(), outcome: jest.fn() },
}));
// The real arrows are disabled at the ends of the list; this stand-in presses them anyway.
jest.mock("@/components/admin/menus/MoveButtons", () => {
  const { Pressable, Text } = require("react-native");
  return {
    MoveButtons: (props: { onMove: (direction: -1 | 1) => void; testIDPrefix: string }) => (
      <>
        <Pressable testID={`${props.testIDPrefix}-up`} onPress={() => props.onMove(-1)}>
          <Text>up</Text>
        </Pressable>
        <Pressable testID={`${props.testIDPrefix}-down`} onPress={() => props.onMove(1)}>
          <Text>down</Text>
        </Pressable>
      </>
    ),
  };
});
jest.mock("@/api/site", () => ({
  ...jest.requireActual("@/api/site"),
  adminReorderSitePhotos: jest.fn(),
}));

describe("SiteGalleryCard order at the ends of the list", () => {
  it("sends nothing when the first photo is moved up or the last one down", () => {
    render(
      <SiteGalleryCard
        restaurantId={7}
        site={site({ photos: [photo({ id: "a" }), photo({ id: "b" })] })}
        onSite={jest.fn()}
      />
    );

    fireEvent.press(screen.getByTestId("site-photo-a-up"));
    fireEvent.press(screen.getByTestId("site-photo-b-down"));

    expect(siteApi.adminReorderSitePhotos).not.toHaveBeenCalled();
  });
});
