import { test, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { futureDateStr } from "./helpers";

const mailbox = process.env.TEST_MAILBOX_URL ?? "http://localhost:1085";

for (const [language, dish] of [
  ["fr", "Soupe du jardin"],
  ["nl", "Soep van de tuin"],
  ["en", "Garden soup"],
]) {
  test(`cinq minutes sur téléphone : inscription, carte ${language}, QR et première réservation reçue`, async ({
    browser,
    request,
  }, testInfo) => {
    const context = await browser.newContext({
      baseURL: process.env.LAUNCH_BASE_URL ?? "http://localhost:5062",
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      locale: `${language}-BE`,
    });
    const page = await context.newPage();
    const name = `Le Jardin Exemple · ${language.toUpperCase()}`;
    const email = `x3-${language}-${Date.now()}@example.test`;
    const captures = process.env.X3_CAPTURE_DIR ?? testInfo.outputPath("captures");
    await mkdir(captures, { recursive: true });
    const capture = async (step: string) => {
      if (step === "reservation-recue")
        await page.getByTestId("reservation-inbox").scrollIntoViewIfNeeded();
      if (step === "carte-a-valider")
        await page.getByTestId("import-proposals").scrollIntoViewIfNeeded();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true
      );
      const file = path.join(captures, `${language}-${step}.png`);
      await page.screenshot({ path: file, fullPage: true });
      await testInfo.attach(`${language}-${step}`, { path: file, contentType: "image/png" });
    };
    const started = Date.now();
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "Gratuit pour les restaurateurs"
    );
    await capture("accueil");
    await page.getByRole("link", { name: "Inscrire mon restaurant", exact: true }).click();
    await page.getByLabel("Nom du restaurant").fill(name);
    await page.getByLabel("Adresse e-mail professionnelle").fill(email);
    await page.getByRole("button", { name: "Recevoir mon lien d’inscription" }).click();
    await expect(page).toHaveURL(/inscription\/envoyee/);
    await expect
      .poll(async () =>
        (await request.get(`${mailbox}/mail?email=${encodeURIComponent(email)}`)).status()
      )
      .toBe(200);
    const invitation = (await (
      await request.get(`${mailbox}/mail?email=${encodeURIComponent(email)}`)
    ).json()) as { path: string };
    const url = new URL(invitation.path, "http://localhost");
    url.searchParams.set("lang", language);
    await page.goto(url.pathname + url.search);
    const passwords = page.locator('input[type="password"]');
    await passwords.nth(0).fill("Example-test-passphrase-2026");
    await passwords.nth(1).fill("Example-test-passphrase-2026");
    for (const key of ["terms", "privacy", "dpa"])
      await page.getByTestId(`invitation-consent-${key}`).click();
    await page.getByTestId("invitation-submit").click();
    await expect(page.getByTestId("step-info")).toBeVisible();
    const me = (await (await page.request.get("/api/onboarding/me")).json()) as {
      restaurants: { id: number }[];
    };
    const id = me.restaurants[0].id;
    for (const [field, value] of [
      ["address", "1 rue Exemple, 1000 Ville Exemple"],
      ["phone", "+32 2 000 00 00"],
      ["email", email],
      ["legalName", "Restaurant Exemple SRL"],
      ["companyNumber", "0123.456.749"],
    ]) {
      await page.getByTestId(`info-${field}`).getByRole("textbox").fill(value);
    }
    await page.getByTestId("step-info-continue").click();
    await page.getByTestId("step-hours-continue").click();
    await page.getByTestId("capacity-tables").fill("5");
    await page.getByTestId("capacity-seats").fill("4");
    await page.getByTestId("capacity-apply").click();
    await page.getByTestId("step-layout-continue").click();
    await page.getByTestId(`import-language-${language}`).click();
    await page.getByTestId("import-text").fill(`${dish} 8,50\nPlat exemple 18`);
    await page.getByTestId("import-propose").click();
    await expect(page.getByTestId("import-proposals")).toContainText(dish);
    const before = await (await page.request.get(`/api/onboarding/restaurants/${id}`)).json();
    expect(before.menu.categories).toHaveLength(0);
    await page.getByTestId("import-accept").click();
    await page.getByTestId("category-0-dish-0-price").fill("9,50");
    // A real local OCR pass, using a synthetic photo with no private information.
    const photo = await context.newPage();
    await photo.setContent('<canvas width="1200" height="300"></canvas>');
    await photo.locator("canvas").evaluate((canvas: HTMLCanvasElement) => {
      const drawing = canvas.getContext("2d")!;
      drawing.fillStyle = "white";
      drawing.fillRect(0, 0, 1200, 300);
      drawing.fillStyle = "black";
      drawing.font = "50px sans-serif";
      drawing.fillText("Dessert 6.50", 70, 150);
    });
    const png = await photo.locator("canvas").screenshot();
    await photo.close();
    const choose = page.waitForEvent("filechooser");
    await page.getByTestId("import-photo").click();
    await (
      await choose
    ).setFiles({ name: "carte-exemple.png", mimeType: "image/png", buffer: png });
    await expect(page.getByTestId("import-proposals")).toContainText("Dessert");
    await capture("carte-a-valider");
    await page.getByTestId("import-accept").click();
    await page.getByTestId("step-menu-continue").click();
    await page.getByTestId("step-branding-skip").click();
    const download = page.waitForEvent("download");
    await page.getByTestId("qr-download-svg").click();
    const qr = await download;
    expect(qr.suggestedFilename()).toMatch(/\.svg$/);
    await page.getByTestId("publish-button").click();
    await page.getByRole("alertdialog").getByRole("button").last().click();
    await expect(page.getByTestId("publish-live")).toBeVisible();
    await expect(page.getByTestId("reservation-inbox")).toBeVisible();
    const state = await (await page.request.get(`/api/onboarding/restaurants/${id}`)).json();
    expect(state.layout.sections[0].tables).toHaveLength(5);
    expect(state.menu.categories[0].items[0].priceMinor).toBe(950);
    expect(state.menu.categories[0].items[0].primaryLanguage).toBe(language);
    expect((await request.get(state.links.menuPath)).status()).toBe(200);
    await capture("en-ligne");
    // A second, unauthenticated visitor reserves through the public form.
    const guest = await browser.newContext({
      baseURL: process.env.LAUNCH_BASE_URL ?? "http://localhost:5062",
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    const guestPage = await guest.newPage();
    await guestPage.goto(`${state.links.bookingPath}?date=${futureDateStr(14)}&seats=2`);
    await guestPage.getByLabel("Nom complet").fill("Client Exemple X3");
    await guestPage.getByLabel("Adresse e-mail", { exact: true }).fill("client-x3@example.test");
    await guestPage.getByRole("button", { name: "Confirmer la réservation", exact: true }).click();
    await expect(guestPage).toHaveURL(/booking-confirmation/);
    await expect(page.getByTestId("inbox-notification")).toBeVisible({ timeout: 25000 });
    await expect(page.getByTestId("reservation-inbox")).toContainText("Client Exemple X3");
    await capture("reservation-recue");
    const elapsed = Date.now() - started;
    expect(elapsed).toBeLessThan(300000);
    await testInfo.attach("duree", {
      body: JSON.stringify({ language, elapsedMilliseconds: elapsed, limitMilliseconds: 300000 }),
      contentType: "application/json",
    });
    expect((await request.get(`/api/onboarding/restaurants/${id}/inbox`)).status()).toBe(401);
    await guest.close();
    await context.close();
  });
}
