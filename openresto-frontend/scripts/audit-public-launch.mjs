import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import lighthouse from "lighthouse";
import { launch } from "chrome-launcher";

const baseUrl = process.env.LAUNCH_BASE_URL ?? "http://localhost:5062";
const destination = path.resolve(process.env.LIGHTHOUSE_OUTPUT_DIR ?? "lighthouse-launch");
await mkdir(destination, { recursive: true });
const sitemap = await (await fetch(`${baseUrl}/sitemap.xml`)).text();
const restaurantPaths = [...sitemap.matchAll(/<loc>[^<]+(\/r\/[a-z0-9-]+)<\/loc>/g)].map(
  (m) => m[1]
);
if (!restaurantPaths.length)
  throw new Error("Publiez le restaurant du parcours de lancement avant l’audit.");
const paths = [
  "/",
  "/inscription",
  "/inscription/envoyee",
  "/legal",
  "/legal/terms",
  "/legal/privacy",
  "/legal/dpa",
  "/legal/legal-notice",
  ...restaurantPaths,
  "/locations?lang=fr",
  "/lookup?lang=fr",
  "/booking-confirmation/exemple",
  ...JSON.parse(await readFile("test-results/launch-audit-paths.json", "utf8")),
];
const chrome = await launch({
  chromePath: process.env.CHROMIUM_PATH || undefined,
  chromeFlags: ["--headless", "--no-sandbox", "--disable-dev-shm-usage"],
});
const summary = [];
try {
  for (const [index, pagePath] of paths.entries()) {
    const result = await lighthouse(`${baseUrl}${pagePath}`, {
      port: chrome.port,
      output: ["html", "json"],
      logLevel: "error",
      onlyCategories: ["performance", "accessibility", "best-practices", "seo"],
    });
    if (!result) throw new Error(`Audit sans résultat : ${pagePath}`);
    const scores = Object.fromEntries(
      Object.entries(result.lhr.categories).map(([key, value]) => [
        key,
        Math.round((value.score ?? 0) * 100),
      ])
    );
    summary.push({ path: pagePath, ...scores });
    await writeFile(path.join(destination, `${index}.html`), result.report[0]);
    await writeFile(path.join(destination, `${index}.json`), result.report[1]);
    console.log(JSON.stringify(summary.at(-1)));
  }
} finally {
  await chrome.kill();
}
await writeFile(path.join(destination, "scores.json"), JSON.stringify(summary, null, 2) + "\n");
if (summary.some((s) => s.performance < 90 || s.accessibility < 90)) process.exitCode = 1;
