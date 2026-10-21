/**
 * @jest-environment jsdom
 */
import React from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react-native";
import { MenuCard } from "@/components/admin/menus/MenuCard";
import * as menusApi from "@/api/menus";
import type { MenuDto } from "@/api/menus";
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
// The dropdown has its own suite; here it lists its options as pressable rows.
jest.mock("@/components/common/Select", () => {
  const { Pressable, Text, View } = require("react-native");
  return {
    __esModule: true,
    default: ({
      options,
      selectedValue,
      onSelect,
    }: {
      options: { label: string; value: string }[];
      selectedValue: string;
      onSelect: (value: string) => void;
    }) => (
      <View>
        <Text testID="currency-selected">{selectedValue}</Text>
        {options.map((option) => (
          <Pressable
            key={option.value}
            testID={`currency-option-${option.value}`}
            onPress={() => onSelect(option.value)}
          >
            <Text>{option.label}</Text>
          </Pressable>
        ))}
      </View>
    ),
  };
});
// A category block has its own suite; here it is a stand-in that shows the props the card hands
// it and can ask to be moved.
jest.mock("@/components/admin/menus/CategoryBlock", () => {
  const { Pressable, Text, View } = require("react-native");
  return {
    CategoryBlock: (props: {
      category: { id: number; name: string };
      currency: string;
      isFirst: boolean;
      isLast: boolean;
      reorderBusy: boolean;
      onMove: (direction: -1 | 1) => void;
    }) => (
      <View testID={`cat-${props.category.id}`}>
        <Text testID={`cat-${props.category.id}-state`}>
          {`${props.category.name}|${props.currency}|first=${props.isFirst}|last=${props.isLast}|busy=${props.reorderBusy}`}
        </Text>
        <Pressable testID={`cat-${props.category.id}-up`} onPress={() => props.onMove(-1)}>
          <Text>up</Text>
        </Pressable>
        <Pressable testID={`cat-${props.category.id}-down`} onPress={() => props.onMove(1)}>
          <Text>down</Text>
        </Pressable>
      </View>
    ),
  };
});
jest.mock("@/api/menus", () => ({
  ...jest.requireActual("@/api/menus"),
  adminUpdateMenu: jest.fn(),
  adminSetMenuPublished: jest.fn(),
  adminCreateCategory: jest.fn(),
  adminReorderCategories: jest.fn(),
  adminDeleteMenu: jest.fn(),
}));

const updateMenu = menusApi.adminUpdateMenu as jest.Mock;
const setPublished = menusApi.adminSetMenuPublished as jest.Mock;
const createCategory = menusApi.adminCreateCategory as jest.Mock;
const reorderCategories = menusApi.adminReorderCategories as jest.Mock;
const deleteMenu = menusApi.adminDeleteMenu as jest.Mock;

const RESTAURANT_ID = 7;

const cats = (...ids: number[]) =>
  ids.map((id, index) => category({ id, name: `Cat ${id}`, sortOrder: index }));

function renderCard(
  base: MenuDto = menu({ id: 100, name: "Lunch" }),
  props: Partial<React.ComponentProps<typeof MenuCard>> = {}
) {
  const box = { current: [base] };
  const onMove = jest.fn();
  render(
    <TreeHost initial={[base]} box={box}>
      {(menus, onTree) =>
        menus[0] ? (
          <MenuCard
            restaurantId={RESTAURANT_ID}
            menu={menus[0]}
            isFirst={false}
            isLast={false}
            reorderBusy={false}
            onMove={onMove}
            onTree={onTree}
            defaultOpen
            {...props}
          />
        ) : null
      }
    </TreeHost>
  );
  return { box, onMove };
}

const echoMenu = (base: MenuDto) =>
  updateMenu.mockImplementation(async (_r: number, _id: number, input: menusApi.SaveMenuInput) =>
    ok({ ...base, ...input })
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

const categoryIds = (box: { current: MenuDto[] }) => box.current[0].categories.map((c) => c.id);

beforeEach(() => jest.clearAllMocks());

describe("MenuCard header", () => {
  it("shows the name, a draft badge and the counts with the currency", () => {
    renderCard(
      menu({
        name: "Lunch",
        currency: "USD",
        categories: [
          category({ id: 1, items: [item({ id: 1 }), item({ id: 2 })] }),
          category({ id: 2, items: [item({ id: 3 })] }),
        ],
      })
    );
    expect(screen.getByTestId("menu-card-name")).toHaveTextContent("Lunch");
    expect(screen.getByText("Draft")).toBeTruthy();
    expect(screen.getByText("2 categories · 3 dishes · USD")).toBeTruthy();
  });

  it("uses the singular for one category and one dish", () => {
    renderCard(menu({ categories: [category({ id: 1, items: [item({ id: 1 })] })] }));
    expect(screen.getByText("1 category · 1 dish · EUR")).toBeTruthy();
  });

  it("shows a published badge for a published menu", () => {
    renderCard(menu({ isPublished: true }));
    expect(within(screen.getByTestId("menu-status")).getByText("Published")).toBeTruthy();
  });

  it("opens and closes its body, starting closed when not told otherwise", () => {
    renderCard(menu({ id: 100, name: "Lunch" }), { defaultOpen: undefined });
    expect(screen.queryByTestId("menu-name")).toBeNull();
    expect(screen.getByLabelText("Edit Lunch")).toBeTruthy();
    fireEvent.press(screen.getByTestId("menu-toggle-100"));
    expect(screen.getByTestId("menu-name")).toBeTruthy();
    expect(screen.getByLabelText("Close Lunch")).toBeTruthy();
    fireEvent.press(screen.getByTestId("menu-toggle-100"));
    expect(screen.queryByTestId("menu-name")).toBeNull();
  });

  it("starts open when it is the menu that was just added", () => {
    renderCard(menu({ id: 100 }), { defaultOpen: true });
    expect(screen.getByTestId("menu-name")).toBeTruthy();
  });

  it("passes its own moves on to the list", () => {
    const { onMove } = renderCard(menu({ id: 100 }));
    fireEvent.press(screen.getByTestId("menu-100-move-up"));
    fireEvent.press(screen.getByTestId("menu-100-move-down"));
    expect(onMove).toHaveBeenNthCalledWith(1, -1);
    expect(onMove).toHaveBeenNthCalledWith(2, 1);
  });

  it("disables its arrows at the ends of the list", () => {
    renderCard(menu({ id: 100 }), { isFirst: true, isLast: true });
    expect(screen.getByTestId("menu-100-move-up")).toBeDisabled();
    expect(screen.getByTestId("menu-100-move-down")).toBeDisabled();
  });

  it("disables its arrows while a reorder is on its way to the server", () => {
    renderCard(menu({ id: 100 }), { reorderBusy: true });
    expect(screen.getByTestId("menu-100-move-up")).toBeDisabled();
    expect(screen.getByTestId("menu-100-move-down")).toBeDisabled();
  });
});

describe("MenuCard publication", () => {
  it("publishes a draft and shows it as published", async () => {
    const base = menu({ id: 100, isPublished: false });
    setPublished.mockResolvedValue(ok({ ...base, isPublished: true }));
    const { box } = renderCard(base);
    expect(screen.getByTestId("menu-publish-100")).toHaveTextContent("Publish");
    await press("menu-publish-100");
    expect(setPublished).toHaveBeenCalledWith(RESTAURANT_ID, 100, true);
    expect(box.current[0].isPublished).toBe(true);
    expect(screen.getByTestId("menu-publish-100")).toHaveTextContent("Unpublish");
  });

  it("takes a published menu back to draft", async () => {
    const base = menu({ id: 100, isPublished: true });
    setPublished.mockResolvedValue(ok({ ...base, isPublished: false }));
    const { box } = renderCard(base);
    await press("menu-publish-100");
    expect(setPublished).toHaveBeenCalledWith(RESTAURANT_ID, 100, false);
    expect(box.current[0].isPublished).toBe(false);
  });

  it("leaves the menu as it was and shows the message when the server refuses", async () => {
    setPublished.mockResolvedValue(refused("Nothing to publish."));
    const { box } = renderCard(menu({ id: 100, isPublished: false }));
    await press("menu-publish-100");
    expect(screen.getByText("Nothing to publish.")).toBeTruthy();
    expect(box.current[0].isPublished).toBe(false);
  });

  it("clears an earlier failure when the next press goes through", async () => {
    const base = menu({ id: 100 });
    setPublished.mockResolvedValueOnce(refused("Nothing to publish."));
    renderCard(base);
    await press("menu-publish-100");
    expect(screen.getByText("Nothing to publish.")).toBeTruthy();
    setPublished.mockResolvedValueOnce(ok({ ...base, isPublished: true }));
    await press("menu-publish-100");
    expect(screen.queryByText("Nothing to publish.")).toBeNull();
  });
});

describe("MenuCard autosave", () => {
  useFakeClock();

  it("saves nothing until a field changes", async () => {
    renderCard();
    await flush();
    expect(updateMenu).not.toHaveBeenCalled();
  });

  it("saves a renamed menu and puts the answer in the tree", async () => {
    const base = menu({ id: 100, name: "Lunch", currency: "EUR" });
    echoMenu(base);
    const { box } = renderCard(base);
    fireEvent.changeText(screen.getByTestId("menu-name"), "  Dinner ");
    await flush();
    expect(updateMenu).toHaveBeenCalledTimes(1);
    expect(updateMenu).toHaveBeenCalledWith(RESTAURANT_ID, 100, {
      name: "Dinner",
      description: null,
      currency: "EUR",
    });
    expect(box.current[0].name).toBe("Dinner");
    expect(screen.getByText("Saved")).toBeTruthy();
  });

  it("saves a description trimmed, and null once it is emptied", async () => {
    const base = menu({ id: 100, description: null });
    echoMenu(base);
    renderCard(base);
    fireEvent.changeText(screen.getByTestId("menu-description"), " Midday ");
    await flush();
    expect(updateMenu).toHaveBeenLastCalledWith(
      RESTAURANT_ID,
      100,
      expect.objectContaining({ description: "Midday" })
    );
    fireEvent.changeText(screen.getByTestId("menu-description"), "   ");
    await flush();
    expect(updateMenu).toHaveBeenLastCalledWith(
      RESTAURANT_ID,
      100,
      expect.objectContaining({ description: null })
    );
  });

  it("saves the currency picked from the dropdown", async () => {
    const base = menu({ id: 100, currency: "EUR" });
    echoMenu(base);
    renderCard(base);
    fireEvent.press(screen.getByTestId("currency-option-GBP"));
    expect(screen.getByTestId("currency-selected")).toHaveTextContent("GBP");
    await flush();
    expect(updateMenu).toHaveBeenCalledWith(
      RESTAURANT_ID,
      100,
      expect.objectContaining({ currency: "GBP" })
    );
  });

  it("withholds the save while the name is empty and says why", async () => {
    renderCard();
    fireEvent.changeText(screen.getByTestId("menu-name"), "  ");
    await flush();
    expect(updateMenu).not.toHaveBeenCalled();
    expect(screen.getByText("Give the menu a name to save your changes.")).toBeTruthy();
  });

  it("shows the server's message when a save is refused", async () => {
    updateMenu.mockResolvedValue(refused("Currency unknown."));
    renderCard();
    fireEvent.changeText(screen.getByTestId("menu-name"), "Dinner");
    await flush();
    expect(screen.getByText("Currency unknown.")).toBeTruthy();
  });

  it("puts every field back when a save is undone", async () => {
    const base = menu({ id: 100, name: "Lunch", description: "Midday", currency: "EUR" });
    echoMenu(base);
    renderCard(base);
    fireEvent.changeText(screen.getByTestId("menu-name"), "Dinner");
    fireEvent.changeText(screen.getByTestId("menu-description"), "Evening");
    fireEvent.press(screen.getByTestId("currency-option-USD"));
    await flush();
    await act(async () => {
      fireEvent.press(screen.getByText("Undo"));
    });
    expect(screen.getByTestId("menu-name").props.value).toBe("Lunch");
    expect(screen.getByTestId("menu-description").props.value).toBe("Midday");
    expect(screen.getByTestId("currency-selected")).toHaveTextContent("EUR");
  });

  it("puts back an empty description when the menu had none", async () => {
    const base = menu({ id: 100, name: "Lunch", description: null });
    echoMenu(base);
    renderCard(base);
    fireEvent.changeText(screen.getByTestId("menu-name"), "Dinner");
    await flush();
    await act(async () => {
      fireEvent.press(screen.getByText("Undo"));
    });
    expect(screen.getByTestId("menu-description").props.value).toBe("");
  });
});

describe("MenuCard currency options", () => {
  const optionCodes = () =>
    screen.getAllByTestId(/^currency-option-/).map((node) => node.props.testID.split("-").pop());

  it("offers the common currencies when the menu's currency is one of them", () => {
    renderCard(menu({ currency: "CHF" }));
    expect(optionCodes()).toEqual(["EUR", "USD", "GBP", "CHF", "CAD"]);
  });

  it("adds the menu's own currency first when it is not a common one", () => {
    renderCard(menu({ currency: "SEK" }));
    expect(optionCodes()).toEqual(["SEK", "EUR", "USD", "GBP", "CHF", "CAD"]);
    expect(screen.getByTestId("currency-selected")).toHaveTextContent("SEK");
  });
});

describe("MenuCard categories", () => {
  it("hands each category the menu's currency and its position in the list", () => {
    renderCard(menu({ currency: "USD", categories: cats(1, 2, 3) }));
    expect(screen.getByText("Cat 1|USD|first=true|last=false|busy=false")).toBeTruthy();
    expect(screen.getByText("Cat 2|USD|first=false|last=false|busy=false")).toBeTruthy();
    expect(screen.getByText("Cat 3|USD|first=false|last=true|busy=false")).toBeTruthy();
  });

  it("creates a category, visible and with no description, and adds it to the tree", async () => {
    createCategory.mockResolvedValue(ok(category({ id: 40, name: "Desserts" })));
    const { box } = renderCard(menu({ id: 100 }));
    fireEvent.press(screen.getByTestId("add-category-100"));
    fireEvent.changeText(screen.getByTestId("add-category-100-name"), "Desserts");
    await press("add-category-100-submit");
    expect(createCategory).toHaveBeenCalledWith(RESTAURANT_ID, 100, {
      name: "Desserts",
      description: null,
      isVisible: true,
    });
    expect(categoryIds(box)).toEqual([40]);
    expect(screen.queryByTestId("add-category-100-name")).toBeNull();
  });

  it("shows the server's message and adds nothing when the creation is refused", async () => {
    createCategory.mockResolvedValue(refused("Category name cannot be empty."));
    const { box } = renderCard(menu({ id: 100 }));
    fireEvent.press(screen.getByTestId("add-category-100"));
    fireEvent.changeText(screen.getByTestId("add-category-100-name"), "Desserts");
    await press("add-category-100-submit");
    expect(screen.getByText("Category name cannot be empty.")).toBeTruthy();
    expect(categoryIds(box)).toEqual([]);
  });

  it("reorders optimistically and keeps the order once the server accepts it", async () => {
    reorderCategories.mockResolvedValue(ok(null));
    const { box } = renderCard(menu({ id: 100, categories: cats(1, 2, 3) }));
    await press("cat-1-down");
    expect(reorderCategories).toHaveBeenCalledWith(RESTAURANT_ID, 100, [2, 1, 3]);
    expect(categoryIds(box)).toEqual([2, 1, 3]);
  });

  it("moves a category up as well as down", async () => {
    reorderCategories.mockResolvedValue(ok(null));
    const { box } = renderCard(menu({ id: 100, categories: cats(1, 2, 3) }));
    await press("cat-3-up");
    expect(reorderCategories).toHaveBeenCalledWith(RESTAURANT_ID, 100, [1, 3, 2]);
    expect(categoryIds(box)).toEqual([1, 3, 2]);
  });

  it("shows the new order at once and locks the arrows until the server answers", async () => {
    let answer: (value: unknown) => void = () => {};
    reorderCategories.mockReturnValue(new Promise((resolve) => (answer = resolve)));
    const { box } = renderCard(menu({ id: 100, categories: cats(1, 2) }));
    fireEvent.press(screen.getByTestId("cat-1-down"));
    expect(categoryIds(box)).toEqual([2, 1]);
    expect(screen.getByText("Cat 2|EUR|first=true|last=false|busy=true")).toBeTruthy();
    await act(async () => answer(ok(null)));
    expect(screen.getByText("Cat 2|EUR|first=true|last=false|busy=false")).toBeTruthy();
  });

  it("puts the categories back in their old order and says why when the server refuses", async () => {
    reorderCategories.mockResolvedValue(refused("Could not reorder."));
    const { box } = renderCard(menu({ id: 100, categories: cats(1, 2, 3) }));
    await press("cat-1-down");
    expect(categoryIds(box)).toEqual([1, 2, 3]);
    expect(screen.getByText("Could not reorder.")).toBeTruthy();
  });

  it("clears the previous failure when the next move starts", async () => {
    reorderCategories.mockResolvedValueOnce(refused("Could not reorder."));
    renderCard(menu({ id: 100, categories: cats(1, 2, 3) }));
    await press("cat-1-down");
    expect(screen.getByText("Could not reorder.")).toBeTruthy();
    reorderCategories.mockResolvedValueOnce(ok(null));
    await press("cat-1-down");
    expect(screen.queryByText("Could not reorder.")).toBeNull();
  });

  it("calls nothing for a move off either end of the list", async () => {
    renderCard(menu({ id: 100, categories: cats(1, 2) }));
    await press("cat-1-up");
    await press("cat-2-down");
    expect(reorderCategories).not.toHaveBeenCalled();
  });
});

describe("MenuCard deletion", () => {
  const confirmModal = () => screen.getByTestId("confirm-modal");

  it("asks first, naming the menu, and calls nothing until it is confirmed", async () => {
    renderCard(menu({ id: 100, name: "Lunch" }));
    expect(screen.queryByTestId("confirm-modal")).toBeNull();
    await press("menu-delete-100");
    expect(
      within(confirmModal()).getByText(
        "“Lunch” and all its categories and dishes will be deleted, photos included. This can’t be undone."
      )
    ).toBeTruthy();
    expect(deleteMenu).not.toHaveBeenCalled();
  });

  it("deletes the menu and takes it out of the tree once confirmed", async () => {
    deleteMenu.mockResolvedValue(ok(null));
    const { box } = renderCard(menu({ id: 100 }));
    await press("menu-delete-100");
    await act(async () => {
      fireEvent.press(within(confirmModal()).getByText("Delete menu"));
    });
    expect(deleteMenu).toHaveBeenCalledWith(RESTAURANT_ID, 100);
    expect(box.current).toEqual([]);
  });

  it("deletes nothing when the confirmation is cancelled", async () => {
    const { box } = renderCard(menu({ id: 100 }));
    await press("menu-delete-100");
    fireEvent.press(within(confirmModal()).getByText("Cancel"));
    expect(screen.queryByTestId("confirm-modal")).toBeNull();
    expect(deleteMenu).not.toHaveBeenCalled();
    expect(box.current).toHaveLength(1);
  });

  it("closes the confirmation, keeps the menu and shows the message when the server refuses", async () => {
    deleteMenu.mockResolvedValue(refused("Cannot delete."));
    const { box } = renderCard(menu({ id: 100 }));
    await press("menu-delete-100");
    await act(async () => {
      fireEvent.press(within(confirmModal()).getByText("Delete menu"));
    });
    expect(screen.queryByTestId("confirm-modal")).toBeNull();
    expect(screen.getByText("Cannot delete.")).toBeTruthy();
    expect(box.current).toHaveLength(1);
  });
});
