import { buildUrl, del, get, patch, post, put } from "./client";
import { apiErrorMessage } from "@/api/errors";
import type { Allergen, Availability, DietaryTag } from "@/constants/menu";

// ── Admin shapes (mirror MenuDto.cs) ─────────────────────────────────────────

export interface MenuItemDto {
  primaryLanguage?: DishLanguage;
  translations?: DishTranslations;
  id: number;
  name: string;
  description: string | null;
  /** Minor units (cents). Null means "price on request"; 0 is free. */
  priceMinor: number | null;
  imageUrl: string | null;
  availability: Availability;
  allergens: Allergen[];
  dietaryTags: DietaryTag[];
  sortOrder: number;
}

export interface MenuCategoryDto {
  id: number;
  name: string;
  description: string | null;
  sortOrder: number;
  isVisible: boolean;
  items: MenuItemDto[];
}

export interface MenuDto {
  id: number;
  name: string;
  description: string | null;
  currency: string;
  isPublished: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  categories: MenuCategoryDto[];
}

export interface SaveMenuInput {
  name: string;
  description: string | null;
  currency: string;
}

export interface SaveCategoryInput {
  name: string;
  description: string | null;
  isVisible: boolean;
}

export interface SaveItemInput {
  primaryLanguage?: DishLanguage;
  translations?: DishTranslations;
  name: string;
  description: string | null;
  priceMinor: number | null;
  availability: Availability;
  allergens: Allergen[];
  dietaryTags: DietaryTag[];
}

export interface TablePublicToken {
  tableId: number;
  tableName: string | null;
  sectionName: string;
  token: string;
}

export interface PublicTokens {
  restaurantToken: string;
  tables: TablePublicToken[];
}

// ── Public shapes (PublicMenuResponse): the restaurant's id is the only id ───

export interface PublicMenuItem {
  primaryLanguage?: DishLanguage;
  translations?: DishTranslations;
  viewToken?: string;
  name: string;
  description: string | null;
  priceMinor: number | null;
  imageUrl: string | null;
  /** `Available` or `SoldOut`; a hidden item is never listed. */
  availability: Exclude<Availability, "Hidden">;
  allergens: Allergen[];
  dietaryTags: DietaryTag[];
}

export type DishLanguage = "fr" | "nl" | "en";
export type DishTranslations = Partial<
  Record<DishLanguage, { name: string | null; description: string | null }>
>;

export interface PublicMenuCategory {
  name: string;
  description: string | null;
  items: PublicMenuItem[];
}

export interface PublicMenu {
  name: string;
  description: string | null;
  currency: string;
  categories: PublicMenuCategory[];
}

export interface PublicMenuResponse {
  /** The id is already public on the listing; it names the booking page the menu's button opens. */
  restaurant: { id: number; name: string; timezone: string };
  /** Set only when the menu was reached through a table's QR code. */
  table: { name: string | null } | null;
  menus: PublicMenu[];
}

/** Which QR a guest scanned: the restaurant's (`r`) or one table's (`t`). */
export type PublicMenuKind = "r" | "t";

export async function recordDishView(kind: PublicMenuKind, token: string, viewToken: string) {
  try {
    await post(
      `/menus/${kind}/${encodeURIComponent(token)}/views/${encodeURIComponent(viewToken)}`
    );
  } catch {
    /* A failed counter must not prevent reading the menu. */
  }
}

export type MenuResult<T> = { ok: true; value: T } | { ok: false; message: string };

async function request<T>(
  call: () => Promise<Response>,
  read: (res: Response) => Promise<T>
): Promise<MenuResult<T>> {
  try {
    const res = await call();
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return { ok: false, message: apiErrorMessage(body, "Request failed.") };
    }
    return { ok: true, value: await read(res) };
  } catch {
    return { ok: false, message: "Network error." };
  }
}

const json = <T>(res: Response): Promise<T> => res.json() as Promise<T>;
const nothing = async () => null;

const base = (restaurantId: number) => `/admin/restaurants/${restaurantId}`;

// ── Menus ────────────────────────────────────────────────────────────────────

export const adminListMenus = (restaurantId: number) =>
  request(() => get(`${base(restaurantId)}/menus`), json<MenuDto[]>);

export const adminCreateMenu = (restaurantId: number, input: SaveMenuInput) =>
  request(() => post(`${base(restaurantId)}/menus`, input), json<MenuDto>);

export const adminUpdateMenu = (restaurantId: number, menuId: number, input: SaveMenuInput) =>
  request(() => put(`${base(restaurantId)}/menus/${menuId}`, input), json<MenuDto>);

export const adminDeleteMenu = (restaurantId: number, menuId: number) =>
  request(() => del(`${base(restaurantId)}/menus/${menuId}`), nothing);

export const adminSetMenuPublished = (restaurantId: number, menuId: number, published: boolean) =>
  request(
    () => post(`${base(restaurantId)}/menus/${menuId}/${published ? "publish" : "unpublish"}`),
    json<MenuDto>
  );

export const adminReorderMenus = (restaurantId: number, ids: number[]) =>
  request(() => patch(`${base(restaurantId)}/menus/reorder`, { ids }), nothing);

// ── Categories ───────────────────────────────────────────────────────────────

export const adminCreateCategory = (
  restaurantId: number,
  menuId: number,
  input: SaveCategoryInput
) =>
  request(
    () => post(`${base(restaurantId)}/menus/${menuId}/categories`, input),
    json<MenuCategoryDto>
  );

export const adminUpdateCategory = (
  restaurantId: number,
  categoryId: number,
  input: SaveCategoryInput
) =>
  request(
    () => put(`${base(restaurantId)}/menu-categories/${categoryId}`, input),
    json<MenuCategoryDto>
  );

export const adminDeleteCategory = (restaurantId: number, categoryId: number) =>
  request(() => del(`${base(restaurantId)}/menu-categories/${categoryId}`), nothing);

export const adminReorderCategories = (restaurantId: number, menuId: number, ids: number[]) =>
  request(
    () => patch(`${base(restaurantId)}/menus/${menuId}/categories/reorder`, { ids }),
    nothing
  );

// ── Items ────────────────────────────────────────────────────────────────────

export const adminCreateItem = (restaurantId: number, categoryId: number, input: SaveItemInput) =>
  request(
    () => post(`${base(restaurantId)}/menu-categories/${categoryId}/items`, input),
    json<MenuItemDto>
  );

export const adminUpdateItem = (restaurantId: number, itemId: number, input: SaveItemInput) =>
  request(() => put(`${base(restaurantId)}/menu-items/${itemId}`, input), json<MenuItemDto>);

/** A dish as the update endpoint takes it: the endpoint replaces every field, so a partial
 * change (sold out, back on) has to resend the rest from what the dish already holds. */
export const itemToInput = (item: MenuItemDto): SaveItemInput => ({
  primaryLanguage: item.primaryLanguage,
  translations: item.translations,
  name: item.name,
  description: item.description,
  priceMinor: item.priceMinor,
  availability: item.availability,
  allergens: item.allergens,
  dietaryTags: item.dietaryTags,
});

/** The one call behind every availability press: the sold-out toggle, the service screen and
 * the editor's three choices all go through it, so they cannot disagree about what a press does. */
export const adminSetItemAvailability = (
  restaurantId: number,
  item: MenuItemDto,
  availability: Availability
) => adminUpdateItem(restaurantId, item.id, { ...itemToInput(item), availability });

export const adminDeleteItem = (restaurantId: number, itemId: number) =>
  request(() => del(`${base(restaurantId)}/menu-items/${itemId}`), nothing);

export const adminReorderItems = (restaurantId: number, categoryId: number, ids: number[]) =>
  request(
    () => patch(`${base(restaurantId)}/menu-categories/${categoryId}/items/reorder`, { ids }),
    nothing
  );

export const adminUploadItemPhoto = (restaurantId: number, itemId: number, file: File) => {
  const form = new FormData();
  form.append("file", file);
  // Not through `post`: the client JSON-encodes a body, and a multipart one has to keep the
  // boundary the browser writes into its own Content-Type header.
  return request(
    () =>
      fetch(buildUrl(`${base(restaurantId)}/menu-items/${itemId}/photo`), {
        method: "POST",
        credentials: "include",
        body: form,
      }),
    json<MenuItemDto>
  );
};

export const adminDeleteItemPhoto = (restaurantId: number, itemId: number) =>
  request(() => del(`${base(restaurantId)}/menu-items/${itemId}/photo`), nothing);

// ── Public tokens ────────────────────────────────────────────────────────────

export const adminGetPublicTokens = (restaurantId: number) =>
  request(() => get(`${base(restaurantId)}/public-tokens`), json<PublicTokens>);

/** Owner only. The old token stops resolving the moment this answers. */
export const adminRegenerateRestaurantToken = (restaurantId: number) =>
  request(
    () => post(`${base(restaurantId)}/public-token/regenerate`),
    async (res) => (await json<{ token: string }>(res)).token
  );

export const adminRegenerateTableToken = (restaurantId: number, tableId: number) =>
  request(
    () => post(`${base(restaurantId)}/tables/${tableId}/public-token/regenerate`),
    async (res) => (await json<{ token: string }>(res)).token
  );

// ── Public (what the QR opens) ───────────────────────────────────────────────

export type PublicMenuOutcome =
  { status: "ok"; menu: PublicMenuResponse } | { status: "notFound" } | { status: "error" };

/**
 * The token is the only handle a guest holds. Unknown token, archived location and nothing
 * published all answer the same 404, so `notFound` is deliberately one state, not three.
 */
export async function fetchPublicMenu(
  kind: PublicMenuKind,
  token: string
): Promise<PublicMenuOutcome> {
  try {
    const res = await get(`/menus/${kind}/${encodeURIComponent(token)}`, {
      credentials: "omit",
    });
    if (res.status === 404) return { status: "notFound" };
    if (!res.ok) return { status: "error" };
    return { status: "ok", menu: (await res.json()) as PublicMenuResponse };
  } catch {
    return { status: "error" };
  }
}
