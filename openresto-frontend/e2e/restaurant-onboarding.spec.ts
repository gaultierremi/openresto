import { test, expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { ADMIN_EMAIL, ADMIN_PASSWORD } from "./helpers";

/**
 * The first restaurant, end to end: the platform creates it and mails an invitation, the
 * restaurateur accepts it, walks the five-step assistant and publishes, and the platform
 * suspends and reactivates it.
 *
 * What a unit test cannot say is asserted against the real server: that a draft restaurant is
 * not on the public list and a published one is, that a suspended one disappears again, that the
 * server (not the button) refuses a publication with a required step undone, and that the
 * restaurateur's session is refused everywhere the admin's is accepted. Every run uses a fresh
 * name and address because there is no delete endpoint.
 */
const stamp = Date.now();
const NAME = `Chez E2E ${stamp}`;
const OWNER_EMAIL = `e2e-resto-${stamp}@example.com`;
const PASSWORD = "A-long-enough-passphrase-1";
const BASE_URL = "http://localhost:5062";

async function signedInAsPlatform(browser: Browser): Promise<BrowserContext> {
  const ctx = await browser.newContext({ baseURL: BASE_URL });
  const res = await ctx.request.post("/api/admin/auth/login", {
    data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });
  expect(res.ok(), `platform login (HTTP ${res.status()})`).toBeTruthy();
  return ctx;
}

const listedPublicly = async (ctx: BrowserContext, name: string): Promise<boolean> => {
  const res = await ctx.request.get("/api/restaurants");
  const list = (await res.json()) as { name: string }[];
  return list.some((r) => r.name === name);
};

async function openInvitation(page: Page, path: string) {
  await page.goto(path);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByLabel("Confirm the password").fill(PASSWORD);
}

test("an unknown invitation link shows the one generic refusal", async ({ page }) => {
  await page.goto("/onboarding/invitation/not-a-real-token");
  await expect(page.getByTestId("invitation-invalid")).toBeVisible();
  await expect(page.getByTestId("invitation-submit")).toHaveCount(0);
});

test.describe.serial("Onboarding a restaurant", () => {
  let platform: BrowserContext;
  let restaurateur: BrowserContext;
  let restaurantId = 0;
  let invitationPath = "";
  let publicPath = "";

  let previousWebsiteUrl = "";

  // A website cannot go live on an instance with no public address of its own (its canonical
  // links would name the dev server), so the platform sets one first, as an operator does.
  test.beforeAll(async ({ browser }) => {
    platform = await signedInAsPlatform(browser);
    restaurateur = await browser.newContext({ baseURL: BASE_URL });

    const brand = (await (await platform.request.get("/api/brand")).json()) as {
      websiteUrl?: string;
    };
    previousWebsiteUrl = brand.websiteUrl ?? "";
    const set = await platform.request.patch("/api/brand", {
      data: { websiteUrl: "https://e2e-onboarding.example" },
    });
    expect(set.ok(), `setting the instance's public address (HTTP ${set.status()})`).toBeTruthy();
  });

  // The restaurant is archived, then deleted (the Owner's two-step), and the instance's address
  // put back, so the shared instance goes back to what the other specs expect to find.
  test.afterAll(async () => {
    await platform.request.patch("/api/brand", { data: { websiteUrl: previousWebsiteUrl } });
    if (restaurantId) {
      await platform.request.patch(`/api/admin/restaurants/${restaurantId}`, {
        data: { isArchived: true },
      });
      await platform.request.delete(`/api/admin/restaurants/${restaurantId}`);
    }
    await platform.close();
    await restaurateur.close();
  });

  test("the platform creates the restaurant: a draft, off the public list", async () => {
    const created = await platform.request.post("/api/platform/restaurants", {
      data: { name: NAME, ownerEmail: OWNER_EMAIL, locale: "fr" },
    });
    expect(created.status()).toBe(200);
    const body = (await created.json()) as {
      restaurant: { id: number; status: string };
      invitationUrl: string;
    };
    restaurantId = body.restaurant.id;
    invitationPath = new URL(body.invitationUrl).pathname;

    expect(body.restaurant.status).toBe("Draft");
    expect(invitationPath).toMatch(/^\/onboarding\/invitation\/.+/);
    expect(await listedPublicly(platform, NAME)).toBe(false);
  });

  test("the account cannot be made until every document is accepted", async () => {
    const page = await restaurateur.newPage();
    await openInvitation(page, invitationPath);
    await expect(page.getByTestId("invitation-restaurant")).toContainText(NAME);
    await expect(page.getByTestId("invitation-email")).toContainText(OWNER_EMAIL);

    const documents = ["terms", "privacy", "dpa"];
    await expect(page.getByTestId("invitation-submit")).toBeDisabled();
    for (const key of documents.slice(0, -1)) {
      await page.getByTestId(`invitation-consent-${key}`).click();
    }
    await expect(page.getByTestId("invitation-submit")).toBeDisabled();

    await page.getByTestId("invitation-consent-dpa").click();
    await expect(page.getByTestId("invitation-submit")).toBeEnabled();
    await page.getByTestId("invitation-submit").click();
    await expect(page.getByTestId("step-info")).toBeVisible();
    await page.close();
  });

  test("the consent was journalled with the version and a fingerprint of each text", async () => {
    const res = await platform.request.get(`/api/platform/restaurants/${restaurantId}/consents`);
    expect(res.status()).toBe(200);
    const rows = (await res.json()) as {
      documentKey: string;
      version: string;
      email: string;
      contentSha256: string;
    }[];
    expect(rows.map((r) => r.documentKey).sort()).toEqual(["dpa", "privacy", "terms"]);
    for (const row of rows) {
      expect(row.email).toBe(OWNER_EMAIL);
      expect(row.contentSha256).toMatch(/^[0-9a-f]{64}$/);
      expect(row.version).not.toBe("");
    }
  });

  test("a saved step is where the assistant reopens, even after signing in again", async ({
    browser,
  }) => {
    const page = await restaurateur.newPage();
    await page.goto("/onboarding");
    await expect(page.getByTestId("step-info")).toBeVisible();
    await page.getByLabel("Address", { exact: true }).fill("Rue de la Loi 16, 1000 Bruxelles");
    await page.getByLabel("Phone").fill("+32 2 123 45 67");
    await page.getByLabel("Contact e-mail").fill(OWNER_EMAIL);
    await page.getByLabel("Legal name").fill("Chez E2E SRL");
    await page.getByLabel("Enterprise number (BCE/KBO)").fill("0123.456.749");
    await page.getByTestId("step-info-continue").click();
    await expect(page.getByTestId("step-hours")).toBeVisible();
    await page.close();

    // A second browser signs in with the password chosen above and lands on the first undone step.
    const again = await browser.newContext({ baseURL: BASE_URL });
    const login = await again.newPage();
    await login.goto("/onboarding/login");
    await login.getByTestId("onboarding-login-email").fill(OWNER_EMAIL);
    await login.getByTestId("onboarding-login-password").fill(PASSWORD);
    await login.getByTestId("onboarding-login-submit").click();
    await expect(login.getByTestId("step-hours")).toBeVisible();
    await again.close();
  });

  test("the server refuses to publish while a required step is undone, and the page says which", async () => {
    const refused = await restaurateur.request.post(
      `/api/onboarding/restaurants/${restaurantId}/publish`
    );
    expect(refused.status()).toBe(400);
    expect(((await refused.json()) as { code?: string }).code).toBe("onboarding.not_publishable");
    expect(await listedPublicly(platform, NAME)).toBe(false);

    const page = await restaurateur.newPage();
    await page.goto("/onboarding");
    await page.getByTestId("stepper-preview").click();
    await expect(page.getByTestId("publish-blockers")).toBeVisible();
    await expect(page.getByTestId("publish-blocker-hours")).toBeVisible();
    await expect(page.getByTestId("publish-button")).toBeDisabled();
    await page.close();
  });

  test("the restaurateur finishes the steps and publishes: now on the public list", async () => {
    const page = await restaurateur.newPage();
    await page.goto("/onboarding");
    await expect(page.getByTestId("step-hours")).toBeVisible();
    await page.getByTestId("step-hours-continue").click();
    await expect(page.getByTestId("step-layout")).toBeVisible();
    await page.getByTestId("step-layout-continue").click();
    await expect(page.getByTestId("step-menu")).toBeVisible();
    await page.getByTestId("step-menu-skip").click();
    await expect(page.getByTestId("step-branding")).toBeVisible();
    await page.getByTestId("step-branding-skip").click();

    await expect(page.getByTestId("stage-preview")).toBeVisible();
    await expect(page.getByTestId("publish-blockers")).toHaveCount(0);
    await page.getByTestId("publish-button").click();
    await page.getByRole("button", { name: "Yes, publish" }).click();
    await expect(page.getByTestId("publish-live")).toBeVisible();

    await expect(page.getByTestId("publish-open-site")).toBeVisible();
    await page.close();

    const state = await restaurateur.request.get(`/api/onboarding/restaurants/${restaurantId}`);
    publicPath = ((await state.json()) as { links: { sitePath: string } }).links.sitePath;
    expect(publicPath).toMatch(/^\/r\/[a-z0-9-]+$/);

    expect(await listedPublicly(platform, NAME)).toBe(true);
    const site = await platform.request.get(publicPath);
    expect(site.status()).toBe(200);
    expect(await site.text()).toContain(NAME);
  });

  test("its website answers in the guest's language: Dutch on request, French by default", async () => {
    const read = async (url: string, acceptLanguage?: string) => {
      const res = await platform.request.get(
        url,
        acceptLanguage ? { headers: { "Accept-Language": acceptLanguage } } : {}
      );
      expect(res.status()).toBe(200);
      const html = await res.text();
      return {
        html,
        lang: /<html lang="([a-z]+)"/.exec(html)?.[1],
        vary: (res.headers()["vary"] ?? "").toLowerCase(),
      };
    };

    const explicit = await read(`${publicPath}?lang=nl`);
    expect(explicit.lang).toBe("nl");
    expect(explicit.html).toContain("Openingsuren");

    const negotiated = await read(publicPath, "nl-BE,nl;q=0.9,fr;q=0.5");
    expect(negotiated.lang).toBe("nl");
    expect(negotiated.vary).toContain("accept-language");

    expect((await read(`${publicPath}?lang=fr`, "nl-BE")).lang).toBe("fr");
    expect((await read(publicPath, "ja-JP")).lang).toBe("fr");
    expect((await read(publicPath, "fr-BE")).lang).toBe("fr");
  });

  test("the restaurateur's session opens nothing of the admin or the platform", async () => {
    for (const path of [
      "/api/admin/auth/me",
      "/api/admin/restaurants",
      "/api/admin/bookings",
      "/api/platform/restaurants",
    ]) {
      const res = await restaurateur.request.get(path);
      expect([401, 403], `${path} answered ${res.status()}`).toContain(res.status());
    }
    const guestData = await restaurateur.request.post(
      `/api/platform/restaurants/${restaurantId}/guest-data-access`,
      { data: { reason: "I would like to read my own guests" } }
    );
    expect([401, 403]).toContain(guestData.status());
  });

  test("the platform's list names the restaurant by counts and dates, never by its guests", async () => {
    const res = await platform.request.get("/api/platform/restaurants");
    const list = (await res.json()) as Record<string, unknown>[];
    const row = list.find((r) => r.name === NAME);
    expect(row).toBeTruthy();
    expect(row!.status).toBe("Published");
    expect(row!.ownerEmail).toBe(OWNER_EMAIL);
    expect(row!.totalBookings).toBe(0);
    expect(row!.lastLoginAt).toBeTruthy();
    expect(Object.keys(row!).join(" ").toLowerCase()).not.toMatch(
      /customer|guest|phone|special|booker/
    );
  });

  test("the guest data is read only with a stated reason", async () => {
    const url = `/api/platform/restaurants/${restaurantId}/guest-data-access`;
    const withoutReason = await platform.request.post(url, { data: { reason: "short" } });
    expect(withoutReason.status()).toBe(400);
    expect(((await withoutReason.json()) as { code?: string }).code).toBe(
      "platform.access_reason_required"
    );

    const granted = await platform.request.post(url, {
      data: { reason: "Ticket 4821: a booking confirmation never arrived" },
    });
    expect(granted.status()).toBe(200);
    expect(((await granted.json()) as { totalBookings: number }).totalBookings).toBe(0);
  });

  test("a suspension takes the restaurant off the public side and stops its writes; reactivating brings it back", async () => {
    const suspended = await platform.request.post(
      `/api/platform/restaurants/${restaurantId}/suspend`,
      { data: { reason: "Unpaid invoice, reopening once settled" } }
    );
    expect(suspended.status()).toBe(200);
    expect(await listedPublicly(platform, NAME)).toBe(false);
    expect((await platform.request.get(publicPath)).status()).toBe(404);

    const write = await restaurateur.request.post(
      `/api/onboarding/restaurants/${restaurantId}/unpublish`
    );
    expect(write.status()).toBe(409);
    expect(((await write.json()) as { code?: string }).code).toBe("onboarding.suspended");

    const page = await restaurateur.newPage();
    await page.goto("/onboarding");
    await expect(page.getByTestId("operations-dashboard")).toBeVisible();
    await page.close();

    const reopened = await platform.request.post(
      `/api/platform/restaurants/${restaurantId}/reactivate`
    );
    expect(reopened.status()).toBe(200);
    expect(await listedPublicly(platform, NAME)).toBe(true);
    expect((await platform.request.get(publicPath)).status()).toBe(200);
  });

  test("the restaurateur can take the restaurant offline again", async () => {
    const res = await restaurateur.request.post(
      `/api/onboarding/restaurants/${restaurantId}/unpublish`
    );
    expect(res.status()).toBe(200);
    expect(await listedPublicly(platform, NAME)).toBe(false);
    expect((await platform.request.get(publicPath)).status()).toBe(404);
  });
});
