import { test, expect, type APIRequestContext } from "@playwright/test";

// Seeded location every admin spec shares (see admin-reorder-sections.spec.ts).
const RESTAURANT_ID = 1;
const SLUG = "e2e-site-vitrine";
const CONTACT_EMAIL = "contact@e2e-site.example";
const siteApi = `/api/admin/restaurants/${RESTAURANT_ID}/site`;
const locationApi = `/api/admin/restaurants/${RESTAURANT_ID}`;

interface SiteDto {
  slug: string;
  isPublished: boolean;
  missing: string[];
}

const settings = (overrides: Record<string, unknown> = {}) => ({
  slug: SLUG,
  theme: "Brasserie",
  tagline: "Cuisine belge de saison",
  socialLinks: [{ kind: "Instagram", url: "https://instagram.example/e2e" }],
  legal: { name: "E2E SRL", companyNumber: "0123.456.789" },
  ...overrides,
});

async function setContactEmail(request: APIRequestContext, email: string) {
  const res = await request.patch(locationApi, { data: { emailAddress: email } });
  expect(res.ok()).toBeTruthy();
}

/**
 * A location's website through the real stack: nginx routes `/r/…` to the backend, the page is
 * plain HTML that loads nothing from anywhere else, and it exists for guests only while published.
 *
 * Setup that is not the point of a test goes through the admin API; the site is left unpublished
 * afterwards and the location's contact e-mail is put back.
 */
test.describe("Website: publish, read as a guest, unpublish", () => {
  test.describe.configure({ mode: "serial" });

  let previousEmail = "";

  test.beforeAll(async ({ request }) => {
    const location = await (await request.get(`/api/admin/restaurants`)).json();
    previousEmail =
      (location as { id: number; emailAddress?: string | null }[]).find(
        (r) => r.id === RESTAURANT_ID
      )?.emailAddress ?? "";
    await setContactEmail(request, CONTACT_EMAIL);
    const saved = await request.put(siteApi, { data: settings() });
    expect(saved.ok()).toBeTruthy();
  });

  test.afterAll(async ({ request }) => {
    await request.post(`${siteApi}/unpublish`);
    await setContactEmail(request, previousEmail);
  });

  test("an unpublished site is a 404 page that search engines are told to skip", async ({
    request,
    page,
  }) => {
    await request.post(`${siteApi}/unpublish`);

    const response = await page.goto(`/r/${SLUG}`);

    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: "Page introuvable" })).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex");
  });

  test("a site that lacks its legal notice cannot be published", async ({ request }) => {
    const blank = await request.put(siteApi, { data: settings({ legal: {} }) });
    expect(blank.ok()).toBeTruthy();
    expect(((await blank.json()) as SiteDto).missing).toEqual(["legal.name", "legal.companyNumber"]);

    const publish = await request.post(`${siteApi}/publish`);

    expect(publish.status()).toBe(400);
    expect(((await publish.json()) as { code: string }).code).toBe("site.not_publishable");
    expect((await request.get(`/r/${SLUG}`)).status()).toBe(404);

    expect((await request.put(siteApi, { data: settings() })).ok()).toBeTruthy();
  });

  test("a published site is French static HTML that loads nothing from another origin", async ({
    browser,
    request,
  }, testInfo) => {
    const published = await request.post(`${siteApi}/publish`);
    expect(published.ok()).toBeTruthy();

    // A fresh context: the admin project's session cookie must not be mistaken for the page's own.
    const context = await browser.newContext({ baseURL: testInfo.project.use.baseURL });
    const page = await context.newPage();
    const origins = new Set<string>();
    page.on("request", (r) => origins.add(new URL(r.url()).origin));

    const response = await page.goto(`/r/${SLUG}`);

    expect(response?.status()).toBe(200);
    expect(response?.headers()["content-type"]).toContain("text/html");
    expect(response?.headers()["content-security-policy"]).toContain("default-src 'none'");
    await expect(page.locator("html")).toHaveAttribute("lang", "fr");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByText("Cuisine belge de saison")).toBeVisible();
    await expect(page.getByRole("link", { name: "Réserver une table" }).first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "Horaires d’ouverture" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Mentions légales" })).toBeVisible();
    await expect(page.getByText("E2E SRL")).toBeVisible();
    await expect(page.getByText("n’utilise aucun cookie")).toBeVisible();

    expect(await context.cookies()).toEqual([]);
    expect([...origins]).toEqual([new URL(page.url()).origin]);

    const structured = JSON.parse(
      (await page.locator('script[type="application/ld+json"]').textContent()) ?? "{}"
    ) as { "@type": string; name: string };
    expect(structured["@type"]).toBe("Restaurant");
    expect(structured.name).toBeTruthy();
    await context.close();
  });

  test("the booking button leads into the location's booking flow", async ({ page }) => {
    await page.goto(`/r/${SLUG}`);

    await page.getByRole("link", { name: "Réserver une table" }).first().click();

    await expect(page).toHaveURL(new RegExp(`/locations/${RESTAURANT_ID}$`));
  });

  test("the sitemap lists the live site, and unpublishing removes both", async ({
    request,
    page,
  }) => {
    expect(await (await request.get("/sitemap.xml")).text()).toContain(`/r/${SLUG}</loc>`);
    expect(await (await request.get("/robots.txt")).text()).toContain("Sitemap:");

    expect((await request.post(`${siteApi}/unpublish`)).ok()).toBeTruthy();

    expect(await (await request.get("/sitemap.xml")).text()).not.toContain(`/r/${SLUG}<`);
    expect((await page.goto(`/r/${SLUG}`))?.status()).toBe(404);
  });
});
