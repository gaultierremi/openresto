import { test, expect, type Page } from "@playwright/test";

/**
 * The platform space in a browser, as the Owner uses it: add a restaurant and get the invitation
 * link once, suspend and reactivate it with the confirmations in the way, and open its guests
 * only through the reason prompt. Whether the server then does what the screens claim is
 * `restaurant-onboarding.spec.ts`; this one is about what the Owner is shown and made to do.
 */
const stamp = Date.now();
const NAME = `Platform E2E ${stamp}`;
const OWNER_EMAIL = `e2e-platform-${stamp}@example.com`;

const row = (page: Page) =>
  page.locator('[data-testid^="platform-row-"]').filter({ hasText: NAME });

async function openPlatform(page: Page) {
  await page.goto("/admin/platform");
  await expect(page.getByTestId("platform-list")).toBeVisible();
}

test.describe.serial("Platform space", () => {
  test("adds a restaurant as a draft and shows the invitation link once", async ({ page }) => {
    await openPlatform(page);
    await page.getByRole("button", { name: "Add a restaurant" }).click();

    await page.getByLabel("Restaurant name").fill(NAME);
    await page.getByLabel("Owner’s e-mail address").fill("not-an-address");
    await page.getByRole("button", { name: "Create and invite" }).click();
    await expect(page.getByText("Enter a valid e-mail address.")).toBeVisible();

    await page.getByLabel("Owner’s e-mail address").fill(OWNER_EMAIL);
    await page.getByRole("button", { name: "Create and invite" }).click();

    const link = page.getByTestId("invitation-link");
    await expect(link).toBeVisible();
    await expect(link).toHaveValue(/\/onboarding\/invitation\/.+/);
    await expect(page.getByText(/shown only once/)).toBeVisible();

    // The backdrop is also labelled "Close"; the window's own button is the last one.
    await page.getByRole("button", { name: "Close", exact: true }).last().click();
    await expect(page.getByTestId("invitation-link")).toHaveCount(0);

    await expect(row(page)).toBeVisible();
    await expect(row(page).getByTestId("platform-status-badge")).toContainText("Draft");
    await expect(row(page)).toContainText(OWNER_EMAIL);
  });

  test("the row carries counts and dates only", async ({ page }) => {
    await openPlatform(page);
    const text = (await row(page).innerText()).toLowerCase();
    expect(text).not.toContain("camille");
    expect(text).not.toMatch(/@(?!example\.com)/);
  });

  test("a suspension needs its confirmation, then shows the badge and a reactivate action", async ({
    page,
  }) => {
    await openPlatform(page);
    await row(page).getByRole("button", { name: "Suspend" }).click();
    await page.getByLabel("Reason (optional)").fill("Paused while the paperwork is sorted");
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByText(`Suspend ${NAME}?`)).toBeVisible();

    // Backing out leaves the restaurant exactly as it was.
    await page.getByRole("button", { name: "Back" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();
    await expect(row(page).getByTestId("platform-status-badge")).toContainText("Draft");

    await row(page).getByRole("button", { name: "Suspend" }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: "Yes, suspend" }).click();
    await expect(row(page).getByTestId("platform-status-badge")).toContainText("Suspended");

    await row(page).getByRole("button", { name: "Reactivate" }).click();
    await page.getByRole("button", { name: "Reactivate" }).last().click();
    await expect(row(page).getByTestId("platform-status-badge")).toContainText("Draft");
  });

  test("the guest data opens only once a reason of at least 10 characters is given", async ({
    page,
  }) => {
    await openPlatform(page);
    await row(page).getByRole("button", { name: "Guest data…" }).click();
    await expect(page.getByTestId("guest-data-warning")).toBeVisible();
    await expect(page.getByTestId("guest-data-banner")).toHaveCount(0);

    const submit = page.getByRole("button", { name: "Open the guest data" });
    await page.getByLabel("Reason for the access").fill("too short");
    await expect(submit).toBeDisabled();

    await page.getByLabel("Reason for the access").fill("Ticket 4821: confirmation never arrived");
    await expect(submit).toBeEnabled();
    await submit.click();
    await expect(page.getByTestId("guest-data-banner")).toContainText("Access logged");
    await expect(page.getByTestId("guest-data-empty")).toBeVisible();

    await page.getByRole("button", { name: "Close and discard" }).click();
    await expect(page.getByTestId("guest-data-banner")).toHaveCount(0);
  });

  test("the access left a trace in the activity log, with the reason", async ({ page }) => {
    const res = await page.request.get("/api/admin/audit?pageSize=50");
    expect(res.status()).toBe(200);
    expect(await res.text()).toContain("Ticket 4821: confirmation never arrived");
  });

  test("the consents window says so when nobody has accepted anything yet", async ({ page }) => {
    await openPlatform(page);
    await row(page).getByRole("button", { name: "Consents" }).click();
    await expect(page.getByTestId("consents-empty")).toBeVisible();
  });
});
