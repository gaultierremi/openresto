#!/usr/bin/env node
/**
 * Captures the guest's journey on a 375px phone from a running OpenResto stack seeded with the
 * demo data (`bash scripts/seed-local.sh`): browse, pick a time, fill the booking sheet,
 * confirmation, the emailed link opened on a phone set to another timezone, the cancel prompt,
 * and (when MENU_URL is given) the QR menu with the allergen panel open.
 *
 *   BASE_URL=http://localhost:5062 node scripts/capture-client-audit.mjs [outDir]
 *   BASE_URL=... MENU_URL=http://localhost:5062/menu/r/<token> node scripts/capture-client-audit.mjs
 *
 * Every figure the audit quotes about the journey is printed: taps from slot to confirmation,
 * the time shown on a device in the restaurant's timezone versus one in another, and the size of
 * each touch target the guest meets. Fictitious data only: the guest is "Marie Test".
 * CHROMIUM_PATH points at an installed browser instead of Playwright's own.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:5062";
const MENU_URL = process.env.MENU_URL;
const OUT_DIR = path.resolve(
  process.argv[2] ??
    path.join(path.dirname(fileURLToPath(import.meta.url)), "../../docs/captures/client-final")
);

const PHONE = { width: 375, height: 812 };
const MARIE = { name: "Marie Test", email: "marie.test@example.com" };

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ["--no-sandbox"],
});

function phone(timezoneId) {
  return browser.newContext({
    viewport: PHONE,
    baseURL: BASE_URL,
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    locale: process.env.LOCALE ?? "en-US",
    timezoneId,
  });
}

async function shot(page, name) {
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(OUT_DIR, name) });
  console.log("captured", name);
}

await mkdir(OUT_DIR, { recursive: true });

const first = await phone("America/New_York");
const page = await first.newPage();
await page.goto("/locations", { waitUntil: "networkidle" });
await shot(page, "01-locations.png");

const targets = await page.evaluate(() =>
  [...document.querySelectorAll("button,[role=button],a[role=link]")]
    .map((e) => ({
      label: (e.getAttribute("aria-label") ?? e.textContent ?? "").trim().slice(0, 40),
      height: Math.round(e.getBoundingClientRect().height),
      width: Math.round(e.getBoundingClientRect().width),
    }))
    .filter((t) => t.height > 0 && (t.height < 44 || t.width < 44))
);
console.log("touch targets under 44px on /locations:", JSON.stringify(targets));

const startedAt = Date.now();
await page
  .getByRole("button", { name: /^Book .* at \d\d:\d\d$/ })
  .first()
  .tap();
await page.getByLabel("Full name").waitFor();
await shot(page, "02-booking-sheet.png");
await page.getByLabel("Full name").fill(MARIE.name);
await page.getByLabel("Email address").fill(MARIE.email);
const confirm = page.getByRole("button", { name: "Confirm booking" });
await confirm.scrollIntoViewIfNeeded();
await shot(page, "03-booking-sheet-bottom.png");
await confirm.tap();
await page.waitForURL(/booking-confirmation/);
console.log(`slot tap to confirmation, scripted typing included: ${Date.now() - startedAt} ms`);
await shot(page, "04-confirmation.png");
const link = page.url();
const timeOnRestaurantClock = await page
  .getByText(/\d\d:\d\d (AM|PM)/)
  .first()
  .textContent();
await first.close();

// The emailed link, opened on a phone that is not in the restaurant's timezone, with no cookie.
const abroad = await phone("Europe/Brussels");
const abroadPage = await abroad.newPage();
await abroadPage.goto(link, { waitUntil: "networkidle" });
const timeOnAbroadClock = await abroadPage
  .getByText(/\d\d:\d\d (AM|PM)/)
  .first()
  .textContent();
console.log(
  `time shown: ${timeOnRestaurantClock} (device in the restaurant's timezone) vs ${timeOnAbroadClock} (device in Europe/Brussels)`
);
await shot(abroadPage, "05-link-other-timezone.png");
await abroadPage.getByRole("button", { name: /Cancel This Booking/i }).tap();
await shot(abroadPage, "06-cancel-prompt.png");
await abroad.close();

if (MENU_URL) {
  const menu = await phone("Europe/Brussels");
  const menuPage = await menu.newPage();
  await menuPage.goto(MENU_URL, { waitUntil: "networkidle" });
  await shot(menuPage, "07-qr-menu.png");
  await menuPage
    .getByRole("button", { name: /allerg/i })
    .first()
    .tap();
  await shot(menuPage, "08-qr-menu-allergens.png");
  await menu.close();
}

await browser.close();
