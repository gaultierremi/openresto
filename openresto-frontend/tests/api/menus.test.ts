import * as menus from "@/api/menus";
import type { MenuItemDto, SaveItemInput } from "@/api/menus";

const mockFetch = jest.fn();
global.fetch = mockFetch;

const ok = (body: unknown, status = 200) =>
  mockFetch.mockResolvedValueOnce({ ok: true, status, json: async () => body });
const noContent = () => mockFetch.mockResolvedValueOnce({ ok: true, status: 204 });
const refuse = (body: unknown, status = 400) =>
  mockFetch.mockResolvedValueOnce({ ok: false, status, json: async () => body });

const lastCall = () => {
  const [url, init] = mockFetch.mock.calls[mockFetch.mock.calls.length - 1];
  return { url: String(url), init: init as RequestInit };
};

const ITEM: MenuItemDto = {
  id: 7,
  name: "Soup",
  description: "Hot",
  priceMinor: 650,
  imageUrl: null,
  availability: "Available",
  allergens: ["Celery"],
  dietaryTags: ["Vegan"],
  sortOrder: 0,
};

const ITEM_INPUT: SaveItemInput = {
  name: "Soup",
  description: "Hot",
  priceMinor: 650,
  availability: "Available",
  allergens: ["Celery"],
  dietaryTags: ["Vegan"],
};

beforeEach(() => {
  mockFetch.mockReset();
});

describe("request plumbing", () => {
  it("returns the parsed body on success", async () => {
    ok([{ id: 1 }]);
    expect(await menus.adminListMenus(3)).toEqual({ ok: true, value: [{ id: 1 }] });
    expect(lastCall().url).toContain("/api/admin/restaurants/3/menus");
    expect(lastCall().init.method).toBe("GET");
    expect(lastCall().init.credentials).toBe("include");
  });

  it("returns the server's message, in the viewer's language, when refused", async () => {
    refuse({ message: "Menu name cannot be empty.", code: "menu.name_required" });
    expect(
      await menus.adminCreateMenu(3, { name: "", description: null, currency: "EUR" })
    ).toEqual({ ok: false, message: "Menu name cannot be empty." });
  });

  it("falls back to a generic message when the refusal has no body", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => {
        throw new Error("not json");
      },
    });
    expect(await menus.adminListMenus(3)).toEqual({ ok: false, message: "Request failed." });
  });

  it("returns a network error message when the request throws", async () => {
    mockFetch.mockRejectedValueOnce(new Error("offline"));
    expect(await menus.adminListMenus(3)).toEqual({ ok: false, message: "Network error." });
  });
});

describe("menus", () => {
  it("creates, updates and deletes a menu", async () => {
    const input = { name: "Lunch", description: null, currency: "EUR" };

    ok({ id: 1 }, 201);
    await menus.adminCreateMenu(3, input);
    expect(lastCall().url).toMatch(/\/admin\/restaurants\/3\/menus$/);
    expect(lastCall().init.method).toBe("POST");
    expect(JSON.parse(lastCall().init.body as string)).toEqual(input);

    ok({ id: 1 });
    await menus.adminUpdateMenu(3, 1, input);
    expect(lastCall().url).toMatch(/\/menus\/1$/);
    expect(lastCall().init.method).toBe("PUT");

    noContent();
    expect(await menus.adminDeleteMenu(3, 1)).toEqual({ ok: true, value: null });
    expect(lastCall().url).toMatch(/\/menus\/1$/);
    expect(lastCall().init.method).toBe("DELETE");
  });

  it("publishes and unpublishes through their own endpoints", async () => {
    ok({ id: 1, isPublished: true });
    await menus.adminSetMenuPublished(3, 1, true);
    expect(lastCall().url).toMatch(/\/menus\/1\/publish$/);

    ok({ id: 1, isPublished: false });
    await menus.adminSetMenuPublished(3, 1, false);
    expect(lastCall().url).toMatch(/\/menus\/1\/unpublish$/);
    expect(lastCall().init.method).toBe("POST");
  });

  it("reorders menus with every sibling's id", async () => {
    noContent();
    await menus.adminReorderMenus(3, [2, 1]);
    expect(lastCall().url).toMatch(/\/menus\/reorder$/);
    expect(lastCall().init.method).toBe("PATCH");
    expect(JSON.parse(lastCall().init.body as string)).toEqual({ ids: [2, 1] });
  });
});

describe("categories", () => {
  const input = { name: "Starters", description: null, isVisible: true };

  it("nests creation and reordering under the menu, update and delete under the restaurant", async () => {
    ok({ id: 10 }, 201);
    await menus.adminCreateCategory(3, 1, input);
    expect(lastCall().url).toMatch(/\/restaurants\/3\/menus\/1\/categories$/);
    expect(lastCall().init.method).toBe("POST");

    ok({ id: 10 });
    await menus.adminUpdateCategory(3, 10, input);
    expect(lastCall().url).toMatch(/\/restaurants\/3\/menu-categories\/10$/);
    expect(lastCall().init.method).toBe("PUT");

    noContent();
    await menus.adminDeleteCategory(3, 10);
    expect(lastCall().url).toMatch(/\/menu-categories\/10$/);
    expect(lastCall().init.method).toBe("DELETE");

    noContent();
    await menus.adminReorderCategories(3, 1, [11, 10]);
    expect(lastCall().url).toMatch(/\/menus\/1\/categories\/reorder$/);
    expect(JSON.parse(lastCall().init.body as string)).toEqual({ ids: [11, 10] });
  });
});

describe("items", () => {
  it("creates, updates, deletes and reorders under the restaurant", async () => {
    ok(ITEM, 201);
    await menus.adminCreateItem(3, 10, ITEM_INPUT);
    expect(lastCall().url).toMatch(/\/restaurants\/3\/menu-categories\/10\/items$/);
    expect(lastCall().init.method).toBe("POST");

    ok(ITEM);
    await menus.adminUpdateItem(3, 7, ITEM_INPUT);
    expect(lastCall().url).toMatch(/\/restaurants\/3\/menu-items\/7$/);
    expect(lastCall().init.method).toBe("PUT");
    expect(JSON.parse(lastCall().init.body as string)).toEqual(ITEM_INPUT);

    noContent();
    await menus.adminDeleteItem(3, 7);
    expect(lastCall().init.method).toBe("DELETE");

    noContent();
    await menus.adminReorderItems(3, 10, [8, 7]);
    expect(lastCall().url).toMatch(/\/menu-categories\/10\/items\/reorder$/);
  });

  it("turns a dish into the payload the update endpoint takes", () => {
    expect(menus.itemToInput(ITEM)).toEqual(ITEM_INPUT);
  });

  it("changes only the availability, resending every other field from the dish", async () => {
    ok({ ...ITEM, availability: "SoldOut" });
    const result = await menus.adminSetItemAvailability(3, ITEM, "SoldOut");

    expect(result.ok).toBe(true);
    expect(lastCall().url).toMatch(/\/menu-items\/7$/);
    expect(JSON.parse(lastCall().init.body as string)).toEqual({
      ...ITEM_INPUT,
      availability: "SoldOut",
    });
  });

  it("uploads a photo as multipart form data, leaving the Content-Type to the browser", async () => {
    ok({ ...ITEM, imageUrl: "/media/dish-7.png" });
    const file = new File(["x"], "dish.png", { type: "image/png" });

    const result = await menus.adminUploadItemPhoto(3, 7, file);

    expect(result).toMatchObject({ ok: true, value: { imageUrl: "/media/dish-7.png" } });
    const { url, init } = lastCall();
    expect(url).toMatch(/\/menu-items\/7\/photo$/);
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("include");
    expect(init.body).toBeInstanceOf(FormData);
    expect((init.body as FormData).get("file")).toBe(file);
    expect(init.headers).toBeUndefined();
  });

  it("returns the server's refusal of a photo", async () => {
    refuse({ message: "Dish photo must be under 2 MB.", code: "menu.item_image_too_large" });
    const result = await menus.adminUploadItemPhoto(3, 7, new File(["x"], "d.png"));
    expect(result).toEqual({ ok: false, message: "Dish photo must be under 2 MB." });
  });

  it("deletes a photo", async () => {
    noContent();
    await menus.adminDeleteItemPhoto(3, 7);
    expect(lastCall().url).toMatch(/\/menu-items\/7\/photo$/);
    expect(lastCall().init.method).toBe("DELETE");
  });
});

describe("public tokens", () => {
  it("lists them", async () => {
    ok({ restaurantToken: "abc", tables: [] });
    expect(await menus.adminGetPublicTokens(3)).toEqual({
      ok: true,
      value: { restaurantToken: "abc", tables: [] },
    });
    expect(lastCall().url).toMatch(/\/restaurants\/3\/public-tokens$/);
  });

  it("regenerates the restaurant's token and returns the new one", async () => {
    ok({ token: "new-restaurant-token" });
    expect(await menus.adminRegenerateRestaurantToken(3)).toEqual({
      ok: true,
      value: "new-restaurant-token",
    });
    expect(lastCall().url).toMatch(/\/restaurants\/3\/public-token\/regenerate$/);
    expect(lastCall().init.method).toBe("POST");
  });

  it("regenerates one table's token", async () => {
    ok({ token: "new-table-token" });
    expect(await menus.adminRegenerateTableToken(3, 5)).toEqual({
      ok: true,
      value: "new-table-token",
    });
    expect(lastCall().url).toMatch(/\/restaurants\/3\/tables\/5\/public-token\/regenerate$/);
  });

  it("reports a refusal, such as a Manager asking to regenerate", async () => {
    refuse({ message: "Forbidden" }, 403);
    expect(await menus.adminRegenerateRestaurantToken(3)).toEqual({
      ok: false,
      message: "Forbidden",
    });
  });
});

describe("fetchPublicMenu", () => {
  const response = {
    restaurant: { name: "Chez Paul", timezone: "Europe/Paris" },
    table: null,
    menus: [],
  };

  it("fetches the restaurant's menu by token without sending credentials", async () => {
    ok(response);
    expect(await menus.fetchPublicMenu("r", "tok")).toEqual({ status: "ok", menu: response });
    expect(lastCall().url).toMatch(/\/api\/menus\/r\/tok$/);
    expect(lastCall().init.credentials).toBe("omit");
  });

  it("fetches a table's menu through the t route", async () => {
    ok(response);
    await menus.fetchPublicMenu("t", "tok");
    expect(lastCall().url).toMatch(/\/api\/menus\/t\/tok$/);
  });

  it("escapes a token that is not URL-safe instead of letting it change the path", async () => {
    ok(response);
    await menus.fetchPublicMenu("r", "a/b?c");
    expect(lastCall().url).toMatch(/\/api\/menus\/r\/a%2Fb%3Fc$/);
  });

  it("reports a 404 as one not-found state", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });
    expect(await menus.fetchPublicMenu("r", "nope")).toEqual({ status: "notFound" });
  });

  it("reports any other failure as an error, so the page can offer a retry", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });
    expect(await menus.fetchPublicMenu("r", "tok")).toEqual({ status: "error" });
  });

  it("reports a network failure as an error", async () => {
    mockFetch.mockRejectedValueOnce(new Error("offline"));
    expect(await menus.fetchPublicMenu("r", "tok")).toEqual({ status: "error" });
  });
});
