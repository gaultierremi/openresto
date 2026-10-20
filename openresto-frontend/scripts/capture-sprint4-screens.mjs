#!/usr/bin/env node
/**
 * Captures the first-restaurant screens from a running OpenResto stack seeded with the demo data
 * (`bash scripts/seed-local.sh`, plus `demo_data.py accounts`): the restaurateur's invitation and
 * five-step assistant, the platform space, the legal pages and the Dutch guest surface.
 *
 *   BASE_URL=http://localhost:5062 node scripts/capture-sprint4-screens.mjs [outDir]
 *
 * It creates one restaurant through the platform API and walks it to the publication, so the
 * assistant is captured on real saved data, then puts the restaurant offline again; the
 * demo's own invitation (`demo-invitation-brasserie-du-canal`) is only looked at, never accepted.
 * The stack is expected the way the Docker compose serves it: the app, `/api`, `/r` and `/media`
 * on one origin (`node scripts/serve-local-stack.mjs` does that without Docker). Environment:
 * ADMIN_EMAIL / ADMIN_PASSWORD (defaults are the dev seed's), CHROMIUM_PATH to use an installed
 * browser instead of Playwright's own.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:5062";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@openresto.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "dev-password-change-before-production";
const OUT_DIR = path.resolve(
  process.argv[2] ??
    path.join(path.dirname(fileURLToPath(import.meta.url)), "../../docs/captures/sprint-4")
);
const DEMO_INVITATION = "/onboarding/invitation/demo-invitation-brasserie-du-canal";
const DEMO_SITE = "/r/brasserie-de-la-senne-doree";

const DESKTOP = { width: 1280, height: 900 };
const MOBILE = { width: 390, height: 844 };
const TABLET = { width: 820, height: 1180 };
// The app scrolls inside its own container, so a full-page shot is only as tall as the window:
// the assistant's long forms and the platform list are taken in a tall one.
const TALL = { width: 1280, height: 1500 };

const stamp = Date.now();
const NAME = `Chez Marguerite ${String(stamp).slice(-4)}`;
const OWNER_EMAIL = `marguerite-${stamp}@example.com`;
const PASSWORD = "Une-phrase-assez-longue-1";

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ["--no-sandbox"],
});

/** A browser context in one language, with the app's own language pick saved the way the switcher does. */
async function session(viewport, { locale, pick = locale }) {
  const context = await browser.newContext({
    viewport,
    baseURL: BASE_URL,
    deviceScaleFactor: viewport.width < 600 ? 2 : 1,
    locale: { fr: "fr-BE", nl: "nl-BE", en: "en-GB" }[locale],
  });
  if (pick) {
    await context.addInitScript((value) => localStorage.setItem("openresto.locale", value), pick);
  }
  return { context, page: await context.newPage() };
}

async function shot(page, name, options = {}) {
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUT_DIR, name), ...options });
  console.log("captured", name);
}

const field = (page, testId) => page.getByTestId(testId).locator("input, textarea").first();

await mkdir(OUT_DIR, { recursive: true });

// ── The platform creates the restaurant ──────────────────────────────────────
const platform = await session(DESKTOP, { locale: "fr" });
const login = await platform.page.request.post("/api/admin/auth/login", {
  data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
});
if (!login.ok()) throw new Error(`Platform login failed (HTTP ${login.status()})`);

const created = await platform.page.request.post("/api/platform/restaurants", {
  data: { name: NAME, ownerEmail: OWNER_EMAIL, locale: "fr" },
});
if (!created.ok()) throw new Error(`Could not create the restaurant (HTTP ${created.status()})`);
const { restaurant, invitationUrl } = await created.json();
const invitationPath = new URL(invitationUrl).pathname;

try {
  // ── The invitation, the demo's own, untouched ──────────────────────────────
  for (const [suffix, viewport] of [
    ["pc", DESKTOP],
    ["telephone", MOBILE],
  ]) {
    const { context, page } = await session(viewport, { locale: "fr" });
    await page.goto(DEMO_INVITATION);
    await page.getByTestId("invitation-restaurant").waitFor();
    await shot(page, `onboarding-invitation-${suffix}.png`, { fullPage: true });
    await context.close();
  }

  // ── The assistant, on the new restaurant ───────────────────────────────────
  const owner = await session(TALL, { locale: "fr" });
  const page = owner.page;
  await page.goto(invitationPath);
  await page.getByTestId("invitation-password").fill(PASSWORD);
  await page.getByTestId("invitation-confirm").fill(PASSWORD);
  for (const key of ["terms", "privacy", "dpa"]) {
    await page.getByTestId(`invitation-consent-${key}`).click();
  }
  await shot(page, "onboarding-invitation-remplie-pc.png", { fullPage: true });
  await page.getByTestId("invitation-submit").click();

  await page.getByTestId("step-info").waitFor();
  await field(page, "info-address").fill("Rue Haute 120, 1000 Bruxelles");
  await field(page, "info-phone").fill("+32 2 512 34 56");
  await field(page, "info-email").fill("bonjour@chez-marguerite.example");
  await field(page, "info-legalName").fill("Chez Marguerite SRL");
  await field(page, "info-companyNumber").fill("0123.456.749");
  await shot(page, "onboarding-1-infos-pc.png", { fullPage: true });
  await page.getByTestId("step-info-continue").click();

  await page.getByTestId("step-hours").waitFor();
  await shot(page, "onboarding-2-horaires-pc.png", { fullPage: true });
  await page.getByTestId("step-hours-continue").click();

  await page.getByTestId("step-layout").waitFor();
  await page.getByTestId("layout-add-room").click();
  await shot(page, "onboarding-3-salles-pc.png", { fullPage: true });
  await page.getByTestId("step-layout-continue").click();

  await page.getByTestId("step-menu").waitFor();
  await page.getByTestId("menu-name").fill("La carte");
  await page.getByTestId("menu-add-category").click();
  await page.getByTestId("category-0-name").fill("Plats");
  await page.getByTestId("category-0-add-dish").click();
  await page.getByTestId("category-0-dish-0-name").fill("Carbonade flamande");
  await page.getByTestId("category-0-dish-0-price").fill("21,50");
  await shot(page, "onboarding-4-carte-pc.png", { fullPage: true });
  await page.getByTestId("step-menu-continue").click();

  await page.getByTestId("step-branding").waitFor();
  await page.getByTestId("branding-swatch-#9f1239").click();
  await shot(page, "onboarding-5-identite-pc.png", { fullPage: true });
  await page.getByTestId("step-branding-continue").click();

  await page.getByTestId("stage-preview").waitFor();
  await page.getByTestId("preview-panel-site").waitFor();
  await page.waitForTimeout(1500);
  await shot(page, "onboarding-6-apercu-pc.png", { fullPage: true });

  await page.getByTestId("publish-button").click();
  await shot(page, "onboarding-7-publier-confirmation-pc.png");
  await page.getByRole("button", { name: /Oui, publier/ }).click();
  await page.getByTestId("publish-live").waitFor();
  await shot(page, "onboarding-8-en-ligne-pc.png", { fullPage: true });

  // The same assistant on a phone, resumed from the saved state.
  const phone = await owner.context.newPage();
  await phone.setViewportSize(MOBILE);
  await phone.goto("/onboarding");
  await phone.getByTestId("stage-preview").waitFor();
  await shot(phone, "onboarding-en-ligne-telephone.png", { fullPage: true });
  await owner.context.close();

  // ── The platform space ─────────────────────────────────────────────────────
  const space = platform.page;
  await space.goto("/admin/platform");
  await space.getByTestId("platform-list").waitFor();
  await space.setViewportSize(TALL);
  await shot(space, "plateforme-liste-pc.png", { fullPage: true });
  await space.setViewportSize(DESKTOP);

  await space.getByRole("button", { name: "Ajouter un établissement" }).click();
  await shot(space, "plateforme-ajout-pc.png");
  await space.getByRole("dialog").getByRole("button", { name: "Annuler" }).click();

  const row = space.locator('[data-testid^="platform-row-"]').filter({ hasText: NAME });
  await row.getByRole("button", { name: "Suspendre" }).click();
  await shot(space, "plateforme-suspension-pc.png");
  // The backdrop is also labelled "Annuler"; the window's own button is the last one.
  await space.getByRole("dialog").getByRole("button", { name: "Annuler" }).last().click();

  await row.getByRole("button", { name: /Données clients/ }).click();
  await shot(space, "plateforme-donnees-clients-avant-pc.png");
  await space.getByLabel("Motif de l’accès").fill("Ticket 4821 : confirmation jamais reçue");
  await space.getByRole("button", { name: /Ouvrir les données/ }).click();
  await space.getByTestId("guest-data-banner").waitFor();
  await shot(space, "plateforme-donnees-clients-apres-pc.png");
  await space.getByRole("button", { name: /Fermer et effacer/ }).click();

  await row.getByRole("button", { name: "Consentements" }).click();
  await space.getByTestId("consent-row").first().waitFor();
  await shot(space, "plateforme-consentements-pc.png");
  await space
    .getByRole("dialog")
    .getByRole("button", { name: "Fermer", exact: true })
    .last()
    .click();

  // The admin shell refuses a phone-width screen on purpose, so the narrow capture is a tablet.
  const tablet = await session(TABLET, { locale: "fr" });
  await tablet.page.request.post("/api/admin/auth/login", {
    data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });
  await tablet.page.goto("/admin/platform");
  await tablet.page.getByTestId("platform-list").waitFor();
  await shot(tablet.page, "plateforme-liste-tablette.png", { fullPage: true });
  await tablet.context.close();

  // ── The legal pages ────────────────────────────────────────────────────────
  for (const [file, route] of [
    ["index", "/legal"],
    ["conditions", "/legal/terms"],
    ["confidentialite", "/legal/privacy"],
    ["sous-traitance", "/legal/dpa"],
    ["mentions-legales", "/legal/legal-notice"],
  ]) {
    const { context, page: legal } = await session(DESKTOP, { locale: "fr" });
    await legal.goto(route);
    await legal.getByTestId("legal-review-banner").waitFor();
    await shot(legal, `legal-${file}-pc.png`, { fullPage: file !== "index" });
    await context.close();
  }
  const legalPhone = await session(MOBILE, { locale: "fr" });
  await legalPhone.page.goto("/legal/terms");
  await legalPhone.page.getByTestId("legal-review-banner").waitFor();
  await shot(legalPhone.page, "legal-conditions-telephone.png");
  await legalPhone.context.close();

  // ── The Dutch guest surface: chosen from the browser, no switch pressed ────
  for (const [suffix, viewport] of [
    ["pc", DESKTOP],
    ["telephone", MOBILE],
  ]) {
    const nl = await session(viewport, { locale: "nl", pick: null });
    await nl.page.goto("/");
    await nl.page.getByText("Onze vestigingen").waitFor();
    await shot(nl.page, `nl-accueil-${suffix}.png`, { fullPage: true });
    await nl.context.close();

    const site = await session(viewport, { locale: "nl", pick: null });
    await site.page.goto(DEMO_SITE);
    await site.page.getByRole("heading", { level: 1 }).waitFor();
    await site.page.waitForTimeout(1200);
    // A phone page runs to eleven thousand pixels: the first screen is what is worth reading.
    await shot(site.page, `nl-site-${suffix}.png`, { fullPage: suffix === "pc" });
    await site.context.close();
  }

  const lookup = await session(DESKTOP, { locale: "nl", pick: null });
  await lookup.page.goto("/lookup");
  await shot(lookup.page, "nl-mes-reservations-pc.png");
  await lookup.context.close();
} finally {
  // Put the demo back as it was: the restaurant created for the capture goes offline again.
  const state = await platform.page.request.get(`/api/platform/restaurants`);
  if (state.ok()) {
    await platform.page.request.post(`/api/platform/restaurants/${restaurant.id}/suspend`, {
      data: { reason: "Restaurant de capture" },
    });
  }
  await browser.close();
}
