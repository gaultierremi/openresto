#!/usr/bin/env node
/**
 * Captures the menu module's screens (admin editor, service mode, public page, QR sheets) from a
 * running OpenResto stack seeded with the demo data (`bash scripts/seed-local.sh`), at desktop
 * width and, where the screen is built for a phone, at 390px. The admin editor and the QR sheets
 * sit behind the admin's desktop-only wall below 600px, so they are desktop captures only.
 *
 *   BASE_URL=http://localhost:5062 node scripts/capture-menu-screens.mjs [outDir]
 *
 * The stack is expected the way the Docker compose serves it: the app and `/api` and `/media`
 * on one origin. Environment: ADMIN_EMAIL / ADMIN_PASSWORD (defaults are the dev seed's),
 * CHROMIUM_PATH to point at an installed browser instead of Playwright's own.
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
    path.join(path.dirname(fileURLToPath(import.meta.url)), "../../docs/captures/sprint-2")
);

const DESKTOP = { width: 1280, height: 900 };
const MOBILE = { width: 390, height: 844 };

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ["--no-sandbox"],
});

async function session(viewport, { admin }) {
  // Phone captures at 2x so text stays readable once GitHub scales them; desktop ones at 1x
  // keep the files small.
  const context = await browser.newContext({
    viewport,
    baseURL: BASE_URL,
    deviceScaleFactor: viewport.width < 600 ? 2 : 1,
  });
  // French, the language the demo is shown in: the admin follows the saved pick, the public
  // menu opens in French on its own.
  await context.addInitScript(() => localStorage.setItem("openresto.locale", "fr"));
  const page = await context.newPage();
  if (admin) {
    const res = await page.request.post("/api/admin/auth/login", {
      data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
    });
    if (!res.ok()) throw new Error(`Admin login failed (HTTP ${res.status()})`);
  }
  return { context, page };
}

async function shot(page, name, options = {}) {
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(OUT_DIR, name), ...options });
  console.log("captured", name);
}

await mkdir(OUT_DIR, { recursive: true });

// What the demo's flagship holds, read through the API so the captures follow the data.
const { page: api } = await session(DESKTOP, { admin: true });
const restaurantId = 1;
const menus = await (await api.request.get(`/api/admin/restaurants/${restaurantId}/menus`)).json();
const tokens = await (
  await api.request.get(`/api/admin/restaurants/${restaurantId}/public-tokens`)
).json();
const food = menus.find((m) => m.name === "Food") ?? menus[0];
const dish =
  food.categories.flatMap((c) => c.items).find((i) => i.name === "Milk steak") ??
  food.categories.flatMap((c) => c.items)[0];
const publicPath = `/menu/r/${tokens.restaurantToken}`;
const tablePath = `/menu/t/${tokens.tables[0].token}`;

// ── Desktop: the admin ──────────────────────────────────────────────────────
{
  const { context, page } = await session(DESKTOP, { admin: true });

  await page.goto("/admin/menus");
  await page.getByTestId("menu-card").first().waitFor();
  await shot(page, "01-admin-cartes-liste.png");

  await page.getByTestId(`menu-toggle-${food.id}`).click();
  await page.getByTestId(`item-edit-${dish.id}`).click();
  await page.getByTestId("item-editor").waitFor();
  await page.setViewportSize({ width: 1280, height: 1150 });
  await page.getByTestId("item-editor").scrollIntoViewIfNeeded();
  await shot(page, "02-admin-plat-edition.png");

  await page.setViewportSize(DESKTOP);
  await page.goto("/admin/menus/service");
  await page
    .getByTestId(/service-item-/)
    .first()
    .waitFor();
  await shot(page, "03-admin-mode-service.png");

  await page.goto("/admin/qr-codes");
  await page.getByTestId("qr-restaurant").waitFor();
  await shot(page, "06-admin-qr-codes.png");

  await page.setViewportSize({ width: 900, height: 1260 });
  await page.goto(`/admin/qr-codes/print?restaurant=${restaurantId}&format=a4&scope=tables`);
  await page.getByTestId("qr-page").first().waitFor();
  await shot(page, "07-qr-fiche-a4.png");

  await page.setViewportSize({ width: 900, height: 700 });
  await page.goto(`/admin/qr-codes/print?restaurant=${restaurantId}&format=a6&scope=tables`);
  await page.getByTestId("qr-page").first().waitFor();
  await shot(page, "08-qr-chevalet-a6.png");

  await context.close();
}

// ── Desktop and mobile: the public page ─────────────────────────────────────
for (const [suffix, viewport] of [
  ["", DESKTOP],
  ["-mobile", MOBILE],
]) {
  const { context, page } = await session(viewport, { admin: false });

  await page.goto(publicPath);
  await page.getByTestId("menu-restaurant-name").waitFor();
  await shot(page, `04-page-publique${suffix}.png`);

  await page.getByTestId("menu-diet-GlutenFree").click();
  await page.waitForTimeout(300);
  await shot(page, `05-page-publique-sans-gluten${suffix}.png`);

  if (suffix === "") {
    await page.goto(tablePath);
    await page.getByTestId("menu-restaurant-name").waitFor();
    await shot(page, "04b-page-publique-table.png");
  }
  await context.close();
}

// ── Mobile: the service screen, the one admin surface built for a phone ─────
{
  const { context, page } = await session(MOBILE, { admin: true });
  await page.goto("/admin/menus/service");
  await page
    .getByTestId(/service-item-/)
    .first()
    .waitFor();
  await shot(page, "03-admin-mode-service-mobile.png");
  await context.close();
}

await browser.close();
