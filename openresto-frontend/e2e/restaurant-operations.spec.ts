import { test, expect } from "@playwright/test";
import { ADMIN_EMAIL, ADMIN_PASSWORD } from "./helpers";

test.describe("Le quotidien du restaurateur", () => {
  test("tableau de bord, fermeture, file d’attente, carte QR, CSV et téléphone", async ({
    browser,
  }) => {
    test.setTimeout(120_000);
    const platform = await browser.newContext({ baseURL: "http://localhost:5062" });
    const owner = await browser.newContext({ baseURL: "http://localhost:5062", locale: "fr-BE" });
    let id = 0;
    const root = () => `/api/onboarding/restaurants/${id}`;
    try {
      expect(
        (
          await platform.request.post("/api/admin/auth/login", {
            data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
          })
        ).ok()
      ).toBeTruthy();
      const invited = await platform.request.post("/api/platform/restaurants", {
        data: {
          name: "La Table des Saisons",
          ownerEmail: `cx-o2-${Date.now()}@example.test`,
          locale: "fr",
        },
      });
      expect(invited.ok()).toBeTruthy();
      const invitation = await invited.json();
      id = invitation.restaurant.id;
      const token = new URL(invitation.invitationUrl).pathname.split("/").pop();
      const preview = await (
        await owner.request.get(`/api/onboarding/invitations/${token}`)
      ).json();
      expect(
        (
          await owner.request.post(`/api/onboarding/invitations/${token}/accept`, {
            data: {
              password: "An-e2e-only-passphrase-1",
              displayName: "Camille",
              acceptedDocuments: preview.documents,
            },
          })
        ).ok()
      ).toBeTruthy();
      expect(
        (
          await owner.request.put(root() + "/info", {
            data: {
              name: "La Table des Saisons",
              address: "Rue Haute 12, 1000 Bruxelles",
              phoneNumber: "+32 2 123 45 67",
              emailAddress: "bonjour@example.test",
              legalName: "La Table SRL",
              companyNumber: "0123.456.749",
            },
          })
        ).ok()
      ).toBeTruthy();
      expect(
        (
          await owner.request.put(root() + "/hours", {
            data: {
              openHours: [1, 2, 3, 4, 5, 6, 7].map((day) => ({
                day,
                open: "00:00",
                close: "00:00",
              })),
              defaultBookingDurationMinutes: 60,
            },
          })
        ).ok()
      ).toBeTruthy();
      const layout = await owner.request.put(root() + "/layout", {
        data: {
          sections: [
            {
              name: "La salle",
              tables: [
                { name: "Fenêtre", seats: 2 },
                { name: "Jardin", seats: 4 },
              ],
            },
          ],
        },
      });
      expect(layout.ok()).toBeTruthy();
      const state = await layout.json();
      const section = state.layout.sections[0];
      expect(
        (
          await owner.request.put(root() + "/menu", {
            data: {
              name: "Notre carte",
              categories: [
                {
                  name: "Plats de saison",
                  items: [
                    {
                      name: "Carbonade à la bière brune",
                      description: "Frites maison et salade de saison",
                      priceMinor: 2400,
                    },
                    {
                      name: "Risotto aux champignons",
                      description: "Parmesan et herbes fraîches",
                      priceMinor: 2100,
                    },
                  ],
                },
              ],
            },
          })
        ).ok()
      ).toBeTruthy();
      expect((await owner.request.post(root() + "/publish")).ok()).toBeTruthy();
      const now = new Date();
      for (const [index, table] of section.tables.entries()) {
        const response = await platform.request.post("/api/admin/bookings", {
          data: {
            restaurantId: id,
            sectionId: section.id,
            tableId: table.id,
            date: new Date(now.getTime() - 10 * 60_000).toISOString(),
            customerName: ["Alice Martin", "Marc Dubois"][index],
            customerEmail: `guest-${index}@example.test`,
            seats: table.seats,
          },
        });
        expect(response.ok(), await response.text()).toBeTruthy();
      }
      const page = await owner.newPage();
      await page.addInitScript(() => {
        localStorage.setItem("openresto.locale", "fr");
        localStorage.setItem("theme", "light");
      });
      await page.goto(`/onboarding/dashboard/${id}`);
      await expect(page.getByTestId("operations-dashboard")).toBeVisible();
      await expect(
        page.getByText("Votre service, en un coup d’œil", { exact: true })
      ).toBeVisible();
      await expect(page.getByText(/Alice Martin/)).toBeVisible();
      await page.getByTestId("period-week").click();
      const download = page.waitForEvent("download");
      await page.getByTestId("operations-export").click();
      expect((await download).suggestedFilename()).toBe("reservations-semaine.csv");
      const exported = await owner.request.get(root() + "/operations/export.csv");
      expect(await exported.text()).toContain("Alice Martin");
      // A full restaurant accepts a guest into the existing public queue.
      const quote = await owner.request.get(`/api/restaurants/${id}/waitlist?seats=2`);
      expect((await quote.json()).acceptingGuests).toBe(true);
      const guest = await browser.newContext({ baseURL: "http://localhost:5062" });
      const joined = await guest.request.post(`/api/restaurants/${id}/waitlist`, {
        data: { name: "Élodie Petit", seats: 2, locale: "fr" },
      });
      expect(joined.status()).toBe(201);
      await guest.close();
      await page.getByText("Actualiser", { exact: true }).click();
      await expect(page.getByText(/Élodie Petit/)).toBeVisible();
      await page.getByRole("button", { name: "Absent", exact: true }).first().click();
      await expect(page.getByRole("button", { name: "Installer", exact: true })).toBeEnabled();
      await page.getByRole("button", { name: "Installer", exact: true }).click();
      await expect(page.getByText("Personne en attente. Vous êtes à jour.")).toBeVisible();
      // Closing a future service prevents new bookings and keeps those already recorded.
      const future = new Date(now.getTime() + 2 * 86400_000).toISOString().slice(0, 10);
      await page.getByTestId("exception-date").fill(future);
      await page.getByTestId("exception-add").click();
      await expect(page.getByText("C’est enregistré.")).toBeVisible();
      const slots = await (
        await owner.request.get(`/api/restaurants/${id}/availability?date=${future}&seats=2`)
      ).json();
      expect(slots.slots).toEqual([]);
      // Only visible QR dishes accrue anonymous counters.
      const menuToken = (await (await owner.request.get(root())).json()).links.menuToken;
      const qr = await browser.newContext({
        baseURL: "http://localhost:5062",
        viewport: { width: 390, height: 844 },
      });
      const menuPage = await qr.newPage();
      await menuPage.goto(`/menu/r/${menuToken}`);
      await expect(menuPage.getByText("Carbonade à la bière brune")).toBeVisible();
      await expect
        .poll(
          async () => (await (await owner.request.get(root() + "/operations")).json()).dishes.length
        )
        .toBeGreaterThan(0);
      await qr.close();
      await page.getByText("Actualiser", { exact: true }).click();
      await expect(page.getByText("1. Carbonade à la bière brune")).toBeVisible();
      await expect(page.getByText("Mode simulé : aucun mail envoyé")).toBeVisible();
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.screenshot({
        path: test.info().outputPath("restaurateur-bureau.png"),
        fullPage: true,
      });
      await page.setViewportSize({ width: 390, height: 844 });
      await expect(page.getByTestId("operations-dashboard")).toBeVisible();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
      ).toBe(true);
      await page.screenshot({
        path: test.info().outputPath("restaurateur-telephone.png"),
        fullPage: true,
      });
      await page.getByText("Horaires exceptionnels", { exact: true }).scrollIntoViewIfNeeded();
      await page.screenshot({ path: test.info().outputPath("restaurateur-horaires.png") });
      await test.info().attach("Bureau", {
        path: test.info().outputPath("restaurateur-bureau.png"),
        contentType: "image/png",
      });
      await test.info().attach("Téléphone", {
        path: test.info().outputPath("restaurateur-telephone.png"),
        contentType: "image/png",
      });
      await test.info().attach("Horaires", {
        path: test.info().outputPath("restaurateur-horaires.png"),
        contentType: "image/png",
      });
      // No other restaurateur can export these guests.
      const other = await browser.newContext({ baseURL: "http://localhost:5062" });
      expect((await other.request.get(root() + "/operations/export.csv")).status()).toBe(401);
      await other.close();
    } finally {
      if (id) {
        await platform.request.patch(`/api/admin/restaurants/${id}`, {
          data: { isArchived: true },
        });
        await platform.request.delete(`/api/admin/restaurants/${id}`);
      }
      await platform.close();
      await owner.close();
    }
  });
});
