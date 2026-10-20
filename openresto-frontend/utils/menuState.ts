import type { MenuCategoryDto, MenuDto, MenuItemDto } from "@/api/menus";
import { DEFAULT_CURRENCY } from "@/constants/menu";

/**
 * The admin keeps the restaurant's menus as one tree and patches it as each call lands, rather
 * than refetching after every keystroke-sized edit. These are the patches, pure so the screens
 * stay about the calls and so each is pinned on its own.
 *
 * @see [menuState.test.ts](../tests/utils/menuState.test.ts) — pins every patch, including that
 * a patch naming an id the tree does not hold leaves the tree as it was.
 */

/** The entries in the order of `ids`, with `sortOrder` renumbered to match. */
function sortByIds<T extends { id: number; sortOrder: number }>(
  entries: readonly T[],
  ids: readonly number[]
): T[] {
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  return ids.flatMap((id, index) => {
    const entry = byId.get(id);
    return entry ? [{ ...entry, sortOrder: index }] : [];
  });
}

const mapCategories = (
  menus: readonly MenuDto[],
  fn: (category: MenuCategoryDto) => MenuCategoryDto
): MenuDto[] => menus.map((menu) => ({ ...menu, categories: menu.categories.map(fn) }));

export const replaceMenu = (menus: readonly MenuDto[], next: MenuDto): MenuDto[] =>
  menus.map((menu) => (menu.id === next.id ? next : menu));

export const removeMenu = (menus: readonly MenuDto[], id: number): MenuDto[] =>
  menus.filter((menu) => menu.id !== id);

export const reorderMenus = (menus: readonly MenuDto[], ids: readonly number[]): MenuDto[] =>
  sortByIds(menus, ids);

export const addCategory = (
  menus: readonly MenuDto[],
  menuId: number,
  category: MenuCategoryDto
): MenuDto[] =>
  menus.map((menu) =>
    menu.id === menuId ? { ...menu, categories: [...menu.categories, category] } : menu
  );

export const replaceCategory = (menus: readonly MenuDto[], next: MenuCategoryDto): MenuDto[] =>
  // A category response carries its items, but the editor patches the category's own fields
  // only: the items the admin sees were updated by their own calls.
  mapCategories(menus, (category) =>
    category.id === next.id ? { ...category, ...next, items: category.items } : category
  );

export const removeCategory = (menus: readonly MenuDto[], id: number): MenuDto[] =>
  menus.map((menu) => ({ ...menu, categories: menu.categories.filter((c) => c.id !== id) }));

export const reorderCategories = (
  menus: readonly MenuDto[],
  menuId: number,
  ids: readonly number[]
): MenuDto[] =>
  menus.map((menu) =>
    menu.id === menuId ? { ...menu, categories: sortByIds(menu.categories, ids) } : menu
  );

export const addItem = (
  menus: readonly MenuDto[],
  categoryId: number,
  item: MenuItemDto
): MenuDto[] =>
  mapCategories(menus, (category) =>
    category.id === categoryId ? { ...category, items: [...category.items, item] } : category
  );

export const replaceItem = (menus: readonly MenuDto[], next: MenuItemDto): MenuDto[] =>
  mapCategories(menus, (category) => ({
    ...category,
    items: category.items.map((item) => (item.id === next.id ? next : item)),
  }));

export const removeItem = (menus: readonly MenuDto[], id: number): MenuDto[] =>
  mapCategories(menus, (category) => ({
    ...category,
    items: category.items.filter((item) => item.id !== id),
  }));

export const reorderItems = (
  menus: readonly MenuDto[],
  categoryId: number,
  ids: readonly number[]
): MenuDto[] =>
  mapCategories(menus, (category) =>
    category.id === categoryId ? { ...category, items: sortByIds(category.items, ids) } : category
  );

export const countItems = (menu: MenuDto): number =>
  menu.categories.reduce((total, category) => total + category.items.length, 0);

/**
 * The currency a new menu starts in: the one the location's first menu already uses, so a
 * location that prices in another currency is not asked to change every menu it adds, and euros
 * when it has none. The currency itself is a per-menu field, set in the editor.
 *
 * @see [menuState.test.ts](../tests/utils/menuState.test.ts) — pins that the first menu's
 * currency is inherited and that an empty location starts in euros.
 */
export const newMenuCurrency = (menus: readonly MenuDto[]): string =>
  menus[0]?.currency ?? DEFAULT_CURRENCY;
