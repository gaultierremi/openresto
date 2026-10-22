import {
  addCategory,
  addDish,
  draftFromMenu,
  menuFromDraft,
  moveCategory,
  moveDish,
  patchDish,
  removeCategory,
  removeDish,
  renameCategory,
  toggleDishAllergen,
  toggleDishDiet,
} from "@/utils/onboardingMenu";
import type { Allergen, DietaryTag } from "@/constants/menu";
import { setActiveLocale } from "@/utils/locale";

afterEach(() => setActiveLocale(undefined));

const SAVED = {
  menuId: 5,
  name: "Carte",
  categories: [
    {
      id: 1,
      name: "Entrées",
      items: [
        {
          id: 11,
          name: "Croquettes",
          description: "aux crevettes",
          priceMinor: 1450,
          allergens: ["Gluten", "Crustaceans"] as Allergen[],
          dietaryTags: [] as DietaryTag[],
        },
        {
          id: 12,
          name: "Soupe",
          description: null,
          priceMinor: null,
          allergens: [] as Allergen[],
          dietaryTags: ["Vegetarian"] as DietaryTag[],
        },
      ],
    },
    { id: 2, name: "Desserts", items: [] },
  ],
};

describe("draftFromMenu", () => {
  it("writes prices into the fields in the active language and a missing one as empty", () => {
    setActiveLocale("fr");
    const draft = draftFromMenu(SAVED);
    expect(draft.name).toBe("Carte");
    expect(draft.categories[0].dishes.map((d) => d.priceText)).toEqual(["14,50", ""]);
    expect(draft.categories[0].dishes[1].description).toBe("");
  });
});

describe("draftFromMenu with rows that carry no id", () => {
  it("reads a category or a dish the server sent without an id, or with a null one, as new", () => {
    const draft = draftFromMenu({
      menuId: null,
      name: "Carte",
      categories: [
        { name: "Plats", items: [{ name: "Stoemp", description: null, priceMinor: 1700 }] },
        {
          id: null,
          name: "Desserts",
          items: [{ id: null, name: "Gaufre", description: null, priceMinor: 600 }],
        },
      ],
    });
    expect(draft.categories.map((c) => c.id)).toEqual([null, null]);
    expect(draft.categories.flatMap((c) => c.dishes.map((d) => d.id))).toEqual([null, null]);
  });
});

describe("menuFromDraft", () => {
  it("sends prices as cents, ids for what exists, and the order of entry", () => {
    setActiveLocale("fr");
    const draft = draftFromMenu(SAVED);
    const result = menuFromDraft(draft);
    expect(result).toEqual({
      ok: true,
      menu: {
        name: "Carte",
        categories: [
          {
            id: 1,
            name: "Entrées",
            items: [
              {
                id: 11,
                name: "Croquettes",
                description: "aux crevettes",
                priceMinor: 1450,
                allergens: ["Gluten", "Crustaceans"],
                dietaryTags: [],
              },
              {
                id: 12,
                name: "Soupe",
                description: null,
                priceMinor: null,
                allergens: [],
                dietaryTags: ["Vegetarian"],
              },
            ],
          },
          { id: 2, name: "Desserts", items: [] },
        ],
      },
    });
  });

  it("reads a price typed with a comma or a dot", () => {
    let draft = draftFromMenu(SAVED);
    const category = draft.categories[0];
    draft = patchDish(draft, category.key, category.dishes[0].key, { priceText: "12,5" });
    draft = patchDish(draft, category.key, category.dishes[1].key, { priceText: "9.90" });
    const result = menuFromDraft(draft);
    expect(result.ok && result.menu.categories[0].items.map((i) => i.priceMinor)).toEqual([
      1250, 990,
    ]);
  });

  it("refuses a price that is garbage or negative, naming the dish", () => {
    for (const bad of ["abc", "-4", "12,555"]) {
      let draft = draftFromMenu(SAVED);
      const category = draft.categories[0];
      draft = patchDish(draft, category.key, category.dishes[1].key, { priceText: bad });
      expect(menuFromDraft(draft)).toEqual({
        ok: false,
        problem: { kind: "dishPrice", key: category.dishes[1].key },
      });
    }
  });

  it("refuses a category with no name and a dish with no name", () => {
    let draft = draftFromMenu(SAVED);
    draft = renameCategory(draft, draft.categories[0].key, "  ");
    expect(menuFromDraft(draft)).toEqual({
      ok: false,
      problem: { kind: "categoryName", key: draft.categories[0].key },
    });

    draft = draftFromMenu(SAVED);
    const category = draft.categories[0];
    draft = patchDish(draft, category.key, category.dishes[0].key, { name: "" });
    expect(menuFromDraft(draft)).toEqual({
      ok: false,
      problem: { kind: "dishName", key: category.dishes[0].key },
    });
  });

  it("leaves out a dish row that was added and never filled in", () => {
    let draft = draftFromMenu(SAVED);
    draft = addDish(draft, draft.categories[1].key);
    const result = menuFromDraft(draft);
    expect(result.ok && result.menu.categories[1].items).toEqual([]);
  });

  it("does not leave out an existing dish whose name was emptied: that is refused", () => {
    let draft = draftFromMenu(SAVED);
    const category = draft.categories[0];
    draft = patchDish(draft, category.key, category.dishes[1].key, {
      name: "",
      description: "",
      priceText: "",
    });
    expect(menuFromDraft(draft).ok).toBe(false);
  });

  it("trims names and sends a blank description as none", () => {
    let draft = draftFromMenu({ menuId: null, name: " Carte ", categories: [] });
    draft = addCategory(draft);
    draft = renameCategory(draft, draft.categories[0].key, " Plats ");
    draft = patchDish(draft, draft.categories[0].key, draft.categories[0].dishes[0].key, {
      name: " Stoemp ",
      description: "  ",
      priceText: "17",
    });
    expect(menuFromDraft(draft)).toEqual({
      ok: true,
      menu: {
        name: "Carte",
        categories: [
          {
            name: "Plats",
            items: [
              {
                name: "Stoemp",
                description: null,
                priceMinor: 1700,
                allergens: [],
                dietaryTags: [],
              },
            ],
          },
        ],
      },
    });
  });
});

describe("a dish's allergens and diets", () => {
  const firstDish = (draft: ReturnType<typeof draftFromMenu>) => ({
    category: draft.categories[0],
    dish: draft.categories[0].dishes[0],
  });

  it("ticks an allergen and unticks it again", () => {
    let draft = draftFromMenu(SAVED);
    const { category, dish } = firstDish(draft);
    draft = toggleDishAllergen(draft, category.key, dish.key, "Milk");
    expect(draft.categories[0].dishes[0].allergens).toEqual(["Gluten", "Crustaceans", "Milk"]);

    draft = toggleDishAllergen(draft, category.key, dish.key, "Milk");
    expect(draft.categories[0].dishes[0].allergens).toEqual(["Gluten", "Crustaceans"]);
  });

  it("keeps the allergens in the regulation's order, whatever order they were ticked in", () => {
    let draft = draftFromMenu({ menuId: null, name: "Carte", categories: [] });
    draft = addCategory(draft);
    const category = draft.categories[0];
    const dish = category.dishes[0];
    draft = toggleDishAllergen(draft, category.key, dish.key, "Sesame");
    draft = toggleDishAllergen(draft, category.key, dish.key, "Gluten");
    expect(draft.categories[0].dishes[0].allergens).toEqual(["Gluten", "Sesame"]);
  });

  it("ticks and unticks a diet without touching the allergens", () => {
    let draft = draftFromMenu(SAVED);
    const { category, dish } = firstDish(draft);
    draft = toggleDishDiet(draft, category.key, dish.key, "GlutenFree");
    expect(draft.categories[0].dishes[0].dietaryTags).toEqual(["GlutenFree"]);
    expect(draft.categories[0].dishes[0].allergens).toEqual(["Gluten", "Crustaceans"]);

    draft = toggleDishDiet(draft, category.key, dish.key, "GlutenFree");
    expect(draft.categories[0].dishes[0].dietaryTags).toEqual([]);
  });

  it("changes only the dish it was asked to change", () => {
    let draft = draftFromMenu(SAVED);
    const category = draft.categories[0];
    draft = toggleDishAllergen(draft, category.key, category.dishes[1].key, "Eggs");
    expect(draft.categories[0].dishes.map((d) => d.allergens)).toEqual([
      ["Gluten", "Crustaceans"],
      ["Eggs"],
    ]);
  });

  it("sends what is ticked, and an empty list once it is all unticked, so the server clears it", () => {
    let draft = draftFromMenu(SAVED);
    const { category, dish } = firstDish(draft);
    draft = toggleDishAllergen(draft, category.key, dish.key, "Gluten");
    draft = toggleDishAllergen(draft, category.key, dish.key, "Crustaceans");

    const result = menuFromDraft(draft);

    expect(result.ok && result.menu.categories[0].items[0].allergens).toEqual([]);
  });

  it("does not leave out a new dish row that has only an allergen ticked", () => {
    let draft = draftFromMenu(SAVED);
    draft = addDish(draft, draft.categories[1].key);
    const desserts = draft.categories[1];
    draft = toggleDishAllergen(draft, desserts.key, desserts.dishes[0].key, "Eggs");

    // Declaring something on a nameless row is a mistake to point out, not a row to drop silently.
    expect(menuFromDraft(draft).ok).toBe(false);
  });
});

describe("order of entry", () => {
  it("moves a category up and down, and not past either end", () => {
    const draft = draftFromMenu(SAVED);
    const [first, second] = draft.categories;
    expect(moveCategory(draft, second.key, -1).categories.map((c) => c.id)).toEqual([2, 1]);
    expect(moveCategory(draft, first.key, 1).categories.map((c) => c.id)).toEqual([2, 1]);
    expect(moveCategory(draft, first.key, -1)).toEqual(draft);
    expect(moveCategory(draft, second.key, 1)).toEqual(draft);
  });

  it("moves a dish within its category", () => {
    const draft = draftFromMenu(SAVED);
    const category = draft.categories[0];
    const moved = moveDish(draft, category.key, category.dishes[1].key, -1);
    expect(moved.categories[0].dishes.map((d) => d.id)).toEqual([12, 11]);
    expect(moveDish(draft, category.key, category.dishes[0].key, -1)).toEqual(draft);
  });

  it("appends what is added and removes what is removed", () => {
    let draft = draftFromMenu(SAVED);
    draft = addCategory(draft);
    expect(draft.categories).toHaveLength(3);
    expect(draft.categories[2].dishes).toHaveLength(1);

    draft = removeCategory(draft, draft.categories[2].key);
    expect(draft.categories).toHaveLength(2);

    const category = draft.categories[0];
    draft = removeDish(draft, category.key, category.dishes[0].key);
    expect(draft.categories[0].dishes.map((d) => d.id)).toEqual([12]);
  });
});
