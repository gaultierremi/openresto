import { test, expect } from "@playwright/test";

/**
 * The public legal pages and the Dutch guest surface, against the real server: the documents
 * come from `/api/legal` and say they are templates, the footer reaches them from the guest
 * pages, and Dutch is chosen from the browser's language yet gives way to an explicit `?lang=`
 * or a saved pick. A restaurant's own website is server-rendered and follows `Accept-Language`
 * and `?lang=` itself; that is checked in `restaurant-onboarding.spec.ts`, which publishes a
 * restaurant of its own to read.
 */

test.describe("Legal pages", () => {
  test("the index lists the four documents and warns that they are templates", async ({ page }) => {
    await page.goto("/legal");
    await expect(page.getByTestId("legal-review-banner")).toBeVisible();
    for (const key of ["terms", "privacy", "dpa", "legal-notice"]) {
      await expect(page.locator(`a[href="/legal/${key}"]`).first()).toBeVisible();
    }
  });

  test("a document shows its version, its template warning and the fields still to fill in", async ({
    page,
  }) => {
    await page.goto("/legal/terms");
    await expect(page.getByTestId("legal-version")).toContainText(/\d{4}-\d{2}-\d{2}/);
    await expect(page.getByTestId("legal-review-banner")).toBeVisible();
    await expect(page.getByText("Texte en français", { exact: false })).toBeVisible();
    expect(await page.getByRole("heading", { level: 2 }).count()).toBeGreaterThan(2);
    await expect(page.locator("main")).toContainText("[Dénomination de la société exploitante]");
  });

  test("a document that does not exist says so, and shows no text", async ({ page }) => {
    await page.goto("/legal/not-a-document");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Document introuvable");
    await expect(page.getByRole("heading", { level: 2 })).toHaveCount(0);
  });

  test("the guest footer reaches the terms and the legal notice", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("footer-terms")).toBeVisible();
    await page.getByTestId("footer-terms").click();
    await expect(page).toHaveURL(/\/legal\/terms$/);
  });

  test("the documents are served without a session", async ({ request }) => {
    const res = await request.get("/api/legal");
    expect(res.status()).toBe(200);
    const docs = (await res.json()) as { key: string }[];
    expect(docs.map((d) => d.key).sort()).toEqual(["dpa", "legal-notice", "privacy", "terms"]);
  });
});

test.describe("Dutch guest interface", () => {
  test.describe("a browser that asks for Dutch", () => {
    test.use({ locale: "nl-BE" });

    test("is answered in Dutch without any choice being made", async ({ page }) => {
      await page.goto("/");
      await expect(page.getByText("Onze vestigingen")).toBeVisible();
    });

    test("gives way to an explicit ?lang=", async ({ page }) => {
      await page.goto("/?lang=fr");
      await expect(page.getByText("Onze vestigingen")).toHaveCount(0);
      await expect(
        page.getByText("Nos établissements").or(page.getByText("Nos restaurants"))
      ).toBeVisible();
    });
  });

  test.describe("a browser that asks for a language the app does not have", () => {
    test.use({ locale: "ja-JP" });

    test("is answered in the instance's default language, not in Dutch", async ({ page }) => {
      await page.goto("/");
      await expect(page.getByText("Our locations")).toBeVisible();
    });
  });

  test("a saved choice outranks the browser's language", async ({ browser }) => {
    const ctx = await browser.newContext({ locale: "nl-BE" });
    await ctx.addInitScript(() => localStorage.setItem("openresto.locale", "en"));
    const page = await ctx.newPage();
    await page.goto("/");
    await expect(page.getByText("Our locations")).toBeVisible();
    await ctx.close();
  });
});
