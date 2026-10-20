import type { OnboardingMenu, SaveMenuInput } from "@/api/onboarding";
import { moveId } from "@/utils/reorder";
import { newKey } from "@/utils/onboardingLayout";
import { dishPriceText, parseDishPrice } from "@/utils/onboardingPrice";

export interface DraftDish {
  key: string;
  id: number | null;
  name: string;
  description: string;
  priceText: string;
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
        description: item.description ?? "",
        priceText: dishPriceText(item.priceMinor),
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
  dish.priceText.trim() === "";

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
        ...(dish.id === null ? {} : { id: dish.id }),
        name: dish.name.trim(),
        description: dish.description.trim() === "" ? null : dish.description.trim(),
        priceMinor: price.priceMinor,
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

export const patchDish = (
  draft: DraftMenu,
  categoryKey: string,
  dishKey: string,
  patch: Partial<Pick<DraftDish, "name" | "description" | "priceText">>
): DraftMenu =>
  mapCategory(draft, categoryKey, (category) => ({
    ...category,
    dishes: category.dishes.map((dish) => (dish.key === dishKey ? { ...dish, ...patch } : dish)),
  }));
