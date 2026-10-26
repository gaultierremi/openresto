import type { OnboardingMenu, SaveMenuInput } from "@/api/onboarding";
import type { DishLanguage, DishTranslations } from "@/api/menus";
import { moveId } from "@/utils/reorder";
import { newKey } from "@/utils/onboardingLayout";
import { dishPriceText, parseDishPrice } from "@/utils/onboardingPrice";
import { ALLERGENS, DIETARY_TAGS, type Allergen, type DietaryTag } from "@/constants/menu";

export interface DraftDish {
  imageUrl?: string | null;
  availability?: import("@/constants/menu").Availability;
  primaryLanguage?: DishLanguage;
  translations?: DishTranslations;
  key: string;
  id: number | null;
  name: string;
  description: string;
  priceText: string;
  allergens: Allergen[];
  dietaryTags: DietaryTag[];
}

export interface DraftCategory {
  key: string;
  id: number | null;
  name: string;
  dishes: DraftDish[];
}

export interface DraftMenu {
  name: string;
  categories: DraftCategory[];
}

export function draftFromMenu(menu: OnboardingMenu): DraftMenu {
  return {
    name: menu.name,
    categories: menu.categories.map((category) => ({
      key: newKey(),
      id: category.id ?? null,
      name: category.name,
      dishes: category.items.map((item) => ({
        key: newKey(),
        id: item.id ?? null,
        name: item.name,
        imageUrl: item.imageUrl,
        availability: item.availability,
        description: item.description ?? "",
        primaryLanguage: item.primaryLanguage,
        translations: item.translations,
        priceText: dishPriceText(item.priceMinor),
        allergens: item.allergens ?? [],
        dietaryTags: item.dietaryTags ?? [],
      })),
    })),
  };
}

/** The first thing the server would refuse in the draft: a nameless row or a price that is not one. */
export interface MenuProblem {
  kind: "categoryName" | "dishName" | "dishPrice";
  key: string;
}

export type MenuRequest = { ok: true; menu: SaveMenuInput } | { ok: false; problem: MenuProblem };

/** A dish row added and never filled in; leaving it out is what its author meant. */
const isUntouchedNewDish = (dish: DraftDish): boolean =>
  dish.id === null &&
  dish.name.trim() === "" &&
  dish.description.trim() === "" &&
  !Object.values(dish.translations ?? {}).some(
    (value) => value?.name?.trim() || value?.description?.trim()
  ) &&
  dish.priceText.trim() === "" &&
  dish.allergens.length === 0 &&
  dish.dietaryTags.length === 0;

/**
 * The draft as the request, or what stops it. Order of entry is the order of the menu: the
 * server numbers categories and dishes by their place in the lists it is sent.
 */
export function menuFromDraft(draft: DraftMenu): MenuRequest {
  const categories: SaveMenuInput["categories"] = [];
  for (const category of draft.categories) {
    if (category.name.trim() === "") {
      return { ok: false, problem: { kind: "categoryName", key: category.key } };
    }
    const items: SaveMenuInput["categories"][number]["items"] = [];
    for (const dish of category.dishes) {
      if (isUntouchedNewDish(dish)) continue;
      if (dish.name.trim() === "") {
        return { ok: false, problem: { kind: "dishName", key: dish.key } };
      }
      const price = parseDishPrice(dish.priceText);
      if (!price.ok) return { ok: false, problem: { kind: "dishPrice", key: dish.key } };
      items.push({
        primaryLanguage: dish.primaryLanguage,
        translations: dish.translations,
        ...(dish.id === null ? {} : { id: dish.id }),
        name: dish.name.trim(),
        description: dish.description.trim() === "" ? null : dish.description.trim(),
        priceMinor: price.priceMinor,
        allergens: dish.allergens,
        dietaryTags: dish.dietaryTags,
      });
    }
    categories.push({
      ...(category.id === null ? {} : { id: category.id }),
      name: category.name.trim(),
      items,
    });
  }
  return { ok: true, menu: { name: draft.name.trim(), categories } };
}

function moved<T extends { key: string }>(list: T[], key: string, direction: -1 | 1): T[] {
  const order = moveId(
    list.map((entry) => entry.key),
    list.findIndex((entry) => entry.key === key),
    direction
  );
  return order ? order.map((k) => list.find((entry) => entry.key === k)!) : list;
}

const blankDish = (): DraftDish => ({
  key: newKey(),
  id: null,
  name: "",
  description: "",
  priceText: "",
  allergens: [],
  dietaryTags: [],
});

export const addCategory = (draft: DraftMenu): DraftMenu => ({
  ...draft,
  categories: [...draft.categories, { key: newKey(), id: null, name: "", dishes: [blankDish()] }],
});

export const removeCategory = (draft: DraftMenu, key: string): DraftMenu => ({
  ...draft,
  categories: draft.categories.filter((category) => category.key !== key),
});

export const moveCategory = (draft: DraftMenu, key: string, direction: -1 | 1): DraftMenu => ({
  ...draft,
  categories: moved(draft.categories, key, direction),
});

const mapCategory = (
  draft: DraftMenu,
  key: string,
  change: (category: DraftCategory) => DraftCategory
): DraftMenu => ({
  ...draft,
  categories: draft.categories.map((category) =>
    category.key === key ? change(category) : category
  ),
});

export const renameCategory = (draft: DraftMenu, key: string, name: string): DraftMenu =>
  mapCategory(draft, key, (category) => ({ ...category, name }));

export const addDish = (draft: DraftMenu, categoryKey: string): DraftMenu =>
  mapCategory(draft, categoryKey, (category) => ({
    ...category,
    dishes: [...category.dishes, blankDish()],
  }));

export const removeDish = (draft: DraftMenu, categoryKey: string, dishKey: string): DraftMenu =>
  mapCategory(draft, categoryKey, (category) => ({
    ...category,
    dishes: category.dishes.filter((dish) => dish.key !== dishKey),
  }));

export const moveDish = (
  draft: DraftMenu,
  categoryKey: string,
  dishKey: string,
  direction: -1 | 1
): DraftMenu =>
  mapCategory(draft, categoryKey, (category) => ({
    ...category,
    dishes: moved(category.dishes, dishKey, direction),
  }));

/** The list with `value` flipped, kept in the order of `all` so a dish's declarations never reorder. */
const flipped = <T extends string>(all: readonly T[], current: T[], value: T): T[] =>
  all.filter((entry) => (entry === value ? !current.includes(entry) : current.includes(entry)));

const mapDish = (
  draft: DraftMenu,
  categoryKey: string,
  dishKey: string,
  change: (dish: DraftDish) => DraftDish
): DraftMenu =>
  mapCategory(draft, categoryKey, (category) => ({
    ...category,
    dishes: category.dishes.map((dish) => (dish.key === dishKey ? change(dish) : dish)),
  }));

export const toggleDishAllergen = (
  draft: DraftMenu,
  categoryKey: string,
  dishKey: string,
  allergen: Allergen
): DraftMenu =>
  mapDish(draft, categoryKey, dishKey, (dish) => ({
    ...dish,
    allergens: flipped(ALLERGENS, dish.allergens, allergen),
  }));

export const toggleDishDiet = (
  draft: DraftMenu,
  categoryKey: string,
  dishKey: string,
  tag: DietaryTag
): DraftMenu =>
  mapDish(draft, categoryKey, dishKey, (dish) => ({
    ...dish,
    dietaryTags: flipped(DIETARY_TAGS, dish.dietaryTags, tag),
  }));

export const patchDish = (
  draft: DraftMenu,
  categoryKey: string,
  dishKey: string,
  patch: Partial<
    Pick<DraftDish, "name" | "description" | "priceText" | "primaryLanguage" | "translations">
  >
): DraftMenu =>
  mapCategory(draft, categoryKey, (category) => ({
    ...category,
    dishes: category.dishes.map((dish) => (dish.key === dishKey ? { ...dish, ...patch } : dish)),
  }));
