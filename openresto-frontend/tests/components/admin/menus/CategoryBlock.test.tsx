/**
 * @jest-environment jsdom
 */
import React from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react-native";
import { CategoryBlock } from "@/components/admin/menus/CategoryBlock";
import * as menusApi from "@/api/menus";
import type { MenuCategoryDto, MenuDto, MenuItemDto } from "@/api/menus";
import {
  category,
  item,
  menu,
  ok,
  refused,
  TreeHost,
  useFakeClock,
} from "@/tests/helpers/menuFixtures";

// The first render in a cold worker compiles half the component tree, which has been seen to
// take over the default five seconds when several suites start at once.
jest.setTimeout(20_000);

jest.mock("@/context/BrandContext", () => ({
  useBrand: () => ({ appName: "Open Resto", primaryColor: "#0a7ea4" }),
}));
jest.mock("@/utils/haptics", () => ({
  haptics: { selection: jest.fn(), press: jest.fn(), outcome: jest.fn() },
}));
jest.mock("@/components/common/ConfirmModal", () => require("../../../../jest-mocks/ConfirmModal"));
// A dish row has its own suite; here it is a stand-in that shows the props the block hands it
// and can ask to be moved.
jest.mock("@/components/admin/menus/ItemRow", () => {
  const { Pressable, Text, View } = require("react-native");
  return {
    ItemRow: (props: {
      item: { id: number; name: string };
      isFirst: boolean;
      isLast: boolean;
      reorderBusy: boolean;
      onMove: (direction: -1 | 1) => void;
    }) => (
      <View testID={`row-${props.item.id}`}>
        <Text testID={`row-${props.item.id}-state`}>
          {`${props.item.name}|first=${props.isFirst}|last=${props.isLast}|busy=${props.reorderBusy}`}
        </Text>
        <Pressable testID={`row-${props.item.id}-up`} onPress={() => props.onMove(-1)}>
          <Text>up</Text>
        </Pressable>
        <Pressable testID={`row-${props.item.id}-down`} onPress={() => props.onMove(1)}>
          <Text>down</Text>
        </Pressable>
      </View>
    ),
  };
});
jest.mock("@/api/menus", () => ({
  ...jest.requireActual("@/api/menus"),
  adminUpdateCategory: jest.fn(),
  adminCreateItem: jest.fn(),
  adminReorderItems: jest.fn(),
  adminDeleteCategory: jest.fn(),
}));

const updateCategory = menusApi.adminUpdateCategory as jest.Mock;
const createItem = menusApi.adminCreateItem as jest.Mock;
const reorderItems = menusApi.adminReorderItems as jest.Mock;
const deleteCategory = menusApi.adminDeleteCategory as jest.Mock;

const RESTAURANT_ID = 7;

const dishes = (...ids: number[]): MenuItemDto[] =>
  ids.map((id, index) => item({ id, name: `Dish ${id}`, sortOrder: index }));

function renderBlock(
  base: MenuCategoryDto = category({ id: 10, name: "Starters" }),
  props: Partial<React.ComponentProps<typeof CategoryBlock>> = {}
) {
  const box = { current: [menu({ categories: [base] })] };
  render(
    <TreeHost initial={[menu({ categories: [base] })]} box={box}>
      {(menus, onTree) => {
        const current = menus[0].categories[0];
        return current ? (
          <CategoryBlock
            restaurantId={RESTAURANT_ID}
            category={current}
            currency="EUR"
            isFirst={false}
            isLast={false}
            reorderBusy={false}
            onMove={jest.fn()}
            onTree={onTree}
            {...props}
          />
        ) : null;
      }}
    </TreeHost>
  );
  return box;
}

const echoCategory = (base: MenuCategoryDto) =>
  updateCategory.mockImplementation(
    async (_r: number, _id: number, input: menusApi.SaveCategoryInput) => ok({ ...base, ...input })
  );

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

const itemIds = (box: { current: MenuDto[] }) =>
  box.current[0].categories[0].items.map((i) => i.id);

beforeEach(() => {
  jest.clearAllMocks();
});

describe("CategoryBlock autosave", () => {
  useFakeClock();

  it("saves nothing until a field changes", async () => {
    renderBlock();
    await flush();
    expect(updateCategory).not.toHaveBeenCalled();
  });

  it("saves a renamed category and puts the answer in the tree", async () => {
    const base = category({ id: 10, name: "Starters" });
    echoCategory(base);
    const box = renderBlock(base);
    fireEvent.changeText(screen.getByTestId("category-name"), "  Mains ");
    await flush();
    expect(updateCategory).toHaveBeenCalledTimes(1);
    expect(updateCategory).toHaveBeenCalledWith(RESTAURANT_ID, 10, {
      name: "Mains",
      description: null,
      isVisible: true,
    });
    expect(box.current[0].categories[0].name).toBe("Mains");
    expect(screen.getByText("Saved")).toBeTruthy();
  });

  it("keeps the category's dishes when the saved category comes back", async () => {
    const base = category({ id: 10, items: dishes(1, 2) });
    echoCategory({ ...base, items: [] });
    const box = renderBlock(base);
    fireEvent.changeText(screen.getByTestId("category-name"), "Mains");
    await flush();
    expect(itemIds(box)).toEqual([1, 2]);
  });

  it("saves a description trimmed, and null once it is emptied", async () => {
    const base = category({ id: 10 });
    echoCategory(base);
    renderBlock(base);
    fireEvent.changeText(screen.getByTestId("category-description"), " Small plates ");
    await flush();
    expect(updateCategory).toHaveBeenLastCalledWith(
      RESTAURANT_ID,
      10,
      expect.objectContaining({ description: "Small plates" })
    );
    fireEvent.changeText(screen.getByTestId("category-description"), "  ");
    await flush();
    expect(updateCategory).toHaveBeenLastCalledWith(
      RESTAURANT_ID,
      10,
      expect.objectContaining({ description: null })
    );
  });

  it("saves the visibility when the toggle is pressed, in both directions", async () => {
    const base = category({ id: 10, name: "Starters", isVisible: true });
    echoCategory(base);
    renderBlock(base);
    expect(screen.getByLabelText("Hide Starters from guests")).toBeTruthy();
    fireEvent.press(screen.getByTestId("category-visible-10"));
    await flush();
    expect(updateCategory).toHaveBeenLastCalledWith(
      RESTAURANT_ID,
      10,
      expect.objectContaining({ isVisible: false })
    );
    expect(screen.getByLabelText("Show Starters to guests")).toBeTruthy();
    fireEvent.press(screen.getByTestId("category-visible-10"));
    await flush();
    expect(updateCategory).toHaveBeenLastCalledWith(
      RESTAURANT_ID,
      10,
      expect.objectContaining({ isVisible: true })
    );
  });

  it("withholds the save while the name is empty and says why", async () => {
    renderBlock();
    fireEvent.changeText(screen.getByTestId("category-name"), "   ");
    await flush();
    expect(updateCategory).not.toHaveBeenCalled();
    expect(screen.getByText("Give the category a name to save your changes.")).toBeTruthy();
  });

  it("shows the server's message when a save is refused", async () => {
    updateCategory.mockResolvedValue(refused("Name too long."));
    renderBlock();
    fireEvent.changeText(screen.getByTestId("category-name"), "Mains");
    await flush();
    expect(screen.getByText("Name too long.")).toBeTruthy();
  });

  it("puts every field back when a save is undone", async () => {
    const base = category({ id: 10, name: "Starters", description: "Small", isVisible: true });
    echoCategory(base);
    renderBlock(base);
    fireEvent.changeText(screen.getByTestId("category-name"), "Mains");
    fireEvent.changeText(screen.getByTestId("category-description"), "Big");
    fireEvent.press(screen.getByTestId("category-visible-10"));
    await flush();
    await act(async () => {
      fireEvent.press(screen.getByText("Undo"));
    });
    expect(screen.getByTestId("category-name").props.value).toBe("Starters");
    expect(screen.getByTestId("category-description").props.value).toBe("Small");
    expect(screen.getByLabelText("Hide Starters from guests")).toBeTruthy();
  });

  it("puts back an empty description when the category had none", async () => {
    const base = category({ id: 10, name: "Starters", description: null });
    echoCategory(base);
    renderBlock(base);
    fireEvent.changeText(screen.getByTestId("category-name"), "Mains");
    await flush();
    await act(async () => {
      fireEvent.press(screen.getByText("Undo"));
    });
    expect(screen.getByTestId("category-description").props.value).toBe("");
  });
});

describe("CategoryBlock adding a dish", () => {
  const openForm = () => fireEvent.press(screen.getByTestId("add-item-10"));
  const submit = async (name: string, price?: string) => {
    openForm();
    fireEvent.changeText(screen.getByTestId("add-item-10-name"), name);
    if (price !== undefined) fireEvent.changeText(screen.getByTestId("add-item-10-price"), price);
    await press("add-item-10-submit");
  };

  it("creates the dish with its price in minor units and adds it to the tree", async () => {
    createItem.mockResolvedValue(ok(item({ id: 50, name: "Soup", priceMinor: 1250 })));
    const box = renderBlock(category({ id: 10 }));
    await submit("Soup", "12,50");
    expect(createItem).toHaveBeenCalledWith(RESTAURANT_ID, 10, {
      name: "Soup",
      description: null,
      priceMinor: 1250,
      availability: "Available",
      allergens: [],
      dietaryTags: [],
    });
    expect(itemIds(box)).toEqual([50]);
    expect(screen.queryByTestId("add-item-10-name")).toBeNull();
  });

  it("creates a dish with no price as 'price on request'", async () => {
    createItem.mockResolvedValue(ok(item({ id: 50, priceMinor: null })));
    renderBlock(category({ id: 10 }));
    await submit("Soup");
    expect(createItem).toHaveBeenCalledWith(
      RESTAURANT_ID,
      10,
      expect.objectContaining({ priceMinor: null })
    );
  });

  it("treats a price of only spaces as no price", async () => {
    createItem.mockResolvedValue(ok(item({ id: 50, priceMinor: null })));
    renderBlock(category({ id: 10 }));
    await submit("Soup", "   ");
    expect(createItem).toHaveBeenCalledWith(
      RESTAURANT_ID,
      10,
      expect.objectContaining({ priceMinor: null })
    );
  });

  it("refuses a price that is not a price without calling the API, and keeps the form open", async () => {
    const box = renderBlock(category({ id: 10 }));
    await submit("Soup", "abc");
    expect(createItem).not.toHaveBeenCalled();
    expect(
      screen.getByText("Enter a price such as 12.50, or leave it empty for “Price on request”.")
    ).toBeTruthy();
    expect(screen.getByTestId("add-item-10-name").props.value).toBe("Soup");
    expect(itemIds(box)).toEqual([]);
  });

  it("refuses a price with more decimals than the currency has", async () => {
    renderBlock(category({ id: 10 }));
    await submit("Soup", "12.505");
    expect(createItem).not.toHaveBeenCalled();
  });

  it("shows the server's message and adds nothing when the creation is refused", async () => {
    createItem.mockResolvedValue(refused("Name already used."));
    const box = renderBlock(category({ id: 10 }));
    await submit("Soup", "5");
    expect(screen.getByText("Name already used.")).toBeTruthy();
    expect(itemIds(box)).toEqual([]);
  });
});

describe("CategoryBlock dish list and reordering", () => {
  it("says so when the category has no dishes", () => {
    renderBlock(category({ id: 10, items: [] }));
    expect(screen.getByText("No dishes in this category yet.")).toBeTruthy();
  });

  it("lists the dishes with their position in the list", () => {
    renderBlock(category({ id: 10, items: dishes(1, 2, 3) }));
    expect(screen.queryByText("No dishes in this category yet.")).toBeNull();
    expect(screen.getByText("Dish 1|first=true|last=false|busy=false")).toBeTruthy();
    expect(screen.getByText("Dish 2|first=false|last=false|busy=false")).toBeTruthy();
    expect(screen.getByText("Dish 3|first=false|last=true|busy=false")).toBeTruthy();
  });

  it("reorders optimistically and keeps the order once the server accepts it", async () => {
    reorderItems.mockResolvedValue(ok(null));
    const box = renderBlock(category({ id: 10, items: dishes(1, 2, 3) }));
    await press("row-1-down");
    expect(reorderItems).toHaveBeenCalledWith(RESTAURANT_ID, 10, [2, 1, 3]);
    expect(itemIds(box)).toEqual([2, 1, 3]);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("moves a dish up as well as down", async () => {
    reorderItems.mockResolvedValue(ok(null));
    const box = renderBlock(category({ id: 10, items: dishes(1, 2, 3) }));
    await press("row-3-up");
    expect(reorderItems).toHaveBeenCalledWith(RESTAURANT_ID, 10, [1, 3, 2]);
    expect(itemIds(box)).toEqual([1, 3, 2]);
  });

  it("shows the new order at once and locks the arrows while the server has not answered", async () => {
    let answer: (value: unknown) => void = () => {};
    reorderItems.mockReturnValue(new Promise((resolve) => (answer = resolve)));
    const box = renderBlock(category({ id: 10, items: dishes(1, 2) }));
    fireEvent.press(screen.getByTestId("row-1-down"));
    expect(itemIds(box)).toEqual([2, 1]);
    expect(screen.getByText("Dish 2|first=true|last=false|busy=true")).toBeTruthy();
    await act(async () => answer(ok(null)));
    expect(screen.getByText("Dish 2|first=true|last=false|busy=false")).toBeTruthy();
  });

  it("puts the dishes back in their old order and says why when the server refuses", async () => {
    reorderItems.mockResolvedValue(refused("Could not reorder."));
    const box = renderBlock(category({ id: 10, items: dishes(1, 2, 3) }));
    await press("row-1-down");
    expect(itemIds(box)).toEqual([1, 2, 3]);
    expect(screen.getByText("Could not reorder.")).toBeTruthy();
  });

  it("clears the previous reorder failure when the next move starts", async () => {
    reorderItems.mockResolvedValueOnce(refused("Could not reorder."));
    renderBlock(category({ id: 10, items: dishes(1, 2, 3) }));
    await press("row-1-down");
    expect(screen.getByText("Could not reorder.")).toBeTruthy();
    reorderItems.mockResolvedValueOnce(ok(null));
    await press("row-1-down");
    expect(screen.queryByText("Could not reorder.")).toBeNull();
  });

  it("calls nothing for a move off either end of the list", async () => {
    renderBlock(category({ id: 10, items: dishes(1, 2) }));
    await press("row-1-up");
    await press("row-2-down");
    expect(reorderItems).not.toHaveBeenCalled();
  });
});

describe("CategoryBlock own position", () => {
  it("passes its own moves on to the menu", () => {
    const onMove = jest.fn();
    renderBlock(category({ id: 10 }), { onMove });
    fireEvent.press(screen.getByTestId("category-10-move-up"));
    fireEvent.press(screen.getByTestId("category-10-move-down"));
    expect(onMove).toHaveBeenNthCalledWith(1, -1);
    expect(onMove).toHaveBeenNthCalledWith(2, 1);
  });

  it("disables its arrows at the ends and while the menu is reordering", () => {
    renderBlock(category({ id: 10 }), { isFirst: true, isLast: true, reorderBusy: true });
    expect(screen.getByTestId("category-10-move-up")).toBeDisabled();
    expect(screen.getByTestId("category-10-move-down")).toBeDisabled();
  });
});

describe("CategoryBlock deletion", () => {
  const confirmModal = () => screen.getByTestId("confirm-modal");

  it("asks first, and counts one dish in the singular", async () => {
    renderBlock(category({ id: 10, name: "Starters", items: dishes(1) }));
    expect(screen.queryByTestId("confirm-modal")).toBeNull();
    await press("category-delete-10");
    expect(
      within(confirmModal()).getByText(
        "“Starters” and its 1 dish will be deleted. This can’t be undone."
      )
    ).toBeTruthy();
    expect(deleteCategory).not.toHaveBeenCalled();
  });

  it("counts several dishes in the plural", async () => {
    renderBlock(category({ id: 10, name: "Starters", items: dishes(1, 2, 3) }));
    await press("category-delete-10");
    expect(
      within(confirmModal()).getByText(
        "“Starters” and its 3 dishes will be deleted. This can’t be undone."
      )
    ).toBeTruthy();
  });

  it("counts an empty category as no dishes", async () => {
    renderBlock(category({ id: 10, name: "Starters", items: [] }));
    await press("category-delete-10");
    expect(
      within(confirmModal()).getByText(
        "“Starters” and its 0 dishes will be deleted. This can’t be undone."
      )
    ).toBeTruthy();
  });

  it("deletes the category and takes it out of the tree once confirmed", async () => {
    deleteCategory.mockResolvedValue(ok(null));
    const box = renderBlock(category({ id: 10 }));
    await press("category-delete-10");
    await act(async () => {
      fireEvent.press(within(confirmModal()).getByText("Delete"));
    });
    expect(deleteCategory).toHaveBeenCalledWith(RESTAURANT_ID, 10);
    expect(box.current[0].categories).toEqual([]);
  });

  it("deletes nothing when the confirmation is cancelled", async () => {
    const box = renderBlock(category({ id: 10 }));
    await press("category-delete-10");
    fireEvent.press(within(confirmModal()).getByText("Cancel"));
    expect(screen.queryByTestId("confirm-modal")).toBeNull();
    expect(deleteCategory).not.toHaveBeenCalled();
    expect(box.current[0].categories).toHaveLength(1);
  });

  it("closes the confirmation, keeps the category and shows the message when the server refuses", async () => {
    deleteCategory.mockResolvedValue(refused("Cannot delete."));
    const box = renderBlock(category({ id: 10 }));
    await press("category-delete-10");
    await act(async () => {
      fireEvent.press(within(confirmModal()).getByText("Delete"));
    });
    expect(screen.queryByTestId("confirm-modal")).toBeNull();
    expect(screen.getByText("Cannot delete.")).toBeTruthy();
    expect(box.current[0].categories).toHaveLength(1);
  });

  it("clears an earlier deletion failure when the next attempt starts", async () => {
    deleteCategory.mockResolvedValueOnce(refused("Cannot delete."));
    renderBlock(category({ id: 10 }));
    await press("category-delete-10");
    await act(async () => {
      fireEvent.press(within(confirmModal()).getByText("Delete"));
    });
    expect(screen.getByText("Cannot delete.")).toBeTruthy();
    deleteCategory.mockReturnValueOnce(new Promise(() => {}));
    await press("category-delete-10");
    await act(async () => {
      fireEvent.press(within(confirmModal()).getByText("Delete"));
    });
    expect(screen.queryByText("Cannot delete.")).toBeNull();
  });
});
