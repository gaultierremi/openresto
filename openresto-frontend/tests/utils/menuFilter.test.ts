import {
  filterCategories,
  isFilterActive,
  itemMatches,
  NO_FILTER,
  toggleIn,
  type MenuFilter,
} from "@/utils/menuFilter";
import type { Allergen, DietaryTag } from "@/constants/menu";

const item = (name: string, allergens: Allergen[] = [], dietaryTags: DietaryTag[] = []) => ({
  name,
  allergens,
  dietaryTags,
});

describe("itemMatches", () => {
  it("lets everything through with no filter", () => {
    expect(itemMatches(item("A", ["Gluten"]), NO_FILTER)).toBe(true);
  });

  it("hides a dish declaring an avoided allergen", () => {
    const filter: MenuFilter = { avoid: ["Gluten"], diets: [] };
    expect(itemMatches(item("A", ["Gluten", "Milk"]), filter)).toBe(false);
  });

  it("keeps a dish declaring only other allergens", () => {
    const filter: MenuFilter = { avoid: ["Gluten"], diets: [] };
    expect(itemMatches(item("A", ["Milk"]), filter)).toBe(true);
  });

  it("requires every selected diet", () => {
    const filter: MenuFilter = { avoid: [], diets: ["Vegan", "GlutenFree"] };
    expect(itemMatches(item("A", [], ["Vegan", "GlutenFree"]), filter)).toBe(true);
    expect(itemMatches(item("B", [], ["Vegan"]), filter)).toBe(false);
  });

  it("counts a vegan dish as vegetarian, and not the other way round", () => {
    expect(itemMatches(item("A", [], ["Vegan"]), { avoid: [], diets: ["Vegetarian"] })).toBe(true);
    expect(itemMatches(item("B", [], ["Vegetarian"]), { avoid: [], diets: ["Vegan"] })).toBe(false);
  });

  it("applies the allergen and the diet filter together", () => {
    const filter: MenuFilter = { avoid: ["Milk"], diets: ["Vegetarian"] };
    expect(itemMatches(item("A", ["Milk"], ["Vegetarian"]), filter)).toBe(false);
    expect(itemMatches(item("B", [], ["Vegetarian"]), filter)).toBe(true);
  });
});

describe("isFilterActive", () => {
  it("is false only when both lists are empty", () => {
    expect(isFilterActive(NO_FILTER)).toBe(false);
    expect(isFilterActive({ avoid: ["Fish"], diets: [] })).toBe(true);
    expect(isFilterActive({ avoid: [], diets: ["Vegan"] })).toBe(true);
  });
});

describe("filterCategories", () => {
  const categories = [
    { name: "Starters", items: [item("Soup", ["Celery"]), item("Salad")] },
    { name: "Desserts", items: [item("Cake", ["Gluten"])] },
  ];

  it("returns the categories untouched with no filter", () => {
    expect(filterCategories(categories, NO_FILTER)).toEqual(categories);
  });

  it("keeps only the dishes that pass", () => {
    const result = filterCategories(categories, { avoid: ["Celery"], diets: [] });
    expect(result[0].items.map((i) => i.name)).toEqual(["Salad"]);
  });

  it("drops a category left with no dish", () => {
    const result = filterCategories(categories, { avoid: ["Gluten"], diets: [] });
    expect(result.map((c) => c.name)).toEqual(["Starters"]);
  });
});

describe("toggleIn", () => {
  it("adds a missing value and removes a present one", () => {
    expect(toggleIn(["a"], "b")).toEqual(["a", "b"]);
    expect(toggleIn(["a", "b"], "a")).toEqual(["b"]);
  });
});
