import type { MenuCategoryDto, MenuDto, MenuItemDto } from "@/api/menus";
import {
  addCategory,
  addItem,
  countItems,
  newMenuCurrency,
  removeCategory,
  removeItem,
  removeMenu,
  reorderCategories,
  reorderItems,
  reorderMenus,
  replaceCategory,
  replaceItem,
  replaceMenu,
} from "@/utils/menuState";

const item = (id: number, overrides: Partial<MenuItemDto> = {}): MenuItemDto => ({
  id,
  name: `Item ${id}`,
  description: null,
  priceMinor: 100 * id,
  imageUrl: null,
  availability: "Available",
  allergens: [],
  dietaryTags: [],
  sortOrder: id,
  ...overrides,
});

const category = (id: number, items: MenuItemDto[]): MenuCategoryDto => ({
  id,
  name: `Category ${id}`,
  description: null,
  sortOrder: id,
  isVisible: true,
  items,
});

const menu = (id: number, categories: MenuCategoryDto[]): MenuDto => ({
  id,
  name: `Menu ${id}`,
  description: null,
  currency: "EUR",
  isPublished: false,
  sortOrder: id,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  categories,
});

const tree = () => [
  menu(1, [category(10, [item(100), item(101)]), category(11, [item(102)])]),
  menu(2, [category(20, [item(200)])]),
];

describe("menus", () => {
  it("replaces a menu by id", () => {
    const next = { ...menu(2, []), name: "Renamed" };
    expect(replaceMenu(tree(), next).map((m) => m.name)).toEqual(["Menu 1", "Renamed"]);
  });

  it("removes a menu", () => {
    expect(removeMenu(tree(), 1).map((m) => m.id)).toEqual([2]);
  });

  it("reorders menus and renumbers their sortOrder", () => {
    const result = reorderMenus(tree(), [2, 1]);
    expect(result.map((m) => [m.id, m.sortOrder])).toEqual([
      [2, 0],
      [1, 1],
    ]);
  });

  it("leaves the tree as it was for a menu id it does not hold", () => {
    expect(replaceMenu(tree(), menu(9, []))).toEqual(tree());
    expect(removeMenu(tree(), 9)).toEqual(tree());
  });
});

describe("categories", () => {
  it("adds a category to its menu only", () => {
    const result = addCategory(tree(), 2, category(21, []));
    expect(result[1].categories.map((c) => c.id)).toEqual([20, 21]);
    expect(result[0].categories).toHaveLength(2);
  });

  it("replaces a category's own fields and keeps the items the tree already holds", () => {
    const patch = { ...category(10, []), name: "Renamed", isVisible: false };
    const result = replaceCategory(tree(), patch);
    expect(result[0].categories[0]).toMatchObject({ name: "Renamed", isVisible: false });
    expect(result[0].categories[0].items.map((i) => i.id)).toEqual([100, 101]);
  });

  it("removes a category and its items from the count", () => {
    const result = removeCategory(tree(), 10);
    expect(result[0].categories.map((c) => c.id)).toEqual([11]);
    expect(countItems(result[0])).toBe(1);
  });

  it("reorders the categories of one menu", () => {
    const result = reorderCategories(tree(), 1, [11, 10]);
    expect(result[0].categories.map((c) => [c.id, c.sortOrder])).toEqual([
      [11, 0],
      [10, 1],
    ]);
    expect(result[1].categories.map((c) => c.id)).toEqual([20]);
  });
});

describe("items", () => {
  it("adds an item to its category only", () => {
    const result = addItem(tree(), 11, item(103));
    expect(result[0].categories[1].items.map((i) => i.id)).toEqual([102, 103]);
    expect(result[0].categories[0].items).toHaveLength(2);
  });

  it("replaces an item wherever it sits", () => {
    const result = replaceItem(tree(), item(200, { availability: "SoldOut" }));
    expect(result[1].categories[0].items[0].availability).toBe("SoldOut");
    expect(result[0].categories[0].items[0].availability).toBe("Available");
  });

  it("removes an item", () => {
    const result = removeItem(tree(), 101);
    expect(result[0].categories[0].items.map((i) => i.id)).toEqual([100]);
  });

  it("reorders the items of one category", () => {
    const result = reorderItems(tree(), 10, [101, 100]);
    expect(result[0].categories[0].items.map((i) => [i.id, i.sortOrder])).toEqual([
      [101, 0],
      [100, 1],
    ]);
    expect(result[0].categories[1].items.map((i) => i.id)).toEqual([102]);
  });

  it("drops an id the category does not hold and keeps the others", () => {
    const result = reorderItems(tree(), 10, [101, 999, 100]);
    expect(result[0].categories[0].items.map((i) => i.id)).toEqual([101, 100]);
  });

  it("leaves the tree as it was for an id it does not hold", () => {
    expect(replaceItem(tree(), item(999))).toEqual(tree());
    expect(removeItem(tree(), 999)).toEqual(tree());
  });
});

describe("countItems", () => {
  it("adds the dishes of every category", () => {
    expect(countItems(tree()[0])).toBe(3);
    expect(countItems(menu(3, []))).toBe(0);
  });
});

describe("newMenuCurrency", () => {
  it("inherits the currency of the location's first menu", () => {
    expect(newMenuCurrency([{ ...menu(1, []), currency: "CHF" }, menu(2, [])])).toBe("CHF");
  });

  it("starts a location with no menu in euros", () => {
    expect(newMenuCurrency([])).toBe("EUR");
  });
});
