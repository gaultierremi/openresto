import { test, expect } from "@playwright/test";
import { ADMIN_EMAIL, ADMIN_PASSWORD } from "./helpers";

test("a restaurateur edits a multilingual menu, serves a table and prints both PDFs", async ({
  browser,
}) => {
  const platform = await browser.newContext({ baseURL: "http://localhost:5062" });
  const restaurateur = await browser.newContext({ baseURL: "http://localhost:5062" });
  await restaurateur.addInitScript(() => localStorage.setItem("openresto.locale", "fr"));
  let id = 0;
  let previousWebsiteUrl = "";
  try {
    expect(
      (
        await platform.request.post("/api/admin/auth/login", {
          data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
        })
      ).ok()
    ).toBeTruthy();
    previousWebsiteUrl = (await (await platform.request.get("/api/brand")).json()).websiteUrl ?? "";
    expect(
      (
        await platform.request.patch("/api/brand", {
          data: { websiteUrl: "http://localhost:5062" },
        })
      ).ok()
    ).toBeTruthy();
    const created = await platform.request.post("/api/platform/restaurants", {
      data: {
        name: `Brasserie Fictive QR ${Date.now()}`,
        ownerEmail: `qr-${Date.now()}@resto.example`,
        locale: "fr",
      },
    });
    expect(created.ok()).toBeTruthy();
    const invitation = await created.json();
    id = invitation.restaurant.id;
    const token = new URL(invitation.invitationUrl).pathname.split("/").pop();
    const documents = await (
      await restaurateur.request.get(`/api/onboarding/invitations/${token}`)
    ).json();
    expect(
      (
        await restaurateur.request.post(`/api/onboarding/invitations/${token}/accept`, {
          data: { password: "Fictitious-passphrase-1", acceptedDocuments: documents.documents },
        })
      ).ok()
    ).toBeTruthy();
    const path = `/api/onboarding/restaurants/${id}`;
    expect(
      (
        await restaurateur.request.put(`${path}/info`, {
          data: {
            name: invitation.restaurant.name,
            address: "Rue du Nuage 1, 1000 Bruxelles",
            phoneNumber: "+32 2 000 00 00",
            emailAddress: "bonjour@resto.example",
            legalName: "Brasserie Fictive SRL",
            companyNumber: "0123456749",
            bookingRetentionMonths: 12,
          },
        })
      ).ok()
    ).toBeTruthy();
    expect(
      (
        await restaurateur.request.put(`${path}/hours`, {
          data: {
            openHours: [{ day: 1, open: "12:00", close: "22:00" }],
            defaultBookingDurationMinutes: 90,
          },
        })
      ).ok()
    ).toBeTruthy();
    expect(
      (
        await restaurateur.request.put(`${path}/layout`, {
          data: {
            sections: [{ name: "Salle Nuage", tables: [{ name: "Table Nuage", seats: 2 }] }],
          },
        })
      ).ok()
    ).toBeTruthy();

    const page = await restaurateur.newPage();
    await page.goto(`/onboarding/restaurant/${id}?step=menu`);
    await page.getByTestId("menu-add-category").click();
    await page.getByTestId("category-0-name").fill("Plats");
    await page.getByTestId("category-0-dish-0-name").fill("Soupe du jour");
    await page.getByTestId("category-0-dish-0-description").fill("Légumes de saison");
    await page.getByTestId("category-0-dish-0-price").fill("7,50");
    await page.getByTestId("category-0-dish-0-declarations").click();
    await expect(page.locator('[data-testid^="category-0-dish-0-allergen-"]')).toHaveCount(14);
    await page.getByTestId("category-0-dish-0-allergen-Celery").click();
    await page.getByTestId("category-0-dish-0-suggest-nl").click();
    expect((await (await restaurateur.request.get(path)).json()).menu.categories).toHaveLength(0);
    await page.getByTestId("category-0-dish-0-validate-nl").click();
    await page.getByTestId("category-0-dish-0-suggest-en").click();
    await page.getByTestId("category-0-dish-0-validate-en").click();
    await page.getByTestId("step-menu-continue").click();
    await expect(page.getByTestId("step-branding")).toBeVisible();
    const state = await (await restaurateur.request.get(path)).json();
    const dish = state.menu.categories[0].items[0];
    expect(dish.translations.nl.name).toBe("Soep van de dag");
    expect(dish.priceMinor).toBe(750);
    await page.goto(`/onboarding/restaurant/${id}?step=menu`);
    const chooser = page.waitForEvent("filechooser");
    await page.getByTestId(`dish-${dish.id}-photo`).click();
    await (
      await chooser
    ).setFiles({
      name: "fictif.png",
      mimeType: "image/png",
      buffer: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aRZkAAAAASUVORK5CYII=",
        "base64"
      ),
    });
    await expect(page.getByTestId(`dish-service-${dish.id}`).locator("img")).toBeVisible();
    await page.getByTestId(`dish-${dish.id}-SoldOut`).click();
    await expect
      .poll(
        async () =>
          (await (await restaurateur.request.get(path)).json()).menu.categories[0].items[0]
            .availability
      )
      .toBe("SoldOut");
    expect((await restaurateur.request.post(`${path}/publish`)).ok()).toBeTruthy();
    const tokens = await (await restaurateur.request.get(`${path}/menu/tokens`)).json();
    const guest = await browser.newContext({
      baseURL: "http://localhost:5062",
      viewport: { width: 390, height: 844 },
    });
    const mobile = await guest.newPage();
    try {
      for (const [language, name] of [
        ["fr", "Soupe du jour"],
        ["nl", "Soep van de dag"],
        ["en", "Soup of the day"],
      ]) {
        await mobile.goto(`/menu/t/${tokens.tables[0].token}?lang=${language}`);
        await expect(mobile.getByTestId("menu-restaurant-name")).toContainText(
          invitation.restaurant.name
        );
        await expect(mobile.getByText(name, { exact: true })).toBeVisible();
        await expect(mobile.getByText(/Table Nuage/)).toBeVisible();
        expect(
          await mobile.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
        ).toBeTruthy();
      }
      const printed = mobile.waitForEvent("popup");
      await mobile.getByTestId("public-menu-print").click();
      const pdfPage = await printed;
      await pdfPage.waitForLoadState();
      await expect(pdfPage.locator("article")).toContainText("Soup of the day");
      await expect(pdfPage.locator("article")).toContainText("Sold out");
      const pdf = await pdfPage.pdf({ preferCSSPageSize: true });
      expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
      expect(pdf.length).toBeGreaterThan(3000);
      await pdfPage.close();
    } finally {
      await guest.close();
    }

    await page.goto(`/onboarding/restaurant/${id}?step=preview`);
    const popup = page.waitForEvent("popup");
    await page.getByTestId("menu-print-qrs").click();
    const qrPage = await popup;
    await expect(qrPage.locator("figure")).toHaveCount(2);
    await expect(qrPage.locator("body")).toContainText(`/menu/r/${tokens.restaurantToken}`);
    await expect(qrPage.locator("body")).toContainText(`/menu/t/${tokens.tables[0].token}`);
    const qrPdf = await qrPage.pdf({ preferCSSPageSize: true });
    expect(qrPdf.subarray(0, 5).toString()).toBe("%PDF-");
    await qrPage.close();
  } finally {
    if (id) {
      await platform.request.patch(`/api/admin/restaurants/${id}`, { data: { isArchived: true } });
      await platform.request.delete(`/api/admin/restaurants/${id}`);
    }
    await platform.request.patch("/api/brand", { data: { websiteUrl: previousWebsiteUrl } });
    await platform.close();
    await restaurateur.close();
  }
});
