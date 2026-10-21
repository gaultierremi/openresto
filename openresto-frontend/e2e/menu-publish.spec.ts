import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { gotoAdminDashboard } from "./helpers";

// Seeded location every admin spec shares (see admin-reorder-sections.spec.ts).
const RESTAURANT_ID = 1;
const MENU_NAME = "E2E Menu — publish flow";
const CATEGORY_NAME = "E2E Starters";
const DISH_NAME = "E2E Tomato soup";

interface ItemDto {
  id: number;
  name: string;
  availability: string;
}
interface CategoryDto {
  id: number;
  name: string;
  items: ItemDto[];
}
interface MenuDto {
  id: number;
  name: string;
  isPublished: boolean;
  categories: CategoryDto[];
}

/**
 * The public page once it has stopped loading: the restaurant's name when other menus are
 * published, the "unavailable" notice when this was the only one (as on a fresh instance).
 */
const settled = (page: Page) =>
  page.getByTestId("menu-restaurant-name").or(page.getByText("Carte indisponible"));

/**
 * A location with several published menus opens on the first one and offers the rest as tabs;
 * a lone menu has none. Reach this spec's menu either way.
 */
async function showSpecMenu(page: Page) {
  await expect(settled(page)).toBeVisible();
  const tab = page.getByTestId("menu-tab").filter({ hasText: MENU_NAME });
  if (await tab.count()) await tab.click();
}

const adminApi = `/api/admin/restaurants/${RESTAURANT_ID}`;

async function listMenus(request: APIRequestContext): Promise<MenuDto[]> {
  const res = await request.get(`${adminApi}/menus`);
  expect(res.ok()).toBeTruthy();
  return (await res.json()) as MenuDto[];
}

async function findMenu(request: APIRequestContext): Promise<MenuDto | undefined> {
  return (await listMenus(request)).find((m) => m.name === MENU_NAME);
}

async function deleteLeftovers(request: APIRequestContext) {
  for (const menu of (await listMenus(request)).filter((m) => m.name === MENU_NAME)) {
    await request.delete(`${adminApi}/menus/${menu.id}`);
  }
}

async function restaurantToken(request: APIRequestContext): Promise<string> {
  const res = await request.get(`${adminApi}/public-tokens`);
  expect(res.ok()).toBeTruthy();
  return ((await res.json()) as { restaurantToken: string }).restaurantToken;
}

/**
 * The menu module end to end, through the real admin UI and the real public page: create a dish,
 * publish its menu, and read it on the page a QR code opens, by its public token.
 *
 * The public page opens in French for a guest who has chosen no language, so its assertions are
 * French while the admin (no saved language, instance default) is English. Setup that is not the
 * point of a test goes through the API, and every menu the spec makes is deleted afterwards.
 */
test.describe("Menu: create, publish, read by token", () => {
  test.describe.configure({ mode: "serial" });

  let menuId = 0;
  let itemId = 0;

  test.beforeAll(async ({ request }) => {
    await deleteLeftovers(request);
  });

  test.afterAll(async ({ request }) => {
    await deleteLeftovers(request);
  });

  test("a dish created in the editor reaches the public page once its menu is published", async ({
    page,
    request,
  }) => {
    // Pin the editor to the seeded location whatever the last run remembered.
    await page.addInitScript(
      (id) => localStorage.setItem("menus:locationId", String(id)),
      RESTAURANT_ID
    );
    await gotoAdminDashboard(page);
    await page.goto("/admin/menus");

    await page.getByTestId("add-menu").click();
    await page.getByTestId("add-menu-name").fill(MENU_NAME);
    await page.getByTestId("add-menu-submit").click();
    await expect(page.getByTestId("menu-card-name").filter({ hasText: MENU_NAME })).toBeVisible();

    const created = await findMenu(request);
    expect(created).toBeDefined();
    menuId = created!.id;
    expect(created!.isPublished).toBe(false);

    await page.getByTestId(`add-category-${menuId}`).click();
    await page.getByTestId(`add-category-${menuId}-name`).fill(CATEGORY_NAME);
    await page.getByTestId(`add-category-${menuId}-submit`).click();
    await expect(page.getByTestId("category-block")).toBeVisible();

    const categoryId = (await findMenu(request))!.categories[0].id;
    await page.getByTestId(`add-item-${categoryId}`).click();
    await page.getByTestId(`add-item-${categoryId}-name`).fill(DISH_NAME);
    await page.getByTestId(`add-item-${categoryId}-price`).fill("12,50");
    await page.getByTestId(`add-item-${categoryId}-submit`).click();
    await expect(page.getByText(DISH_NAME, { exact: true })).toBeVisible();

    const dish = (await findMenu(request))!.categories[0].items[0];
    itemId = dish.id;
    expect(dish.name).toBe(DISH_NAME);

    // Before publishing, the dish is nowhere on the public page.
    const token = await restaurantToken(request);
    const draftPage = await page.context().newPage();
    await draftPage.goto(`/menu/r/${token}`);
    await expect(settled(draftPage)).toBeVisible();
    await expect(draftPage.getByText(DISH_NAME)).toHaveCount(0);
    await draftPage.close();

    await page.getByTestId(`menu-publish-${menuId}`).click();
    await expect(page.getByTestId("menu-status").first()).toBeVisible();
    await expect.poll(async () => (await findMenu(request))?.isPublished).toBe(true);

    const publicPage = await page.context().newPage();
    await publicPage.goto(`/menu/r/${token}`);
    await showSpecMenu(publicPage);
    await expect(publicPage.getByText(DISH_NAME, { exact: true })).toBeVisible();
    await expect(publicPage.getByText(/12,50/)).toBeVisible();
    await expect(publicPage.getByRole("button", { name: "Réserver une table" })).toBeVisible();
    await publicPage.close();
  });

  test("a dish marked sold out in service mode is greyed on the public page", async ({
    page,
    request,
  }) => {
    await page.addInitScript(
      (id) => localStorage.setItem("menus:locationId", String(id)),
      RESTAURANT_ID
    );
    await gotoAdminDashboard(page);
    await page.goto("/admin/menus/service");

    await page.getByTestId(`service-item-${itemId}`).click();
    await expect
      .poll(async () => (await findMenu(request))?.categories[0].items[0].availability)
      .toBe("SoldOut");

    const publicPage = await page.context().newPage();
    await publicPage.goto(`/menu/r/${await restaurantToken(request)}`);
    await showSpecMenu(publicPage);
    const row = publicPage.getByTestId("menu-item").filter({ hasText: DISH_NAME });
    await expect(row).toBeVisible();
    await expect(row.getByText("Épuisé")).toBeVisible();
    await publicPage.close();

    // And back again.
    await page.getByTestId(`service-item-${itemId}`).click();
    await expect
      .poll(async () => (await findMenu(request))?.categories[0].items[0].availability)
      .toBe("Available");
  });

  test("unpublishing takes the dish off the public page again", async ({ page, request }) => {
    const res = await request.post(`${adminApi}/menus/${menuId}/unpublish`);
    expect(res.ok()).toBeTruthy();

    await page.goto(`/menu/r/${await restaurantToken(request)}`);
    await expect(settled(page)).toBeVisible();
    await expect(page.getByText(DISH_NAME)).toHaveCount(0);
  });

  test("an unknown token shows the same unavailable page, not an error", async ({ page }) => {
    await page.goto("/menu/r/not-a-real-token");
    await expect(page.getByText("Carte indisponible")).toBeVisible();
  });
});
