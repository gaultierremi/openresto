import { test, expect, type APIRequestContext } from "@playwright/test";
import { gotoAdminDashboard } from "./helpers";

// Seeded location every admin spec shares (see admin-reorder-sections.spec.ts).
const RESTAURANT_ID = 1;
const SLUG = "e2e-mon-site";
const CONTACT_EMAIL = "contact@e2e-mon-site.example";
const siteApi = `/api/admin/restaurants/${RESTAURANT_ID}/site`;
const locationApi = `/api/admin/restaurants/${RESTAURANT_ID}`;

interface SiteDto {
  isPublished: boolean;
  theme: string;
  missing: string[];
  legal: { name?: string | null; companyNumber?: string | null };
}

const getSite = async (request: APIRequestContext) =>
  (await (await request.get(siteApi)).json()) as SiteDto;

/**
 * The "Mon site" screen through the real admin UI: what stops a site going live, the autosaved
 * legal notice that lifts it, publishing and unpublishing, and the preview that shows a theme
 * before it is chosen. The page itself is covered by site-public.spec.ts.
 *
 * Setup that is not the point of a test goes through the admin API; the site is left unpublished
 * and the location's contact e-mail is put back.
 */
test.describe("Mon site: fill in, publish, preview", () => {
  test.describe.configure({ mode: "serial" });

  let previousEmail = "";

  test.beforeAll(async ({ request }) => {
    const all = (await (await request.get("/api/admin/restaurants")).json()) as {
      id: number;
      emailAddress?: string | null;
    }[];
    previousEmail = all.find((r) => r.id === RESTAURANT_ID)?.emailAddress ?? "";
    expect((await request.patch(locationApi, { data: { emailAddress: CONTACT_EMAIL } })).ok()).toBe(
      true
    );
    await request.post(`${siteApi}/unpublish`);
    const reset = await request.put(siteApi, {
      data: { slug: SLUG, theme: "Brasserie", tagline: "Cuisine belge", legal: {} },
    });
    expect(reset.ok()).toBe(true);
  });

  test.afterAll(async ({ request }) => {
    await request.post(`${siteApi}/unpublish`);
    await request.patch(locationApi, { data: { emailAddress: previousEmail } });
  });

  test.beforeEach(async ({ page }) => {
    // Pin the screen to the seeded location whatever the last run remembered.
    await page.addInitScript(
      (id) => localStorage.setItem("menus:locationId", String(id)),
      RESTAURANT_ID
    );
    await gotoAdminDashboard(page);
    await page.goto("/admin/site");
    await expect(page.getByTestId("site-publish")).toBeVisible();
  });

  test("a site without its legal notice shows what is missing and cannot be published", async ({
    page,
  }) => {
    await expect(page.getByTestId("site-status")).toBeVisible();
    await expect(page.getByTestId("site-checklist")).toBeVisible();
    await expect(page.getByTestId("site-publish-button")).toBeDisabled();
  });

  test("filling the legal notice autosaves it and lets the site be published, then taken down", async ({
    page,
    request,
  }) => {
    await page.getByTestId("site-legal-name").fill("E2E Mon Site SRL");
    await page.getByTestId("site-company-number").fill("0123.456.789");

    await expect.poll(async () => (await getSite(request)).missing).toEqual([]);
    await expect(page.getByTestId("site-checklist")).toHaveCount(0);
    await expect(page.getByTestId("site-publish-button")).toBeEnabled();

    await page.getByTestId("site-publish-button").click();
    await expect(page.getByTestId("site-public-url")).toBeVisible();
    expect((await getSite(request)).isPublished).toBe(true);
    expect((await request.get(`/r/${SLUG}`)).status()).toBe(200);

    await page.getByTestId("site-unpublish").click();
    await expect(page.getByTestId("site-publish-button")).toBeVisible();
    expect((await getSite(request)).isPublished).toBe(false);
    expect((await request.get(`/r/${SLUG}`)).status()).toBe(404);
  });

  test("choosing a theme saves it and the preview follows", async ({ page, request }) => {
    const preview = page.frameLocator('[data-testid="site-preview"] iframe');
    await expect(preview.getByRole("heading", { level: 1 })).toBeVisible();

    await page.getByTestId("site-theme-Cafe").click();

    await expect.poll(async () => (await getSite(request)).theme).toBe("Cafe");
    await expect(preview.getByRole("heading", { level: 1 })).toBeVisible();
    await request.put(siteApi, {
      data: {
        slug: SLUG,
        theme: "Brasserie",
        tagline: "Cuisine belge",
        legal: (await getSite(request)).legal,
      },
    });
  });
});
