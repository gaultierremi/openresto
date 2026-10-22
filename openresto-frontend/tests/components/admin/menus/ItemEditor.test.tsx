/**
 * @jest-environment jsdom
 */
import React, { useState } from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react-native";
import { ItemEditor } from "@/components/admin/menus/ItemEditor";
import * as menusApi from "@/api/menus";
import type { MenuItemDto } from "@/api/menus";
import { PHOTO_MAX_BYTES } from "@/constants/menu";
import { pickFile } from "@/utils/pickFile";
import { item, ok, refused, useFakeClock } from "@/tests/helpers/menuFixtures";

// The first render in a cold worker compiles half the component tree, which has been seen to
// take over the default five seconds when several suites start at once.
jest.setTimeout(20_000);

jest.mock("@/context/BrandContext", () => ({
  useBrand: () => ({ appName: "Open Resto", primaryColor: "#0a7ea4" }),
}));
jest.mock("@/utils/haptics", () => ({
  haptics: { selection: jest.fn(), press: jest.fn(), outcome: jest.fn() },
}));
jest.mock("@/utils/pickFile", () => ({ pickFile: jest.fn() }));
jest.mock("@/components/common/ConfirmModal", () => require("../../../../jest-mocks/ConfirmModal"));
jest.mock("@/api/menus", () => ({
  ...jest.requireActual("@/api/menus"),
  adminUpdateItem: jest.fn(),
  adminSetItemAvailability: jest.fn(),
  adminUploadItemPhoto: jest.fn(),
  adminDeleteItemPhoto: jest.fn(),
  adminDeleteItem: jest.fn(),
}));

const update = menusApi.adminUpdateItem as jest.Mock;
const setAvailability = menusApi.adminSetItemAvailability as jest.Mock;
const upload = menusApi.adminUploadItemPhoto as jest.Mock;
const deletePhoto = menusApi.adminDeleteItemPhoto as jest.Mock;
const deleteItem = menusApi.adminDeleteItem as jest.Mock;
const pick = pickFile as jest.Mock;

const RESTAURANT_ID = 7;

/** The server's answer to an update: the dish as the payload described it. */
const echoUpdate = (base: MenuItemDto) =>
  update.mockImplementation(async (_r: number, _id: number, input: menusApi.SaveItemInput) =>
    ok({ ...base, ...input })
  );

/** Keeps the dish in state, as the screen's tree does, so a change to it re-renders the editor. */
function Host({
  initial,
  currency = "EUR",
  onDeleted = jest.fn(),
  seen,
}: {
  initial: MenuItemDto;
  currency?: string;
  onDeleted?: (id: number) => void;
  seen?: (item: MenuItemDto) => void;
}) {
  const [current, setCurrent] = useState(initial);
  return (
    <ItemEditor
      restaurantId={RESTAURANT_ID}
      item={current}
      currency={currency}
      onChanged={(next) => {
        seen?.(next);
        setCurrent(next);
      }}
      onDeleted={onDeleted}
    />
  );
}

const renderEditor = (
  initial: MenuItemDto = item(),
  extra: Partial<React.ComponentProps<typeof Host>> = {}
) => {
  const onDeleted = jest.fn();
  const seen = jest.fn();
  render(<Host initial={initial} onDeleted={onDeleted} seen={seen} {...extra} />);
  return { onDeleted, seen };
};

/** Runs out the autosave debounce and lets the save promise settle. */
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

const pickedFile = (type: string, size = 10) => new File([new Uint8Array(size)], "dish", { type });

beforeEach(() => {
  jest.clearAllMocks();
  echoUpdate(item());
});

describe("ItemEditor autosave", () => {
  useFakeClock();

  it("autosaves a translated dish and keeps its other language when the original language changes", async () => {
    renderEditor(
      item({
        primaryLanguage: "fr",
        translations: { en: { name: "Soup", description: "Vegetables" } },
      })
    );
    fireEvent.changeText(screen.getByTestId("item-translation-nl-name"), "Soep");
    await flush();
    expect(update).toHaveBeenLastCalledWith(
      RESTAURANT_ID,
      1,
      expect.objectContaining({
        primaryLanguage: "fr",
        translations: {
          nl: { name: "Soep", description: null },
          en: { name: "Soup", description: "Vegetables" },
        },
      })
    );
    fireEvent.press(screen.getByText("Français", { exact: true }));
    fireEvent.press(screen.getByText("Nederlands", { exact: true }));
    await flush();
    expect(update).toHaveBeenLastCalledWith(
      RESTAURANT_ID,
      1,
      expect.objectContaining({
        primaryLanguage: "nl",
        translations: expect.objectContaining({ en: { name: "Soup", description: "Vegetables" } }),
      })
    );
    expect(screen.getByTestId("item-translation-en-name").props.value).toBe("Soup");
    expect(screen.queryByTestId("item-translation-nl-name")).toBeNull();
  });

  it("shows the dish as it stands and saves nothing until a field changes", async () => {
    renderEditor(item({ name: "Soup", description: "Hot", priceMinor: 850, allergens: ["Milk"] }));
    expect(screen.getByTestId("item-name").props.value).toBe("Soup");
    expect(screen.getByTestId("item-description").props.value).toBe("Hot");
    expect(screen.getByTestId("item-price").props.value).toBe("8.50");
    await flush();
    expect(update).not.toHaveBeenCalled();
  });

  it("saves a new name with the canonical payload and reports it", async () => {
    const { seen } = renderEditor(item({ id: 5 }));
    fireEvent.changeText(screen.getByTestId("item-name"), "  Bisque  ");
    await flush();
    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith(RESTAURANT_ID, 5, {
      name: "Bisque",
      description: null,
      priceMinor: 850,
      availability: "Available",
      allergens: [],
      dietaryTags: [],
    });
    expect(seen).toHaveBeenCalledWith(expect.objectContaining({ name: "Bisque" }));
    expect(screen.getByText("Saved")).toBeTruthy();
  });

  it("saves a description, sending it trimmed and clearing it to null when emptied", async () => {
    renderEditor(item({ description: null }));
    fireEvent.changeText(screen.getByTestId("item-description"), " Warm ");
    await flush();
    expect(update).toHaveBeenLastCalledWith(
      RESTAURANT_ID,
      1,
      expect.objectContaining({ description: "Warm" })
    );
    fireEvent.changeText(screen.getByTestId("item-description"), "   ");
    await flush();
    expect(update).toHaveBeenLastCalledWith(
      RESTAURANT_ID,
      1,
      expect.objectContaining({ description: null })
    );
  });

  it("converts a typed price with a comma into minor units", async () => {
    renderEditor();
    fireEvent.changeText(screen.getByTestId("item-price"), "12,50");
    await flush();
    expect(update).toHaveBeenCalledWith(
      RESTAURANT_ID,
      1,
      expect.objectContaining({ priceMinor: 1250 })
    );
  });

  it("sends allergens and diets in the API's canonical order, whatever order they were ticked in", async () => {
    renderEditor();
    fireEvent.press(screen.getByTestId("item-allergen-Milk"));
    fireEvent.press(screen.getByTestId("item-allergen-Gluten"));
    fireEvent.press(screen.getByTestId("item-diet-Vegan"));
    fireEvent.press(screen.getByTestId("item-diet-Vegetarian"));
    await flush();
    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith(
      RESTAURANT_ID,
      1,
      expect.objectContaining({
        allergens: ["Gluten", "Milk"],
        dietaryTags: ["Vegetarian", "Vegan"],
      })
    );
  });

  it("unticks an allergen and a diet that were ticked", async () => {
    renderEditor(item({ allergens: ["Gluten", "Milk"], dietaryTags: ["Vegan"] }));
    fireEvent.press(screen.getByTestId("item-allergen-Gluten"));
    fireEvent.press(screen.getByTestId("item-diet-Vegan"));
    await flush();
    expect(update).toHaveBeenCalledWith(
      RESTAURANT_ID,
      1,
      expect.objectContaining({ allergens: ["Milk"], dietaryTags: [] })
    );
  });

  it("sends a null price once 'Price on request' is ticked, and locks the price field", async () => {
    renderEditor(item({ priceMinor: 850 }));
    fireEvent.press(screen.getByTestId("item-price-on-request"));
    expect(screen.getByTestId("item-price").props.editable).toBe(false);
    await flush();
    expect(update).toHaveBeenCalledWith(
      RESTAURANT_ID,
      1,
      expect.objectContaining({ priceMinor: null })
    );
  });

  it("opens a dish with no price as 'Price on request' with an empty, locked price field", () => {
    renderEditor(item({ priceMinor: null }));
    expect(screen.getByTestId("item-price").props.value).toBe("");
    expect(screen.getByTestId("item-price").props.editable).toBe(false);
  });

  it("saves nothing when 'Price on request' is ticked and unticked back to the stored price", async () => {
    renderEditor(item({ priceMinor: 850 }));
    fireEvent.press(screen.getByTestId("item-price-on-request"));
    fireEvent.press(screen.getByTestId("item-price-on-request"));
    await flush();
    expect(update).not.toHaveBeenCalled();
  });

  it("saves on request even while the price field holds an invalid price", async () => {
    renderEditor(item({ priceMinor: 850 }));
    fireEvent.changeText(screen.getByTestId("item-price"), "abc");
    fireEvent.press(screen.getByTestId("item-price-on-request"));
    await flush();
    expect(update).toHaveBeenCalledWith(
      RESTAURANT_ID,
      1,
      expect.objectContaining({ priceMinor: null })
    );
  });

  it("parses the price by the currency's own decimals", async () => {
    renderEditor(item({ priceMinor: 850 }), { currency: "JPY" });
    expect(screen.getByTestId("item-price").props.value).toBe("850");
    fireEvent.changeText(screen.getByTestId("item-price"), "900");
    await flush();
    expect(update).toHaveBeenCalledWith(
      RESTAURANT_ID,
      1,
      expect.objectContaining({ priceMinor: 900 })
    );
  });
});

describe("ItemEditor withheld saves", () => {
  useFakeClock();

  it("withholds the save while the name is empty and says why", async () => {
    renderEditor();
    fireEvent.changeText(screen.getByTestId("item-name"), "   ");
    await flush();
    expect(update).not.toHaveBeenCalled();
    expect(screen.getByText("Give the dish a name to save your changes.")).toBeTruthy();
  });

  it("withholds the save while the price is not a price and says why", async () => {
    renderEditor();
    fireEvent.changeText(screen.getByTestId("item-name"), "Bisque");
    fireEvent.changeText(screen.getByTestId("item-price"), "12.505");
    await flush();
    expect(update).not.toHaveBeenCalled();
    expect(
      screen.getByText("Enter a valid price, or tick “Price on request”, to save your changes.")
    ).toBeTruthy();
  });

  it("names the missing name first when both the name and the price are wrong", async () => {
    renderEditor();
    fireEvent.changeText(screen.getByTestId("item-name"), "");
    fireEvent.changeText(screen.getByTestId("item-price"), "nope");
    await flush();
    expect(update).not.toHaveBeenCalled();
    expect(screen.getByText("Give the dish a name to save your changes.")).toBeTruthy();
    expect(screen.queryByText(/Enter a valid price/)).toBeNull();
  });

  it("saves as soon as the offending field is corrected", async () => {
    renderEditor();
    fireEvent.changeText(screen.getByTestId("item-price"), "nope");
    await flush();
    expect(update).not.toHaveBeenCalled();
    fireEvent.changeText(screen.getByTestId("item-price"), "9");
    await flush();
    expect(update).toHaveBeenCalledWith(
      RESTAURANT_ID,
      1,
      expect.objectContaining({ priceMinor: 900 })
    );
    expect(screen.queryByText(/to save your changes/)).toBeNull();
  });
});

describe("ItemEditor save failures and undo", () => {
  useFakeClock();

  it("shows the server's message when a save is refused, and retries on request", async () => {
    update.mockResolvedValueOnce(refused("Name already used."));
    renderEditor();
    fireEvent.changeText(screen.getByTestId("item-name"), "Bisque");
    await flush();
    expect(screen.getByText("Name already used.")).toBeTruthy();
    echoUpdate(item());
    await act(async () => {
      fireEvent.press(screen.getByText("Retry"));
    });
    expect(update).toHaveBeenCalledTimes(2);
    expect(screen.getByText("Saved")).toBeTruthy();
  });

  it("puts the previous values back, price included, when a save is undone", async () => {
    renderEditor(item({ name: "Soup", priceMinor: 850, description: "Hot" }));
    echoUpdate(item({ name: "Soup", priceMinor: 850, description: "Hot" }));
    fireEvent.changeText(screen.getByTestId("item-name"), "Bisque");
    await flush();
    await act(async () => {
      fireEvent.press(screen.getByText("Undo"));
    });
    expect(screen.getByTestId("item-name").props.value).toBe("Soup");
    expect(screen.getByTestId("item-description").props.value).toBe("Hot");
    expect(screen.getByTestId("item-price").props.value).toBe("8.50");
    expect(update).toHaveBeenLastCalledWith(
      RESTAURANT_ID,
      1,
      expect.objectContaining({ name: "Soup", priceMinor: 850 })
    );
  });

  it("puts a 'Price on request' dish back to on request when a save is undone", async () => {
    renderEditor(item({ priceMinor: null, allergens: ["Milk"], dietaryTags: ["Vegan"] }));
    echoUpdate(item({ priceMinor: null, allergens: ["Milk"], dietaryTags: ["Vegan"] }));
    fireEvent.changeText(screen.getByTestId("item-name"), "Bisque");
    fireEvent.press(screen.getByTestId("item-allergen-Fish"));
    await flush();
    await act(async () => {
      fireEvent.press(screen.getByText("Undo"));
    });
    expect(screen.getByTestId("item-price").props.editable).toBe(false);
    expect(screen.getByTestId("item-price").props.value).toBe("");
    expect(screen.getByTestId("item-allergen-Fish").props.accessibilityState.checked).toBe(false);
    expect(screen.getByTestId("item-allergen-Milk").props.accessibilityState.checked).toBe(true);
    expect(screen.getByTestId("item-diet-Vegan").props.accessibilityState.checked).toBe(true);
  });
});

describe("ItemEditor availability", () => {
  useFakeClock();

  it("shows the dish's current availability as the selected choice", () => {
    renderEditor(item({ availability: "SoldOut" }));
    expect(screen.getByTestId("item-availability-SoldOut").props.accessibilityState.checked).toBe(
      true
    );
    expect(screen.getByTestId("item-availability-Available").props.accessibilityState.checked).toBe(
      false
    );
  });

  it("sets availability immediately through the availability call, not through the autosave", async () => {
    const dish = item({ id: 3 });
    setAvailability.mockResolvedValue(ok({ ...dish, availability: "SoldOut" }));
    const { seen } = renderEditor(dish);
    await press("item-availability-SoldOut");
    expect(setAvailability).toHaveBeenCalledWith(RESTAURANT_ID, dish, "SoldOut");
    expect(seen).toHaveBeenCalledWith(expect.objectContaining({ availability: "SoldOut" }));
    await flush();
    expect(update).not.toHaveBeenCalled();
  });

  it("does nothing when the choice already selected is pressed", async () => {
    renderEditor(item({ availability: "Hidden" }));
    await press("item-availability-Hidden");
    expect(setAvailability).not.toHaveBeenCalled();
  });

  it("says so and leaves the dish as it was when the server refuses the change", async () => {
    setAvailability.mockResolvedValue(refused("Not today."));
    const { seen } = renderEditor();
    await press("item-availability-Hidden");
    expect(screen.getByText("Not today.")).toBeTruthy();
    expect(seen).not.toHaveBeenCalled();
    expect(screen.getByTestId("item-availability-Available").props.accessibilityState.checked).toBe(
      true
    );
  });

  it("clears an earlier refusal when the next change goes through", async () => {
    setAvailability.mockResolvedValueOnce(refused("Not today."));
    renderEditor();
    await press("item-availability-Hidden");
    expect(screen.getByText("Not today.")).toBeTruthy();
    setAvailability.mockResolvedValueOnce(ok(item({ availability: "SoldOut" })));
    await press("item-availability-SoldOut");
    expect(screen.queryByText("Not today.")).toBeNull();
  });

  it("sends the dish's most recent availability when a text field saves afterwards", async () => {
    const dish = item();
    setAvailability.mockResolvedValue(ok({ ...dish, availability: "SoldOut" }));
    echoUpdate(dish);
    renderEditor(dish);
    fireEvent.changeText(screen.getByTestId("item-name"), "Bisque");
    await press("item-availability-SoldOut");
    await flush();
    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith(
      RESTAURANT_ID,
      1,
      expect.objectContaining({ name: "Bisque", availability: "SoldOut" })
    );
  });
});

describe("ItemEditor photo", () => {
  it("offers to add a photo, and no removal, when the dish has none", () => {
    renderEditor(item({ imageUrl: null }));
    expect(screen.getByText("Add a photo")).toBeTruthy();
    expect(screen.queryByTestId("item-photo-remove")).toBeNull();
  });

  it("offers to replace or remove the photo when the dish has one", () => {
    renderEditor(item({ imageUrl: "/media/menu-item-1.jpg" }));
    expect(screen.getByText("Replace photo")).toBeTruthy();
    expect(screen.getByTestId("item-photo-remove")).toBeTruthy();
  });

  it("does nothing when the file chooser is dismissed", async () => {
    pick.mockResolvedValue(null);
    renderEditor();
    await press("item-photo-upload");
    expect(upload).not.toHaveBeenCalled();
  });

  it("refuses an unsupported file type before any request is made", async () => {
    pick.mockResolvedValue(pickedFile("image/gif"));
    renderEditor();
    await press("item-photo-upload");
    expect(screen.getByText("Only JPEG, PNG, and WebP images are accepted.")).toBeTruthy();
    expect(upload).not.toHaveBeenCalled();
  });

  it("refuses a file one byte over 2 MB before any request is made", async () => {
    pick.mockResolvedValue(pickedFile("image/png", PHOTO_MAX_BYTES + 1));
    renderEditor();
    await press("item-photo-upload");
    expect(screen.getByText("Dish photo must be under 2 MB.")).toBeTruthy();
    expect(upload).not.toHaveBeenCalled();
  });

  it("accepts a file of exactly 2 MB", async () => {
    const file = pickedFile("image/webp", PHOTO_MAX_BYTES);
    pick.mockResolvedValue(file);
    upload.mockResolvedValue(ok(item({ imageUrl: "/media/menu-item-1.webp" })));
    const { seen } = renderEditor(item({ id: 4 }));
    await press("item-photo-upload");
    expect(upload).toHaveBeenCalledWith(RESTAURANT_ID, 4, file);
    expect(seen).toHaveBeenCalledWith(
      expect.objectContaining({ imageUrl: "/media/menu-item-1.webp" })
    );
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("asks the chooser for the three supported types only", async () => {
    pick.mockResolvedValue(null);
    renderEditor();
    await press("item-photo-upload");
    expect(pick).toHaveBeenCalledWith("image/jpeg,image/png,image/webp");
  });

  it("shows the server's message when the upload is refused", async () => {
    pick.mockResolvedValue(pickedFile("image/jpeg"));
    upload.mockResolvedValue(refused("Upload failed."));
    const { seen } = renderEditor();
    await press("item-photo-upload");
    expect(screen.getByText("Upload failed.")).toBeTruthy();
    expect(seen).not.toHaveBeenCalled();
  });

  it("clears an earlier photo error when the next upload is attempted", async () => {
    pick.mockResolvedValueOnce(pickedFile("image/gif"));
    renderEditor();
    await press("item-photo-upload");
    expect(screen.getByText("Only JPEG, PNG, and WebP images are accepted.")).toBeTruthy();
    pick.mockResolvedValueOnce(pickedFile("image/png"));
    upload.mockResolvedValue(ok(item({ imageUrl: "/media/x.png" })));
    await press("item-photo-upload");
    expect(screen.queryByText("Only JPEG, PNG, and WebP images are accepted.")).toBeNull();
  });

  it("removes the photo and reports the dish without it", async () => {
    const dish = item({ id: 9, imageUrl: "/media/menu-item-9.jpg" });
    deletePhoto.mockResolvedValue(ok(null));
    const { seen } = renderEditor(dish);
    await press("item-photo-remove");
    expect(deletePhoto).toHaveBeenCalledWith(RESTAURANT_ID, 9);
    expect(seen).toHaveBeenCalledWith({ ...dish, imageUrl: null });
    expect(screen.getByText("Add a photo")).toBeTruthy();
  });

  it("keeps the photo and shows the message when its removal is refused", async () => {
    deletePhoto.mockResolvedValue(refused("Could not remove."));
    const { seen } = renderEditor(item({ imageUrl: "/media/menu-item-1.jpg" }));
    await press("item-photo-remove");
    expect(screen.getByText("Could not remove.")).toBeTruthy();
    expect(seen).not.toHaveBeenCalled();
    expect(screen.getByText("Replace photo")).toBeTruthy();
  });
});

describe("ItemEditor deletion", () => {
  const confirmModal = () => screen.getByTestId("confirm-modal");

  it("asks first and names the dish, calling nothing until it is confirmed", async () => {
    renderEditor(item({ name: "Soup" }));
    expect(screen.queryByTestId("confirm-modal")).toBeNull();
    await press("item-delete");
    expect(
      within(confirmModal()).getByText(
        "“Soup” and its photo will be deleted. This can’t be undone."
      )
    ).toBeTruthy();
    expect(deleteItem).not.toHaveBeenCalled();
  });

  it("deletes the dish and reports it once confirmed", async () => {
    deleteItem.mockResolvedValue(ok(null));
    const { onDeleted } = renderEditor(item({ id: 12 }));
    await press("item-delete");
    await act(async () => {
      fireEvent.press(within(confirmModal()).getByText("Delete dish"));
    });
    expect(deleteItem).toHaveBeenCalledWith(RESTAURANT_ID, 12);
    expect(onDeleted).toHaveBeenCalledWith(12);
  });

  it("deletes nothing when the confirmation is cancelled", async () => {
    const { onDeleted } = renderEditor();
    await press("item-delete");
    fireEvent.press(within(confirmModal()).getByText("Cancel"));
    expect(screen.queryByTestId("confirm-modal")).toBeNull();
    expect(deleteItem).not.toHaveBeenCalled();
    expect(onDeleted).not.toHaveBeenCalled();
  });

  it("closes the confirmation and shows the message when the server refuses", async () => {
    deleteItem.mockResolvedValue(refused("Dish is in use."));
    const { onDeleted } = renderEditor();
    await press("item-delete");
    await act(async () => {
      fireEvent.press(within(confirmModal()).getByText("Delete dish"));
    });
    expect(screen.queryByTestId("confirm-modal")).toBeNull();
    expect(screen.getByText("Dish is in use.")).toBeTruthy();
    expect(onDeleted).not.toHaveBeenCalled();
  });
});
