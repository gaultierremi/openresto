import { test, expect, type BrowserContext, type APIResponse } from "@playwright/test";
import { ADMIN_STATE_FILE } from "./global-setup";
import { futureDateStr, selectBookingDate } from "./helpers";
import en from "../locales/en.json";
import fr from "../locales/fr.json";
import nl from "../locales/nl.json";

async function body(response: Pick<APIResponse, "ok" | "text" | "json">) {
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json();
}

for (const [language, copy, dish, bookLabel] of [
  ["fr", fr, "Soupe de légumes", "Réserver une table"],
  ["nl", nl, "Groentesoep", "Reserveer een tafel"],
  ["en", en, "Vegetable soup", "Book a table"],
] as const) {
  test.describe(`N4 — ${language}`, { tag: "@smoke" }, () => {
    test.use({ locale: language === "en" ? "en-GB" : `${language}-BE` });
    let platform: BrowserContext;
    let restaurantId = 0;
    let token = "";
    let previousWebsite = "";
    const slug = `e2e-n4-${language}`;

    test.beforeAll(async ({ browser }) => {
      platform = await browser.newContext({
        baseURL: "http://localhost:5062",
        storageState: ADMIN_STATE_FILE,
      });
      const api = platform.request;
      previousWebsite = (await body(await api.get("/api/brand"))).websiteUrl ?? "";
      await body(await api.patch("/api/brand", { data: { websiteUrl: "http://localhost:5062" } }));
      const restaurant = await body(
        await api.post("/api/admin/restaurants", {
          data: { name: `E2E N4 ${language}`, address: "Rue Exemple 1, 1000 Bruxelles" },
        })
      );
      restaurantId = restaurant.id;
      await body(
        await api.put(`/api/restaurants/${restaurantId}`, {
          data: {
            name: restaurant.name,
            emailAddress: "contact@example.com",
            openDays: "1,2,3,4,5,6,7",
            openTime: "10:00",
            closeTime: "23:00",
            timezone: "Europe/Brussels",
          },
        })
      );
      const section = await body(
        await api.post(`/api/restaurants/${restaurantId}/sections`, { data: { name: "Salle" } })
      );
      await body(
        await api.post(`/api/restaurants/${restaurantId}/sections/${section.id}/tables`, {
          data: { name: "T1", seats: 4 },
        })
      );
      const base = `/api/admin/restaurants/${restaurantId}`;
      const menu = await body(await api.post(`${base}/menus`, { data: { name: "Menu N4" } }));
      const category = await body(
        await api.post(`${base}/menus/${menu.id}/categories`, { data: { name: "Plats" } })
      );
      await body(
        await api.post(`${base}/menu-categories/${category.id}/items`, {
          data: {
            name: "Soupe de légumes",
            description: "Texte principal",
            primaryLanguage: "fr",
            priceMinor: 1250,
            translations: {
              nl: { name: "Groentesoep", description: null },
              en: { name: "Vegetable soup", description: "Vegetables" },
            },
          },
        })
      );
      await body(await api.post(`${base}/menus/${menu.id}/publish`));
      token = (await body(await api.get(`${base}/public-tokens`))).restaurantToken;
      await body(
        await api.put(`${base}/site`, {
          data: {
            slug,
            theme: "Brasserie",
            legal: { name: "Exemple SRL", companyNumber: "0123.456.749" },
          },
        })
      );
      await body(await api.post(`${base}/site/publish`));
    });

    test.afterAll(async () => {
      if (!platform) return;
      if (restaurantId) {
        await platform.request.patch(`/api/admin/restaurants/${restaurantId}`, {
          data: { isArchived: true },
        });
        await platform.request.delete(`/api/admin/restaurants/${restaurantId}`);
      }
      await platform.request.patch("/api/brand", { data: { websiteUrl: previousWebsite } });
      await platform.close();
    });

    test("browser language → QR menu → public site → reservation → confirmation", async ({
      page,
    }, testInfo) => {
      await page.goto(`/menu/r/${token}`);
      await expect(page.locator("html")).toHaveAttribute("lang", language);
      await expect(page.getByTestId("menu-item").getByText(dish, { exact: true })).toBeVisible();
      await expect(
        page.getByText(language === "en" ? "Vegetables" : "Texte principal", { exact: true })
      ).toBeVisible();

      await page.goto(`/r/${slug}`);
      await expect(page.locator("html")).toHaveAttribute("lang", language);
      await expect(page.locator(".dish .nm")).toHaveText(dish);
      await expect(page.getByRole("link", { name: "English", exact: true })).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath(`site-${language}.png`), fullPage: true });
      await testInfo.attach(`Site ${language}`, {
        path: testInfo.outputPath(`site-${language}.png`),
        contentType: "image/png",
      });
      await page.getByRole("link", { name: bookLabel, exact: true }).first().click();
      await expect(page).toHaveURL(new RegExp(`/locations/${restaurantId}\\?lang=${language}`));
      await expect(page.getByTestId("locations-filter-bar")).toBeVisible();
      await selectBookingDate(page, futureDateStr(20));
      await page
        .getByTestId(`location-item-${restaurantId}`)
        .getByRole("button", { name: /\d{2}:\d{2}/ })
        .first()
        .click();
      await expect(page.getByTestId("booking-drawer")).toBeVisible();
      await page.getByPlaceholder(copy.booking.form.fullNamePlaceholder).fill("Client Exemple");
      const email = `e2e-n4-${language}@example.com`;
      await page.getByPlaceholder(copy.booking.form.emailPlaceholder).fill(email);
      const created = page.waitForResponse(
        (response) =>
          response.url().endsWith("/api/bookings") && response.request().method() === "POST"
      );
      await page.getByText(copy.booking.form.confirmLabel, { exact: true }).click();
      const response = await created;
      expect(response.ok()).toBeTruthy();
      expect(response.request().postDataJSON().locale).toBe(language);
      await page.waitForURL(/booking-confirmation\//);
      await expect(page.getByTestId("result-panel")).toContainText(
        copy.booking.result.statusConfirmed
      );
      await expect(page.locator("html")).toHaveAttribute("lang", language);
      await expect(page.getByTestId("result-panel")).toContainText(email);
      await page.reload();
      await expect(page.getByTestId("result-panel")).toContainText(
        copy.booking.result.statusConfirmed
      );
    });

    if (language !== "en") {
      test("restaurateur enters and saves dish translations in the assistant", async ({
        page,
      }, testInfo) => {
        const created = await body(
          await platform.request.post("/api/platform/restaurants", {
            data: {
              name: `E2E saisie ${language}`,
              ownerEmail: `e2e-n4-${language}-${Date.now()}@example.com`,
              locale: language,
            },
          })
        );
        const id = created.restaurant.id as number;
        try {
          const invitationToken = new URL(created.invitationUrl).pathname.split("/").pop()!;
          const preview = await body(
            await page.request.get(`/api/onboarding/invitations/${invitationToken}`)
          );
          await body(
            await page.request.post(`/api/onboarding/invitations/${invitationToken}/accept`, {
              data: { password: "example-test-password", acceptedDocuments: preview.documents },
            })
          );
          await page.goto(`/onboarding/restaurant/${id}?step=menu`);
          await expect(
            page.getByText(copy.admin.onboarding.menu.title, { exact: true })
          ).toBeVisible();
          await page.getByTestId("menu-add-category").click();
          await page.getByTestId("category-0-name").fill("Plats");
          await page.getByTestId("category-0-dish-0-name").fill("Soupe");
          await page.getByTestId("category-0-dish-0-description").fill("Légumes");
          await page.getByTestId("category-0-dish-0-translation-nl-name").fill("Soep");
          await page.getByTestId("category-0-dish-0-translation-en-name").fill("Soup");
          await page.screenshot({
            path: testInfo.outputPath(`saisie-${language}.png`),
            fullPage: true,
          });
          await testInfo.attach(`Saisie ${language}`, {
            path: testInfo.outputPath(`saisie-${language}.png`),
            contentType: "image/png",
          });
          const saving = page.waitForResponse(
            (response) =>
              response.url().endsWith(`/restaurants/${id}/menu`) &&
              response.request().method() === "PUT"
          );
          await page.getByTestId("step-menu-continue").click();
          const state = await body(await saving);
          expect(state.menu.categories[0].items[0]).toMatchObject({
            name: "Soupe",
            primaryLanguage: "fr",
            translations: { nl: { name: "Soep" }, en: { name: "Soup" } },
          });
        } finally {
          await platform.request.patch(`/api/admin/restaurants/${id}`, {
            data: { isArchived: true },
          });
          await platform.request.delete(`/api/admin/restaurants/${id}`);
        }
      });

      test("restaurateur sign-in follows the browser and offers a persistent switch", async ({
        page,
      }) => {
        await page.goto("/onboarding/login");
        await expect(
          page.getByText(copy.admin.onboarding.login.subtitle, { exact: true })
        ).toBeVisible();
        await page.getByRole("combobox", { name: copy.common.language.switcherLabel }).click();
        await page.getByRole("option", { name: "English", exact: true }).click();
        await expect(
          page.getByText(en.admin.onboarding.login.subtitle, { exact: true })
        ).toBeVisible();
        await page.reload();
        await expect(
          page.getByText(en.admin.onboarding.login.subtitle, { exact: true })
        ).toBeVisible();
      });
    }
  });
}
