#!/usr/bin/env node
/**
 * Captures a restaurant's first week from both sides, in French, on a PC and on a phone: the
 * restaurateur from invitation to publication (with the allergens of the menu and the QR code),
 * a guest from the scan of that code to the confirmation, the team seating the booking, and the
 * restaurateur closing a weekday. It is the same journey `e2e/journey-two-sides.spec.ts`
 * asserts, with a camera on it.
 *
 *   BASE_URL=http://localhost:5062 node scripts/capture-journeys.mjs [outDir]
 *
 * The stack is expected the way the Docker compose serves it (the app, `/api`, `/r` and `/media`
 * on one origin; `node scripts/serve-local-stack.mjs` does that without Docker) and in the
 * `Testing` environment with `WEBSITE_URL` set. The restaurant it creates is archived and
 * deleted at the end. Environment: ADMIN_EMAIL / ADMIN_PASSWORD (the dev seed's), CHROMIUM_PATH
 * to use an installed browser instead of Playwright's own.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:5062";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@openresto.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "change-me-before-use";
const OUT_DIR = path.resolve(
  process.argv[2] ??
    path.join(path.dirname(fileURLToPath(import.meta.url)), "../../docs/captures/journeys")
);

const DESKTOP = { width: 1280, height: 900 };
const TALL = { width: 1280, height: 1500 };
const PHONE = { width: 390, height: 844 };

const stamp = Date.now();
const NAME = `Chez Marguerite ${String(stamp).slice(-4)}`;
const OWNER_EMAIL = `marguerite-${stamp}@example.com`;
const PASSWORD = "Une-phrase-assez-longue-1";
const GUEST_EMAIL = `jeanne-${stamp}@example.com`;
const WEEKDAYS_FR = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];

const dateAhead = (days) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split("T")[0];
};
// Tomorrow, so the team's timetable (one "next day" away) shows the sitting.
const BOOKING_DATE = dateAhead(1);
const CLOSED_DATE = dateAhead(2);

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ["--no-sandbox"],
});

async function session(viewport, extra = {}) {
  const context = await browser.newContext({
    viewport,
    baseURL: BASE_URL,
    locale: "fr-BE",
    timezoneId: "Europe/Brussels",
    deviceScaleFactor: viewport.width < 600 ? 2 : 1,
    isMobile: viewport.width < 600,
    hasTouch: viewport.width < 600,
    ...extra,
  });
  // The back office follows the instance's language, not the browser's: the saved pick wins.
  await context.addInitScript(() => {
    try {
      localStorage.setItem("openresto.locale", "fr");
    } catch {
      // A sandboxed frame has no storage, and needs none.
    }
  });
  return context;
}

async function shot(page, name, options = {}) {
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(OUT_DIR, `${name}.png`), ...options });
  console.log("captured", name);
}

await mkdir(OUT_DIR, { recursive: true });

// ── The platform adds the restaurant ─────────────────────────────────────────
const platform = await session(DESKTOP);
const login = await platform.request.post("/api/admin/auth/login", {
  data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
});
if (!login.ok()) throw new Error(`Platform login failed (HTTP ${login.status()})`);
const created = await platform.request.post("/api/platform/restaurants", {
  data: { name: NAME, ownerEmail: OWNER_EMAIL, locale: "fr" },
});
if (!created.ok()) throw new Error(`Could not create the restaurant (HTTP ${created.status()})`);
const { restaurant, invitationUrl } = await created.json();
const invitationPath = new URL(invitationUrl).pathname;

try {
  // ── Restaurateur, on a PC ──────────────────────────────────────────────────
  const owner = await session(TALL);
  const page = await owner.newPage();
  await page.goto(invitationPath);
  await page.getByLabel("Mot de passe", { exact: true }).fill(PASSWORD);
  await page.getByLabel("Confirmer le mot de passe").fill(PASSWORD);
  for (const key of ["terms", "privacy", "dpa"]) {
    await page.getByTestId(`invitation-consent-${key}`).click();
  }
  await shot(page, "restaurateur-1-invitation-pc");
  await page.getByTestId("invitation-submit").click();

  await page.getByTestId("step-info").waitFor();
  await page.getByLabel("Adresse", { exact: true }).fill("Rue Haute 12, 1000 Bruxelles");
  await page.getByLabel("Téléphone").fill("+32 2 123 45 67");
  await page.getByLabel("E-mail de contact").fill(OWNER_EMAIL);
  await page.getByLabel("Raison sociale").fill("Marguerite SRL");
  await page.getByLabel("Numéro d'entreprise (BCE)").fill("0123.456.749");
  await shot(page, "restaurateur-2-informations-pc");
  await page.getByTestId("step-info-continue").click();

  await page.getByTestId("step-hours").waitFor();
  await shot(page, "restaurateur-3-horaires-pc");
  await page.getByTestId("step-hours-continue").click();

  await page.getByTestId("step-layout").waitFor();
  await page.getByTestId("room-0-table-0-name").fill("T1");
  await page.getByRole("button", { name: "Un couvert de plus" }).click();
  await page.getByRole("button", { name: "Un couvert de plus" }).click();
  await shot(page, "restaurateur-4-salles-pc");
  await page.getByTestId("step-layout-continue").click();

  await page.getByTestId("step-menu").waitFor();
  await page.getByTestId("menu-add-category").click();
  await page.getByTestId("category-0-name").fill("Entrées");
  const croquettes = "category-0-dish-0";
  await page.getByTestId(`${croquettes}-name`).fill("Croquettes aux crevettes");
  await page.getByTestId(`${croquettes}-price`).fill("14,50");
  await page.getByTestId(`${croquettes}-description`).fill("Deux croquettes, citron, persil frit");
  await page.getByTestId(`${croquettes}-declarations`).click();
  await page.getByTestId(`${croquettes}-allergen-Crustaceans`).click();
  await page.getByTestId(`${croquettes}-allergen-Gluten`).click();
  await page.getByTestId("category-0-add-dish").click();
  await page.getByTestId("category-0-dish-1-name").fill("Salade de saison");
  await page.getByTestId("category-0-dish-1-price").fill("12");
  await page.getByTestId("category-0-dish-1-declarations").click();
  await page.getByTestId("category-0-dish-1-diet-Vegan").click();
  await page.getByTestId("category-0-add-dish").click();
  await page.getByTestId("category-0-dish-2-name").fill("Soupe du jour");
  await shot(page, "restaurateur-5-carte-allergenes-pc");
  await page.getByTestId("step-menu-continue").click();

  await page.getByTestId("step-branding").waitFor();
  await page.getByTestId("step-branding-skip").click();
  await page.getByTestId("stage-preview").waitFor();
  await shot(page, "restaurateur-6-apercu-qr-pc");
  const menuAddress = (await page.getByTestId("qr-url").textContent()).trim();

  await page.getByTestId("publish-button").click();
  await shot(page, "restaurateur-7-publier-pc");
  await page.getByRole("button", { name: "Oui, publier" }).click();
  await page.getByTestId("publish-live").waitFor();
  await shot(page, "restaurateur-8-en-ligne-pc");
  await owner.close();

  // ── Restaurateur, on a phone: the invitation's mirror, the menu step, the preview ─
  const ownerPhone = await session(PHONE);
  const phone = await ownerPhone.newPage();
  await phone.goto("/onboarding/login");
  await phone.getByTestId("onboarding-login-email").fill(OWNER_EMAIL);
  await phone.getByTestId("onboarding-login-password").fill(PASSWORD);
  await phone.getByTestId("onboarding-login-submit").click();
  await phone.getByTestId("stage-preview").waitFor();
  await shot(phone, "restaurateur-8-en-ligne-telephone", { fullPage: true });
  await phone.getByTestId("stepper-menu").click();
  await phone.getByTestId("step-menu").waitFor();
  await phone.getByTestId("category-0-dish-0-declarations").click();
  await shot(phone, "restaurateur-5-carte-allergenes-telephone", { fullPage: true });
  await ownerPhone.close();

  // ── A guest scans the code, on a phone ─────────────────────────────────────
  const guest = await session(PHONE);
  const menu = await guest.newPage();
  await menu.goto(menuAddress);
  await menu.getByTestId("menu-restaurant-name").waitFor();
  await shot(menu, "client-1-carte-qr-telephone", { fullPage: true });

  await menu.getByTestId("menu-allergens-toggle").click();
  await menu.getByTestId("menu-allergen-Crustaceans").click();
  await shot(menu, "client-2-filtre-allergene-telephone", { fullPage: true });
  await menu.getByTestId("menu-filters-clear").click();
  await menu.getByTestId("menu-diet-Vegan").click();
  await shot(menu, "client-3-filtre-vegan-telephone", { fullPage: true });

  await menu.getByTestId("menu-book").click();
  await menu.waitForURL(new RegExp(`/locations/${restaurant.id}$`));
  await menu.getByTestId("locations-filter-bar").waitFor();
  await menu.getByTestId("date-picker-trigger").click();
  const dayCell = menu.getByTestId(`date-picker-day-${BOOKING_DATE}`);
  for (let attempt = 0; attempt < 6 && !(await dayCell.isVisible()); attempt++) {
    await menu.getByTestId("date-picker-next-month").click();
  }
  await dayCell.click();
  await shot(menu, "client-4-page-de-reservation-telephone");
  await menu
    .getByLabel(new RegExp(`^Réserver ${NAME} à \\d{2}:\\d{2}$`))
    .first()
    .click();
  await menu.getByTestId("booking-drawer").waitFor();
  await menu.getByLabel("Nom complet").fill("Jeanne Dupont");
  await menu.getByLabel("Adresse e-mail").fill(GUEST_EMAIL);
  await menu
    .getByLabel("Demandes particulières ou allergies")
    .fill("Allergie aux crustacés, merci.");
  await shot(menu, "client-5-feuille-de-reservation-telephone");
  const confirm = menu.getByRole("button", { name: "Confirmer la réservation" });
  await confirm.waitFor();
  await menu.waitForFunction(() => {
    const button = [...document.querySelectorAll("[role=button]")].find((b) =>
      /Confirmer la réservation/.test(b.textContent ?? "")
    );
    return button && button.getAttribute("aria-disabled") !== "true";
  });
  await confirm.click();
  await menu.waitForURL(/booking-confirmation\//);
  await menu.getByTestId("result-panel").waitFor();
  await shot(menu, "client-6-confirmation-telephone");
  await guest.close();

  // ── The same menu and confirmation on a PC ─────────────────────────────────
  const guestPc = await session(DESKTOP);
  const menuPc = await guestPc.newPage();
  await menuPc.goto(menuAddress);
  await menuPc.getByTestId("menu-restaurant-name").waitFor();
  await shot(menuPc, "client-1-carte-qr-pc");
  await guestPc.close();

  // ── The team finds the booking and seats it ────────────────────────────────
  const team = await session(DESKTOP, { storageState: await platform.storageState() });
  const admin = await team.newPage();
  await admin.goto("/admin/bookings");
  await admin.getByPlaceholder(/Nom, e-mail ou référence/).fill(GUEST_EMAIL);
  await admin.getByRole("button", { name: "Rechercher" }).click();
  await admin.getByText("Jeanne Dupont").first().click();
  await admin.getByText("Allergie aux crustacés, merci.").waitFor();
  await shot(admin, "equipe-2-reservation-pc");
  await admin.getByRole("button", { name: "Arrivé" }).click();
  await admin.getByRole("button", { name: "Installé" }).click();
  await admin.getByText("Installé").first().waitFor();
  await shot(admin, "equipe-3-installee-pc");

  // The timetable of the booked day, on the language's own clock.
  const planning = await team.newPage();
  await planning.goto("/admin/bookings");
  await planning.getByText(NAME, { exact: true }).first().click();
  await planning.getByRole("button", { name: "Jour suivant" }).click();
  await planning.getByText("Jeanne D").first().waitFor();
  await shot(planning, "equipe-1-planning-pc");
  await team.close();

  // ── The restaurateur closes a weekday ──────────────────────────────────────
  const owner2 = await session(TALL);
  const hours = await owner2.newPage();
  await hours.goto("/onboarding/login");
  await hours.getByTestId("onboarding-login-email").fill(OWNER_EMAIL);
  await hours.getByTestId("onboarding-login-password").fill(PASSWORD);
  await hours.getByTestId("onboarding-login-submit").click();
  await hours.getByTestId("stage-preview").waitFor();
  await hours.getByTestId("stepper-hours").click();
  await hours.getByTestId("step-hours").waitFor();
  const weekday = WEEKDAYS_FR[new Date(`${CLOSED_DATE}T12:00:00Z`).getUTCDay()];
  await hours.getByRole("switch", { name: `${weekday} : ouvert` }).click();
  await shot(hours, "restaurateur-9-jour-ferme-pc");
  await hours.getByTestId("step-hours-continue").click();
  await hours.getByTestId("step-layout").waitFor();
  await owner2.close();

  // ── The back office on a pale brand colour ─────────────────────────────────
  const brandBefore = await (await platform.request.get("/api/brand")).json();
  await platform.request.patch("/api/brand", { data: { primaryColor: "#facc15" } });
  try {
    for (const [name, route] of [
      ["marque-claire-tableau-de-bord-pc", "/admin/dashboard"],
      ["marque-claire-reservations-pc", "/admin/bookings"],
    ]) {
      const colour = await session(DESKTOP, { storageState: await platform.storageState() });
      const view = await colour.newPage();
      await view.goto(route);
      await view.waitForTimeout(1500);
      await shot(view, name);
      await colour.close();
    }
    const colourMenu = await session(PHONE);
    const menuYellow = await colourMenu.newPage();
    await menuYellow.goto(menuAddress);
    await menuYellow.getByTestId("menu-restaurant-name").waitFor();
    await shot(menuYellow, "marque-claire-carte-qr-telephone");
    await colourMenu.close();
  } finally {
    await platform.request.patch("/api/brand", {
      data: { primaryColor: brandBefore.primaryColor ?? "" },
    });
  }
} finally {
  await platform.request.patch(`/api/admin/restaurants/${restaurant.id}`, {
    data: { isArchived: true },
  });
  await platform.request.delete(`/api/admin/restaurants/${restaurant.id}`);
  await platform.close();
  await browser.close();
}
