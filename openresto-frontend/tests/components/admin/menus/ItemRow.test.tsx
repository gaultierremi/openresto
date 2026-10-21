/**
 * @jest-environment jsdom
 */
import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { ItemRow } from "@/components/admin/menus/ItemRow";
import * as menusApi from "@/api/menus";
import type { MenuItemDto } from "@/api/menus";
import { category, item, menu, ok, refused, TreeHost } from "@/tests/helpers/menuFixtures";

// The first render in a cold worker compiles half the component tree, which has been seen to
// take over the default five seconds when several suites start at once.
jest.setTimeout(20_000);

jest.mock("@/context/BrandContext", () => ({
  useBrand: () => ({ appName: "Open Resto", primaryColor: "#0a7ea4" }),
}));
jest.mock("@/utils/haptics", () => ({
  haptics: { selection: jest.fn(), press: jest.fn(), outcome: jest.fn() },
}));
// The editor has its own suite; here it is a stand-in that can report a change and a deletion.
jest.mock("@/components/admin/menus/ItemEditor", () => {
  const { Pressable, Text, View } = require("react-native");
  return {
    ItemEditor: ({
      item: dish,
      onChanged,
      onDeleted,
    }: {
      item: { id: number; name: string };
      onChanged: (next: unknown) => void;
      onDeleted: (id: number) => void;
    }) => (
      <View testID="item-editor">
        <Pressable testID="stub-change" onPress={() => onChanged({ ...dish, name: "Renamed" })}>
          <Text>change</Text>
        </Pressable>
        <Pressable testID="stub-delete" onPress={() => onDeleted(dish.id)}>
          <Text>delete</Text>
        </Pressable>
      </View>
    ),
  };
});
jest.mock("@/api/menus", () => ({
  ...jest.requireActual("@/api/menus"),
  adminSetItemAvailability: jest.fn(),
}));

const setAvailability = menusApi.adminSetItemAvailability as jest.Mock;

const treeOf = (dish: MenuItemDto) => [menu({ categories: [category({ items: [dish] })] })];
const dishInTree = (box: { current: ReturnType<typeof treeOf> }) =>
  box.current[0].categories[0].items;

function renderRow(
  dish: MenuItemDto = item(),
  props: Partial<React.ComponentProps<typeof ItemRow>> = {}
) {
  const box = { current: treeOf(dish) };
  const onMove = jest.fn();
  render(
    <TreeHost initial={treeOf(dish)} box={box}>
      {(menus, onTree) => {
        const current = menus[0].categories[0].items[0];
        return current ? (
          <ItemRow
            restaurantId={7}
            item={current}
            currency="EUR"
            isFirst={false}
            isLast={false}
            reorderBusy={false}
            onMove={onMove}
            onTree={onTree}
            {...props}
          />
        ) : null;
      }}
    </TreeHost>
  );
  return { box, onMove };
}

const press = async (testID: string) => {
  await act(async () => {
    fireEvent.press(screen.getByTestId(testID));
  });
};

beforeEach(() => jest.clearAllMocks());

describe("ItemRow summary", () => {
  it("shows the name and the price", () => {
    renderRow(item({ name: "Soup", priceMinor: 850 }));
    expect(screen.getByText("Soup")).toBeTruthy();
    expect(screen.getByText("€8.50")).toBeTruthy();
  });

  it("shows 'Price on request' for a dish with no price", () => {
    renderRow(item({ priceMinor: null }));
    expect(screen.getByText("Price on request")).toBeTruthy();
  });

  it("adds the availability to the line when the dish is not plainly available", () => {
    renderRow(item({ availability: "SoldOut" }));
    expect(screen.getByText("€8.50 · Sold out")).toBeTruthy();
  });
});

describe("ItemRow sold-out toggle", () => {
  it("marks an available dish sold out and puts the answer in the tree", async () => {
    const dish = item({ id: 3, availability: "Available" });
    setAvailability.mockResolvedValue(ok({ ...dish, availability: "SoldOut" }));
    const { box } = renderRow(dish);
    await press("item-sold-out-3");
    expect(setAvailability).toHaveBeenCalledWith(7, dish, "SoldOut");
    expect(dishInTree(box)[0].availability).toBe("SoldOut");
    expect(screen.getByLabelText("Mark Soup as available again")).toBeTruthy();
  });

  it("puts a sold-out dish back on sale", async () => {
    const dish = item({ id: 3, availability: "SoldOut" });
    setAvailability.mockResolvedValue(ok({ ...dish, availability: "Available" }));
    const { box } = renderRow(dish);
    await press("item-sold-out-3");
    expect(setAvailability).toHaveBeenCalledWith(7, dish, "Available");
    expect(dishInTree(box)[0].availability).toBe("Available");
    expect(screen.getByLabelText("Mark Soup as sold out")).toBeTruthy();
  });

  it("says so and leaves the dish as it was when the server refuses", async () => {
    const dish = item({ id: 3, availability: "Available" });
    setAvailability.mockResolvedValue(refused("Not today."));
    const { box } = renderRow(dish);
    await press("item-sold-out-3");
    expect(screen.getByText("Not today.")).toBeTruthy();
    expect(dishInTree(box)[0]).toEqual(dish);
  });

  it("clears an earlier refusal when the next press goes through", async () => {
    const dish = item({ id: 3 });
    setAvailability.mockResolvedValueOnce(refused("Not today."));
    renderRow(dish);
    await press("item-sold-out-3");
    expect(screen.getByText("Not today.")).toBeTruthy();
    setAvailability.mockResolvedValueOnce(ok({ ...dish, availability: "SoldOut" }));
    await press("item-sold-out-3");
    expect(screen.queryByText("Not today.")).toBeNull();
  });

  it("offers no sold-out toggle for a hidden dish", () => {
    renderRow(item({ id: 3, availability: "Hidden" }));
    expect(screen.queryByTestId("item-sold-out-3")).toBeNull();
    expect(screen.getByText("€8.50 · Hidden")).toBeTruthy();
  });
});

describe("ItemRow editor", () => {
  it("opens the editor and closes it again", () => {
    renderRow(item({ id: 3 }));
    expect(screen.queryByTestId("item-editor")).toBeNull();
    expect(screen.getByLabelText("Edit Soup")).toBeTruthy();
    fireEvent.press(screen.getByTestId("item-edit-3"));
    expect(screen.getByTestId("item-editor")).toBeTruthy();
    expect(screen.getByLabelText("Close Soup")).toBeTruthy();
    fireEvent.press(screen.getByTestId("item-edit-3"));
    expect(screen.queryByTestId("item-editor")).toBeNull();
  });

  it("puts a change the editor reports into the tree", () => {
    const { box } = renderRow(item({ id: 3 }));
    fireEvent.press(screen.getByTestId("item-edit-3"));
    fireEvent.press(screen.getByTestId("stub-change"));
    expect(dishInTree(box)[0].name).toBe("Renamed");
  });

  it("removes the dish from the tree when the editor reports it deleted", () => {
    const { box } = renderRow(item({ id: 3 }));
    fireEvent.press(screen.getByTestId("item-edit-3"));
    fireEvent.press(screen.getByTestId("stub-delete"));
    expect(dishInTree(box)).toEqual([]);
  });
});

describe("ItemRow reordering", () => {
  it("passes the arrows' direction on", () => {
    const { onMove } = renderRow(item({ id: 3 }));
    fireEvent.press(screen.getByTestId("item-3-move-up"));
    fireEvent.press(screen.getByTestId("item-3-move-down"));
    expect(onMove).toHaveBeenNthCalledWith(1, -1);
    expect(onMove).toHaveBeenNthCalledWith(2, 1);
  });

  it("disables the arrow at either end of the list", () => {
    renderRow(item({ id: 3 }), { isFirst: true });
    expect(screen.getByTestId("item-3-move-up")).toBeDisabled();
    expect(screen.getByTestId("item-3-move-down")).not.toBeDisabled();
  });

  it("disables both arrows while a reorder is on its way to the server", () => {
    renderRow(item({ id: 3 }), { reorderBusy: true });
    expect(screen.getByTestId("item-3-move-up")).toBeDisabled();
    expect(screen.getByTestId("item-3-move-down")).toBeDisabled();
  });
});
