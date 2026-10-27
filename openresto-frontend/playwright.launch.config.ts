import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: ["launch-public.spec.ts", "quick-start-mobile.spec.ts"],
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  expect: { timeout: 20_000 },
  reporter: [["list"], ["html", { outputFolder: "playwright-report-launch", open: "never" }]],
  use: {
    baseURL: process.env.LAUNCH_BASE_URL ?? "http://localhost:5062",
    locale: "fr-BE",
    trace: "retain-on-failure",
    launchOptions: {
      executablePath: process.env.CHROMIUM_PATH || undefined,
      args: ["--no-sandbox"],
    },
  },
  projects: [{ name: "lancement", use: { ...devices["Desktop Chrome"] } }],
});
