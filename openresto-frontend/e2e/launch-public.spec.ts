import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { futureDateStr } from "./helpers";

const mailbox = process.env.TEST_MAILBOX_URL ?? "http://localhost:1085";
const restaurantName = `Le Lancement Exemple ${Date.now()}`;
const email = `lancement-${Date.now()}@example.test`;
const password = "example-only-long-password-42";

test("les pages publiques fonctionnent sans JavaScript, au clavier et sur mobile", async ({
  browser,
  request,
}) => {
  const context = await browser.newContext({
    baseURL: process.env.LAUNCH_BASE_URL ?? "http://localhost:5062",
    javaScriptEnabled: false,
    locale: "fr-BE",
  });
  const page = await context.newPage();
  await page.goto("/");
  await expect(page).toHaveTitle(/OpenResto.*Réservations/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Votre salle se remplit");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Aller au contenu" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#contenu$/);
  await page.getByRole("link", { name: "Inscrire mon restaurant", exact: true }).click();
  await expect(page.getByLabel("Nom du restaurant")).toBeVisible();
  await page.getByRole("button", { name: "Recevoir mon lien d’inscription" }).click();
  await expect(page).toHaveURL(/\/inscription$/);
  await expect(page.getByLabel("Nom du restaurant")).toBeFocused();
  expect(
    (
      await request.post("/inscription", { form: { Name: "CSRF", Email: "csrf@example.test" } })
    ).status()
  ).toBe(400);

  for (const url of [
    "/",
    "/inscription",
    "/legal",
    "/legal/terms",
    "/legal/privacy",
    "/legal/legal-notice",
    "/locations",
    `/locations/1?date=${futureDateStr(14)}`,
    "/lookup",
    "/booking-confirmation/exemple",
    "/legal/dpa",
  ]) {
    await page.goto(url);
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
    ).toBe(true);
    await expect(page.locator("html")).toHaveAttribute("lang", "fr");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", /.+/);
  }
  expect((await request.get("/legal/inconnu")).status()).toBe(404);
  await page.goto(`/locations/1?date=${futureDateStr(14)}`);
  await expect(page.locator("#guest-booking")).toHaveAttribute("method", "post");
  await expect(
    page.getByRole("button", { name: "Confirmer la réservation", exact: true })
  ).toBeDisabled();
  await page.goto("/lookup");
  await expect(page.locator("#guest-lookup")).toHaveAttribute("method", "post");
  await expect(
    page.getByRole("button", { name: "Rechercher ma réservation", exact: true })
  ).toBeDisabled();
  await context.close();
});

test("l’accueil et les modèles juridiques respectent les règles WCAG AA", async ({
  page,
}, testInfo) => {
  for (const url of [
    "/",
    "/inscription",
    "/legal",
    "/legal/terms",
    "/legal/privacy",
    "/legal/dpa",
    "/legal/legal-notice",
    "/locations",
    `/locations/1?date=${futureDateStr(14)}`,
    "/lookup",
    "/booking-confirmation/exemple",
  ]) {
    await page.goto(url);
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
  }
  const destination = process.env.LAUNCH_CAPTURE_DIR ?? testInfo.outputPath("captures");
  await mkdir(destination, { recursive: true });
  await page.goto("/");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: path.join(destination, "accueil-desktop.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: path.join(destination, "accueil-mobile.png"), fullPage: true });
  await page.goto("/inscription");
  await page.screenshot({ path: path.join(destination, "inscription-mobile.png"), fullPage: true });
  await page.goto(`/locations/1?date=${futureDateStr(14)}`);
  await page.screenshot({ path: path.join(destination, "reservation-mobile.png"), fullPage: true });
});

test("un restaurateur s’inscrit depuis l’accueil, prépare sa carte et publie son restaurant", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Inscrire mon restaurant", exact: true }).click();
  await page.getByLabel("Nom du restaurant").fill(restaurantName);
  await page.getByLabel("Adresse e-mail professionnelle").fill(email);
  await page.getByRole("button", { name: "Recevoir mon lien d’inscription" }).click();
  await expect(page).toHaveURL(/\/inscription\/envoyee$/);
  expect(await page.content()).not.toContain(email);
  await expect
    .poll(async () =>
      (await request.get(`${mailbox}/mail?email=${encodeURIComponent(email)}`)).status()
    )
    .toBe(200);
  const invitation = (await (
    await request.get(`${mailbox}/mail?email=${encodeURIComponent(email)}`)
  ).json()) as { path: string };
  expect(invitation.path).toMatch(/^\/onboarding\/invitation\/[A-Za-z0-9_-]{43}\?lang=fr$/);
  await page.goto(invitation.path);
  await page.getByLabel("Mot de passe", { exact: true }).fill(password);
  await page.getByLabel("Confirmer le mot de passe").fill(password);
  await expect(page.getByTestId("invitation-submit")).toBeDisabled();
  for (const key of ["terms", "privacy", "dpa"])
    await page.getByTestId(`invitation-consent-${key}`).click();
  await page.getByTestId("invitation-submit").click();
  await expect(page.getByTestId("step-info")).toBeVisible();

  const me = (await (await page.request.get("/api/onboarding/me")).json()) as {
    restaurants: { id: number }[];
  };
  const id = me.restaurants[0].id;
  expect((await page.request.post(`/api/onboarding/restaurants/${id}/publish`)).status()).toBe(400);
  expect(await (await request.get("/api/restaurants")).text()).not.toContain(restaurantName);
  await page.getByLabel("Adresse", { exact: true }).fill("1 rue Exemple, 1000 Ville Exemple");
  await page.getByLabel("Téléphone", { exact: true }).fill("+32 2 000 00 00");
  await page.getByLabel("E-mail de contact").fill("contact@example.test");
  await page.getByLabel("Raison sociale").fill("Restaurant Exemple SRL");
  await page.getByLabel("Numéro d'entreprise (BCE)").fill("0123.456.749");
  await page.getByTestId("step-info-continue").click();
  await expect(page.getByTestId("step-hours")).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("step-hours")).toBeVisible();
  await page.getByTestId("step-hours-continue").click();
  await page.getByTestId("step-layout-continue").click();
  await expect(page.getByTestId("step-menu")).toBeVisible();
  await page.getByTestId("menu-name").fill("La carte du lancement");
  await page.getByTestId("menu-add-category").click();
  await page.getByTestId("category-0-name").fill("Plats");
  await page.getByTestId("category-0-add-dish").click();
  await page.getByTestId("category-0-dish-0-name").fill("Assiette du marché");
  await page.getByTestId("category-0-dish-0-price").fill("18,50");
  await page.getByTestId("step-menu-continue").click();
  await page.getByTestId("step-branding-skip").click();
  await expect(page.getByTestId("stage-preview")).toBeVisible();
  await page.getByTestId("publish-button").click();
  await page.getByRole("button", { name: "Oui, publier", exact: true }).click();
  await expect(page.getByTestId("publish-live")).toBeVisible();
  const state = (await (await page.request.get(`/api/onboarding/restaurants/${id}`)).json()) as {
    links: { sitePath: string; menuPath: string };
  };
  const site = await request.get(state.links.sitePath);
  expect(site.status()).toBe(200);
  const html = await site.text();
  expect(html).toContain("Assiette du marché");
  expect(html).toContain('"@type":"Restaurant"');
  expect(html).toContain(restaurantName);
  expect(await (await request.get("/sitemap.xml")).text()).toContain(state.links.sitePath);
  expect(await (await request.get("/api/restaurants")).text()).toContain(restaurantName);
  await page.goto(state.links.sitePath);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(restaurantName);
  expect(
    (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze())
      .violations
  ).toEqual([]);
  await page.getByRole("link", { name: "Réserver une table" }).first().click();
  await expect(page).toHaveURL(new RegExp(`/locations/${id}`));
  await expect(page.getByTestId("public-availability")).toBeVisible();
  await page.getByLabel("Date", { exact: true }).fill(futureDateStr(14));
  await page.getByRole("button", { name: "Voir les disponibilités", exact: true }).click();
  await page.getByLabel("Nom complet").fill("Client Exemple");
  await page.getByLabel("Adresse e-mail", { exact: true }).fill("client@example.test");
  await expect(
    page.getByRole("button", { name: "Confirmer la réservation", exact: true })
  ).toBeEnabled();
  await page.getByRole("button", { name: "Confirmer la réservation", exact: true }).click();
  await expect(page).toHaveURL(/booking-confirmation\//);
  await expect(page.getByText(/réservation confirmée/i)).toBeVisible();
  await expect(page.getByTestId("result-panel")).toContainText(restaurantName);
  const bookingReference = decodeURIComponent(page.url().split("/booking-confirmation/")[1]);
  await page.goto("/lookup");
  await page.getByLabel("Référence de réservation").fill(bookingReference);
  await page.getByLabel("Adresse e-mail", { exact: true }).fill("incorrect@example.test");
  await page.getByRole("button", { name: "Rechercher ma réservation", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Aucune réservation");
  await expect(page.getByTestId("result-panel")).toBeHidden();
  await page.getByLabel("Adresse e-mail", { exact: true }).fill("client@example.test");
  await page.getByRole("button", { name: "Rechercher ma réservation", exact: true }).click();
  await expect(page.getByTestId("result-panel")).toContainText(restaurantName);
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Annuler ma réservation", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Réservation annulée", exact: true })
  ).toBeVisible();
  await page.goto(state.links.menuPath);
  await expect(page.getByText("Assiette du marché", { exact: true })).toBeVisible();
  await expect(page.locator("script")).toHaveCount(0);
  expect(
    (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze())
      .violations
  ).toEqual([]);
  await mkdir("test-results", { recursive: true });
  await writeFile(
    "test-results/launch-audit-paths.json",
    JSON.stringify([`/locations/${id}?date=${futureDateStr(14)}`, state.links.menuPath])
  );
  expect((await page.request.get("/api/admin/restaurants")).status()).toBe(403);
  expect((await page.request.get("/api/platform/restaurants")).status()).toBe(403);
});
