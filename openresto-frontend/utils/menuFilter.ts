import type { Allergen, DietaryTag } from "@/constants/menu";

export interface MenuFilter {
  /** Allergens the guest wants to avoid: an item declaring any of them is left out. */
  avoid: readonly Allergen[];
  /** Diets the guest follows: an item has to satisfy every one of them. */
  diets: readonly DietaryTag[];
}

export const NO_FILTER: MenuFilter = { avoid: [], diets: [] };

interface Filterable {
  allergens: readonly Allergen[];
  dietaryTags: readonly DietaryTag[];
}

export function isFilterActive(filter: MenuFilter): boolean {
  return filter.avoid.length > 0 || filter.diets.length > 0;
}

/** Vegan food is vegetarian by definition, so a vegetarian guest is offered it too. */
function satisfiesDiet(tags: readonly DietaryTag[], diet: DietaryTag): boolean {
  if (diet === "Vegetarian") return tags.includes("Vegetarian") || tags.includes("Vegan");
  return tags.includes(diet);
}

/**
 * Whether the filter lets an item through. An item that declares no allergens passes an
 * allergen filter, and that is only as reliable as the restaurant's own declarations: the page
 * says so next to the filters rather than letting a filter read as a guarantee.
 *
 * @see [menuFilter.test.ts](../tests/utils/menuFilter.test.ts) — pins that one avoided allergen
 * hides an item, that every selected diet has to hold, and that vegan counts as vegetarian.
 */
export function itemMatches(item: Filterable, filter: MenuFilter): boolean {
  if (item.allergens.some((a) => filter.avoid.includes(a))) return false;
  return filter.diets.every((diet) => satisfiesDiet(item.dietaryTags, diet));
}

/** A category keeps only the items that pass; one left with none disappears with them. */
export function filterCategories<I extends Filterable, C extends { items: I[] }>(
  categories: readonly C[],
  filter: MenuFilter
): C[] {
  if (!isFilterActive(filter)) return [...categories];
  return categories
    .map((category) => ({
      ...category,
      items: category.items.filter((i) => itemMatches(i, filter)),
    }))
    .filter((category) => category.items.length > 0);
}

export function toggleIn<T>(list: readonly T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}
