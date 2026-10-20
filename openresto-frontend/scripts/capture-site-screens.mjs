#!/usr/bin/env node
/**
 * Captures the restaurant website (the three themes, on a phone and on a desktop) and the admin's
 * "Mon site" screen from a running OpenResto stack seeded with the demo data
 * (`bash scripts/seed-local.sh`). The public pages are changed to each theme in turn through the
 * admin API and put back afterwards.
 *
 *   BASE_URL=http://localhost:5062 node scripts/capture-site-screens.mjs [outDir]
 *
 * The stack is expected the way the Docker compose serves it: the app, `/api`, `/r` and `/media`
 * on one origin (`node scripts/serve-local-stack.mjs` does that without Docker). Environment:
 * ADMIN_EMAIL / ADMIN_PASSWORD (defaults are the dev seed's), CAPTURE_RESTAURANT to pick another
 * location, CHROMIUM_PATH to use an installed browser instead of Playwright's own.
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
    path.join(path.dirname(fileURLToPath(import.meta.url)), "../../docs/captures/sprint-3")
);

const DESKTOP = { width: 1280, height: 900 };
const MOBILE = { width: 390, height: 844 };
const THEMES = [
  ["brasserie", "Brasserie"],
  ["gastronomique", "Gastronomique"],
  ["cafe", "Cafe"],
];

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ["--no-sandbox"],
});

async function session(viewport, { admin }) {
  // Phone captures at 2x so text stays readable once GitHub scales them; desktop ones at 1x.
  const context = await browser.newContext({
    viewport,
    baseURL: BASE_URL,
    deviceScaleFactor: viewport.width < 600 ? 2 : 1,
    locale: "fr-BE",
  });
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
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUT_DIR, name), ...options });
  console.log("captured", name);
}

await mkdir(OUT_DIR, { recursive: true });

/** The page lazy-loads what is below the fold, so a full-page capture has to scroll it into view first. */
async function loadLazyImages(page) {
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 500) {
      window.scrollTo(0, y);
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(1200);
  await page
    .waitForFunction(() => [...document.images].every((img) => img.complete), null, {
      timeout: 8000,
    })
    .catch(async () => {
      const pending = await page.evaluate(() =>
        [...document.images].filter((img) => !img.complete).map((img) => img.src)
      );
      throw new Error(`Images still loading: ${pending.join(", ")}`);
    });
}

const { page: api } = await session(DESKTOP, { admin: true });
const locations = await (await api.request.get("/api/admin/restaurants")).json();
const restaurant =
  locations.find((r) => r.name === (process.env.CAPTURE_RESTAURANT ?? "Brasserie de la Senne Dorée")) ??
  locations[0];
const siteUrl = `/api/admin/restaurants/${restaurant.id}/site`;
const original = await (await api.request.get(siteUrl)).json();
if (!original.isPublished) throw new Error(`${restaurant.name} has no published site: seed the demo first`);

/** The settings the PUT replaces wholesale, read back from what the site holds. */
const settingsWith = (theme) => ({
  slug: original.slug,
  theme,
  tagline: original.tagline,
  socialLinks: original.socialLinks.map(({ kind, url }) => ({ kind, url })),
  legal: original.legal,
});

try {
  for (const [file, theme] of THEMES) {
    const res = await api.request.put(siteUrl, { data: settingsWith(theme) });
    if (!res.ok()) throw new Error(`Could not switch to ${theme} (HTTP ${res.status()})`);

    for (const [suffix, viewport] of [
      ["pc", DESKTOP],
      ["telephone", MOBILE],
    ]) {
      const { context, page } = await session(viewport, { admin: false });
      await page.goto(original.publicPath);
      await page.getByRole("heading", { level: 1 }).waitFor();
      await loadLazyImages(page);
      await shot(page, `site-${file}-${suffix}.png`, { fullPage: true });
      await context.close();
    }
  }
} finally {
  await api.request.put(siteUrl, { data: settingsWith(original.theme) });
}

await browser.close();
