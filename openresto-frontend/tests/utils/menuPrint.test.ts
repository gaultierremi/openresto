/** @jest-environment jsdom */
import { menuPrintHtml, openPrintPreview, qrPrintHtml } from "@/utils/menuPrint";
import type { OnboardingMenu } from "@/api/onboarding";

const menu: OnboardingMenu = {
  menuId: 1,
  name: "Carte",
  categories: [
    {
      name: "Plats",
      items: [
        {
          name: "Soupe",
          description: "<script>alert(1)</script>",
          priceMinor: 750,
          allergens: ["Celery"],
          availability: "SoldOut",
          translations: { nl: { name: "Soep", description: "Groenten" } },
        },
        { name: "Secret draft", description: null, priceMinor: null, availability: "Hidden" },
      ],
    },
    { name: "Hidden category", isVisible: false, items: [] },
  ],
};

it("prints translated visible dishes, prices, sold out and declared allergens", () => {
  const html = menuPrintHtml("Restaurant Fictif", menu, "nl");
  expect(html).toContain("Soep");
  expect(html).toContain("Groenten");
  expect(html).toContain("7");
  expect(html).toContain("Selder");
  expect(html).not.toContain("Secret draft");
  expect(html).not.toContain("Hidden category");
});

it("escapes all user text instead of creating markup", () => {
  const html = menuPrintHtml('<img src=x onerror="alert(1)">', menu, "fr");
  expect(html).toContain("&lt;img");
  expect(html).toContain("&lt;script&gt;");
  expect(html).not.toContain("<script>");
  expect(html).not.toContain("<img");
});

it("prints the general QR and every table QR with the full public address", () => {
  const html = qrPrintHtml(
    "<Fictif>",
    {
      restaurantToken: "general",
      tables: [{ tableId: 1, tableName: "Table A", sectionName: "Salle", token: "table" }],
    },
    "https://resto.example"
  );
  expect(html.match(/<figure>/g)).toHaveLength(2);
  expect(html).toContain("https://resto.example/menu/r/general");
  expect(html).toContain("https://resto.example/menu/t/table");
  expect(html).toContain("&lt;Fictif&gt;");
});

it("reports a blocked popup and uses an already opened preview after async loading", () => {
  const open = jest.spyOn(window, "open").mockReturnValue(null);
  expect(openPrintPreview("Fictif", "<p>Menu</p>")).toBe(false);
  const print = jest.fn();
  const doc = document.implementation.createHTMLDocument();
  const popup = { document: doc, print, opener: window } as unknown as Window;
  expect(openPrintPreview("Fictif", "<p>Menu</p>", popup)).toBe(true);
  expect(popup.opener).toBeNull();
  doc.querySelector("button")!.click();
  expect(print).toHaveBeenCalledTimes(1);
  open.mockRestore();
});
