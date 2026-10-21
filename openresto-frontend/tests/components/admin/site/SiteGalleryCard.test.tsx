/**
 * @jest-environment jsdom
 */
import React from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react-native";
import { SiteGalleryCard } from "@/components/admin/site/SiteGalleryCard";
import * as siteApi from "@/api/site";
import { pickSiteImage } from "@/utils/siteImage";
import { ok, photo, pickedFile, refused, site } from "@/tests/helpers/siteFixtures";
import { useFakeClock } from "@/tests/helpers/menuFixtures";
import { MAX_ALT_LENGTH, MAX_PHOTOS } from "@/constants/site";

jest.setTimeout(20_000);

jest.mock("@/context/BrandContext", () => ({
  useBrand: () => ({ appName: "Open Resto", primaryColor: "#0a7ea4" }),
}));
jest.mock("@/utils/haptics", () => ({
  haptics: { selection: jest.fn(), press: jest.fn(), outcome: jest.fn() },
}));
jest.mock("@/components/common/ConfirmModal", () => require("../../../../jest-mocks/ConfirmModal"));
jest.mock("@/components/menu/MenuPhoto", () => {
  const { Text } = require("react-native");
  return { MenuPhoto: ({ uri }: { uri: string }) => <Text>{`thumb:${uri}`}</Text> };
});
jest.mock("@/utils/siteImage", () => ({
  ...jest.requireActual("@/utils/siteImage"),
  pickSiteImage: jest.fn(),
}));
jest.mock("@/api/site", () => ({
  ...jest.requireActual("@/api/site"),
  adminAddSitePhoto: jest.fn(),
  adminUpdateSitePhotoAlt: jest.fn(),
  adminReorderSitePhotos: jest.fn(),
  adminDeleteSitePhoto: jest.fn(),
}));

const addPhoto = siteApi.adminAddSitePhoto as jest.Mock;
const updateAlt = siteApi.adminUpdateSitePhotoAlt as jest.Mock;
const reorder = siteApi.adminReorderSitePhotos as jest.Mock;
const deletePhoto = siteApi.adminDeleteSitePhoto as jest.Mock;
const pick = pickSiteImage as jest.Mock;

const RESTAURANT_ID = 7;

const photos = (count: number) =>
  Array.from({ length: count }, (_, i) =>
    photo({ id: `p${i}`, url: `/media/p${i}.jpg`, alt: `Photo ${i}` })
  );

const renderCard = (count = 0) => {
  const onSite = jest.fn();
  render(
    <SiteGalleryCard
      restaurantId={RESTAURANT_ID}
      site={site({ photos: photos(count) })}
      onSite={onSite}
    />
  );
  return onSite;
};

const flush = async () => {
  await act(async () => {
    jest.advanceTimersByTime(1000);
  });
};

const press = async (testID: string) => {
  await act(async () => {
    fireEvent.press(screen.getByTestId(testID));
  });
};

beforeEach(() => jest.clearAllMocks());

describe("SiteGalleryCard", () => {
  useFakeClock();

  describe("the count and the cap", () => {
    it("counts the photos against the recommended range and the cap", () => {
      renderCard(2);
      expect(screen.getByTestId("site-gallery-count")).toHaveTextContent(
        "2 photos out of 6 (3 to 6 recommended)"
      );
    });

    it("uses the singular for one photo", () => {
      renderCard(1);
      expect(screen.getByTestId("site-gallery-count")).toHaveTextContent(
        "1 photo out of 6 (3 to 6 recommended)"
      );
    });

    it("still offers to add the sixth photo", () => {
      renderCard(MAX_PHOTOS - 1);
      expect(screen.getByTestId("site-photo-add")).toBeTruthy();
      expect(screen.queryByTestId("site-gallery-full")).toBeNull();
    });

    it("stops offering to add at the seventh, and says why", () => {
      renderCard(MAX_PHOTOS);
      expect(screen.queryByTestId("site-photo-add")).toBeNull();
      expect(screen.getByTestId("site-gallery-full")).toHaveTextContent(
        "The gallery is full (6 photos). Delete a photo to add another."
      );
    });
  });

  describe("adding a photo", () => {
    const openForm = async () => {
      fireEvent.press(screen.getByTestId("site-photo-add"));
    };

    it("asks for the description first, and keeps the file chooser shut without one", async () => {
      renderCard();
      await openForm();
      expect(screen.getByTestId("site-photo-choose").props.accessibilityState.disabled).toBe(true);

      fireEvent.changeText(screen.getByTestId("site-photo-new-alt"), "   ");
      expect(screen.getByTestId("site-photo-choose").props.accessibilityState.disabled).toBe(true);

      fireEvent.changeText(screen.getByTestId("site-photo-new-alt"), "La salle");
      expect(screen.getByTestId("site-photo-choose").props.accessibilityState.disabled).toBeFalsy();
      expect(pick).not.toHaveBeenCalled();
    });

    it("limits the description to its cap", async () => {
      renderCard();
      await openForm();
      expect(screen.getByTestId("site-photo-new-alt").props.maxLength).toBe(MAX_ALT_LENGTH);
    });

    it("uploads the chosen file with the trimmed description, then closes the form", async () => {
      const file = pickedFile();
      pick.mockResolvedValue({ file, refusal: null });
      const updated = site({ photos: photos(1) });
      addPhoto.mockResolvedValue(ok(updated));
      const onSite = renderCard();
      await openForm();
      fireEvent.changeText(screen.getByTestId("site-photo-new-alt"), "  La salle  ");

      await press("site-photo-choose");

      expect(addPhoto).toHaveBeenCalledWith(RESTAURANT_ID, file, "La salle");
      expect(onSite).toHaveBeenCalledWith(updated);
      expect(screen.queryByTestId("site-photo-new-alt")).toBeNull();
      expect(screen.getByTestId("site-photo-add")).toBeTruthy();
    });

    it("keeps the form open, with the message, when the server refuses", async () => {
      pick.mockResolvedValue({ file: pickedFile(), refusal: null });
      addPhoto.mockResolvedValue(refused("A gallery holds at most 6 photos."));
      const onSite = renderCard();
      await openForm();
      fireEvent.changeText(screen.getByTestId("site-photo-new-alt"), "x");

      await press("site-photo-choose");

      expect(screen.getByText("A gallery holds at most 6 photos.")).toBeTruthy();
      expect(screen.getByTestId("site-photo-new-alt").props.value).toBe("x");
      expect(onSite).not.toHaveBeenCalled();
    });

    it("refuses a file of the wrong type or size before sending it", async () => {
      pick.mockResolvedValue({ file: null, refusal: "size" });
      renderCard();
      await openForm();
      fireEvent.changeText(screen.getByTestId("site-photo-new-alt"), "x");

      await press("site-photo-choose");

      expect(screen.getByText("The picture must be under 6 MB.")).toBeTruthy();
      expect(addPhoto).not.toHaveBeenCalled();
    });

    it("does nothing when the chooser is dismissed", async () => {
      pick.mockResolvedValue(null);
      renderCard();
      await openForm();
      fireEvent.changeText(screen.getByTestId("site-photo-new-alt"), "x");

      await press("site-photo-choose");

      expect(addPhoto).not.toHaveBeenCalled();
      expect(screen.getByTestId("site-photo-new-alt")).toBeTruthy();
    });

    it("closes and empties the form when it is cancelled", async () => {
      renderCard();
      await openForm();
      fireEvent.changeText(screen.getByTestId("site-photo-new-alt"), "x");
      fireEvent.press(screen.getByText("Cancel"));

      expect(screen.queryByTestId("site-photo-new-alt")).toBeNull();
      fireEvent.press(screen.getByTestId("site-photo-add"));
      expect(screen.getByTestId("site-photo-new-alt").props.value).toBe("");
    });
  });

  describe("a photo's description", () => {
    it("autosaves an edited description, trimmed, and hands the answer up", async () => {
      const updated = site({ photos: photos(1) });
      updateAlt.mockResolvedValue(ok(updated));
      const onSite = renderCard(1);

      fireEvent.changeText(screen.getByTestId("site-photo-alt-p0"), "  Une salle chaleureuse ");
      await flush();

      expect(updateAlt).toHaveBeenCalledWith(RESTAURANT_ID, "p0", "Une salle chaleureuse");
      expect(onSite).toHaveBeenCalledWith(updated);
    });

    it("withholds a blank description and says why, saving once it is filled", async () => {
      updateAlt.mockResolvedValue(ok(site()));
      renderCard(1);

      fireEvent.changeText(screen.getByTestId("site-photo-alt-p0"), "  ");
      await flush();
      expect(updateAlt).not.toHaveBeenCalled();
      expect(screen.getByText(/Describe the photo to save it/)).toBeTruthy();

      fireEvent.changeText(screen.getByTestId("site-photo-alt-p0"), "Nouvelle");
      await flush();
      expect(updateAlt).toHaveBeenCalledTimes(1);
    });

    it("shows the server's message when a save is refused", async () => {
      updateAlt.mockResolvedValue(refused("The photo description cannot exceed 140 characters."));
      renderCard(1);
      fireEvent.changeText(screen.getByTestId("site-photo-alt-p0"), "x");
      await flush();
      expect(screen.getByText("The photo description cannot exceed 140 characters.")).toBeTruthy();
    });

    it("puts the old description back when a save is undone", async () => {
      updateAlt.mockResolvedValue(ok(site({ photos: photos(1) })));
      renderCard(1);
      fireEvent.changeText(screen.getByTestId("site-photo-alt-p0"), "Autre");
      await flush();
      await act(async () => {
        fireEvent.press(screen.getByText("Undo"));
      });
      expect(screen.getByTestId("site-photo-alt-p0").props.value).toBe("Photo 0");
    });
  });

  describe("order", () => {
    it("moves a photo down by sending every id in the new order", async () => {
      const updated = site();
      reorder.mockResolvedValue(ok(updated));
      const onSite = renderCard(3);

      await press("site-photo-p0-move-down");

      expect(reorder).toHaveBeenCalledWith(RESTAURANT_ID, ["p1", "p0", "p2"]);
      expect(onSite).toHaveBeenCalledWith(updated);
    });

    it("moves a photo up", async () => {
      reorder.mockResolvedValue(ok(site()));
      renderCard(3);
      await press("site-photo-p2-move-up");
      expect(reorder).toHaveBeenCalledWith(RESTAURANT_ID, ["p0", "p2", "p1"]);
    });

    it("disables the arrow that would leave the list", () => {
      renderCard(3);
      expect(screen.getByTestId("site-photo-p0-move-up").props.accessibilityState.disabled).toBe(
        true
      );
      expect(screen.getByTestId("site-photo-p2-move-down").props.accessibilityState.disabled).toBe(
        true
      );
      expect(
        screen.getByTestId("site-photo-p1-move-up").props.accessibilityState.disabled
      ).toBeFalsy();
    });

    it("shows the message and keeps the order when the server refuses", async () => {
      reorder.mockResolvedValue(refused("The list must name every photo exactly once."));
      const onSite = renderCard(2);
      await press("site-photo-p0-move-down");
      expect(screen.getByText("The list must name every photo exactly once.")).toBeTruthy();
      expect(onSite).not.toHaveBeenCalled();
    });
  });

  describe("removing a photo", () => {
    it("asks first, and removes nothing when cancelled", async () => {
      renderCard(1);
      await press("site-photo-remove-p0");
      expect(screen.getByText(/The photo “Photo 0” will disappear/)).toBeTruthy();

      fireEvent.press(screen.getByText("Cancel"));
      expect(deletePhoto).not.toHaveBeenCalled();
      expect(screen.queryByTestId("confirm-modal")).toBeNull();
    });

    it("deletes the photo once confirmed", async () => {
      const updated = site();
      deletePhoto.mockResolvedValue(ok(updated));
      const onSite = renderCard(1);
      await press("site-photo-remove-p0");

      await act(async () => {
        fireEvent.press(within(screen.getByTestId("confirm-modal")).getByText("Delete"));
      });

      expect(deletePhoto).toHaveBeenCalledWith(RESTAURANT_ID, "p0");
      expect(onSite).toHaveBeenCalledWith(updated);
    });

    it("closes the question and shows the message when the removal is refused", async () => {
      deletePhoto.mockResolvedValue(refused("Network error."));
      const onSite = renderCard(1);
      await press("site-photo-remove-p0");

      await act(async () => {
        fireEvent.press(within(screen.getByTestId("confirm-modal")).getByText("Delete"));
      });

      expect(screen.getByText("Network error.")).toBeTruthy();
      expect(screen.queryByTestId("confirm-modal")).toBeNull();
      expect(onSite).not.toHaveBeenCalled();
    });
  });
});
