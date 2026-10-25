import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

const require = createRequire(
  new URL("../../openresto-frontend/package.json", import.meta.url),
);
const { chromium, expect } = require("@playwright/test");
const [configFile, origin, tokensFile] = process.argv.slice(2);
const browserOrigin = new URL(origin);
browserOrigin.hostname = "localhost";
const config = Object.fromEntries(
  (await readFile(configFile, "utf8"))
    .trim()
    .split("\n")
    .map((line) => {
      const separator = line.indexOf("=");
      return [
        line.slice(0, separator),
        line.slice(separator + 1).replace(/^'|'$/g, ""),
      ];
    }),
);
const tokens = JSON.parse(await readFile(tokensFile, "utf8"));
const browser = await chromium.launch({
  executablePath: process.env.DEMO_CHROMIUM_EXECUTABLE || undefined,
});
try {
  const context = await browser.newContext({
    baseURL: browserOrigin.href,
    locale: "fr-BE",
    httpCredentials: { username: "demo", password: config.DEMO_PASSWORD },
  });
  const page = await context.newPage();
  await page.goto(`/menu/r/${tokens.r}`);
  await expect(
    page.getByText("Croquettes de légumes", { exact: true }),
  ).toBeVisible({
    timeout: 20000,
  });
  for (const [language, dish] of [
    ["Nederlands", "Groentekroketten"],
    ["English", "Vegetable croquettes"],
  ]) {
    await page.getByRole("combobox").click();
    await page.getByRole("option", { name: language, exact: true }).click();
    await expect(page.getByText(dish, { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByText(dish, { exact: true })).toBeVisible({
      timeout: 20000,
    });
  }
  await page.goto(`/menu/t/${tokens.t}`);
  await expect(
    page.getByText("Vegetable croquettes", { exact: true }),
  ).toBeVisible({
    timeout: 20000,
  });
  const statuses = await page.evaluate(async (publicTokens) => {
    const request = (path, method = "GET") =>
      fetch(path, { method, credentials: "omit" }).then(
        (response) => response.status,
      );
    return Promise.all([
      request(`/api/menus/r/${publicTokens.r}`),
      request(`/api/menus/t/${publicTokens.t}`),
      request(`/api/menus/r/${publicTokens.r}`, "POST"),
      request("/api/restaurants"),
      request("/api/admin/auth/me"),
    ]);
  }, tokens);
  expect(statuses).toEqual([200, 200, 401, 401, 401]);
  await context.close();
  process.stdout.write(
    "OK : cartes r/t dans Chromium, credentials omit, FR/NL/EN et choix conservé.\n",
  );
} finally {
  await browser.close();
}
