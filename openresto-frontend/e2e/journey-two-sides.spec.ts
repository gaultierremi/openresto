import {
  test,
  expect,
  type Browser,
  type BrowserContext,
  type Locator,
  type Page,
} from "@playwright/test";
import jsQR from "jsqr";
import { ADMIN_EMAIL, ADMIN_PASSWORD, futureDateStr, selectBookingDate } from "./helpers";

/**
 * A restaurant's first week, from both sides of the counter, in French and against the real
 * server: the restaurateur signs up from an invitation, builds the menu with its allergens,
 * prints the QR code and publishes; a guest scans that code, reads the menu, filters it for
 * an allergy, books a table and gets the confirmation; the team finds the booking and seats
 * it; the restaurateur then changes the opening hours and the guest side follows.
 *
 * What a unit test cannot say is asserted here: that the printed file really decodes to the
 * menu's address (a scanner is a program, so `jsqr` stands in for one), that the page the code
 * opens is the restaurant's own and answers "unavailable" while it is a draft, that the
 * "Book a table" button leads to this restaurant's booking page and not the whole list, and
 * that a closed day stops offering slots.
 *
 * The suite is serial because each step starts from what the one before saved, and it uses a
 * fresh name and address per run because there is no delete endpoint short of the Owner's
 * archive-then-purge, which `afterAll` performs.
 */
const stamp = Date.now();
const NAME = `Chez Marguerite ${String(stamp).slice(-5)}`;
const OWNER_EMAIL = `marguerite-${stamp}@example.com`;
const PASSWORD = "Une-phrase-assez-longue-1";
const GUEST_NAME = "Jeanne Dupont";
const GUEST_EMAIL = `jeanne-${stamp}@example.com`;
const BASE_URL = "http://localhost:5062";
const FRENCH = "fr-BE";

const WEEKDAYS_FR = [
  "Dimanche",
  "Lundi",
  "Mardi",
  "Mercredi",
  "Jeudi",
  "Vendredi",
  "Samedi",
] as const;

/** The French name of the weekday a `YYYY-MM-DD` date falls on, as the hours step writes it. */
const weekdayOf = (date: string): string => WEEKDAYS_FR[new Date(`${date}T12:00:00Z`).getUTCDay()];

async function frenchContext(browser: Browser, extra: Parameters<Browser["newContext"]>[0] = {}) {
  const ctx = await browser.newContext({ baseURL: BASE_URL, locale: FRENCH, ...extra });
  // The back office follows the instance's language, not the browser's: the picked one wins.
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem("openresto.locale", "fr");
    } catch {
      // A sandboxed frame has no storage, and needs none.
    }
  });
  return ctx;
}

/**
 * What a phone's camera would read: the code is drawn onto a canvas in the page and handed to
 * `jsqr`. Returns null when nothing decodes, which is a failing test rather than a thrown error.
 */
async function scanImage(page: Page, dataUrl: string): Promise<string | null> {
  // The pixels cross from the page to Node as base64: a JSON array of four million numbers
  // takes half a minute to serialise, a 5 MB string takes no time.
  const pixels = await page.evaluate(async (src) => {
    const image = new Image();
    image.src = src;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d")!;
    context.drawImage(image, 0, 0);
    const { data, width, height } = context.getImageData(0, 0, canvas.width, canvas.height);
    let binary = "";
    const CHUNK = 0x8000;
    for (let i = 0; i < data.length; i += CHUNK) {
      binary += String.fromCharCode(...data.subarray(i, i + CHUNK));
    }
    return { base64: btoa(binary), width, height };
  }, dataUrl);
  const rgba = new Uint8ClampedArray(Buffer.from(pixels.base64, "base64"));
  return jsQR(rgba, pixels.width, pixels.height)?.data ?? null;
}

async function openDeclarations(page: Page, dish: string) {
  await page.getByTestId(`${dish}-declarations`).click();
}

const visibleDishes = (page: Page): Locator => page.getByTestId("menu-item");

test.describe("A restaurant's first week, from both sides", { tag: "@smoke" }, () => {
  test.describe.configure({ mode: "serial" });

  let platform: BrowserContext;
  let restaurateur: BrowserContext;
  let guest: BrowserContext;
  let restaurantId = 0;
  let invitationPath = "";
  let menuAddress = "";
  let bookingRef = "";
  const bookingDate = futureDateStr(14);
  const closedDate = futureDateStr(15);

  test.beforeAll(async ({ browser }) => {
    platform = await frenchContext(browser);
    const login = await platform.request.post("/api/admin/auth/login", {
      data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
    });
    expect(login.ok(), `platform login (HTTP ${login.status()})`).toBeTruthy();
    restaurateur = await frenchContext(browser);
    guest = await frenchContext(browser, { viewport: { width: 390, height: 844 } });
  });

  test.afterAll(async () => {
    if (restaurantId) {
      await platform.request.patch(`/api/admin/restaurants/${restaurantId}`, {
        data: { isArchived: true },
      });
      await platform.request.delete(`/api/admin/restaurants/${restaurantId}`);
    }
    await platform.close();
    await restaurateur.close();
    await guest.close();
  });

  test("the platform adds the restaurant and gets a link to hand over", async () => {
    const created = await platform.request.post("/api/platform/restaurants", {
      data: { name: NAME, ownerEmail: OWNER_EMAIL, locale: "fr" },
    });
    expect(created.status()).toBe(200);
    const body = (await created.json()) as {
      restaurant: { id: number; status: string };
      invitationUrl: string;
    };
    restaurantId = body.restaurant.id;
    invitationPath = new URL(body.invitationUrl).pathname;
    expect(body.restaurant.status).toBe("Draft");
  });

  test("the restaurateur makes an account, in French, once the three documents are accepted", async () => {
    const page = await restaurateur.newPage();
    await page.goto(invitationPath);
    await expect(page.getByRole("heading", { name: "Bienvenue" })).toBeVisible();
    await expect(page.getByTestId("invitation-restaurant")).toContainText(NAME);
    await page.getByLabel("Mot de passe", { exact: true }).fill(PASSWORD);
    await page.getByLabel("Confirmer le mot de passe").fill(PASSWORD);

    await expect(page.getByTestId("invitation-submit")).toBeDisabled();
    for (const key of ["terms", "privacy", "dpa"]) {
      await page.getByTestId(`invitation-consent-${key}`).click();
    }
    await page.getByTestId("invitation-submit").click();

    await expect(page.getByTestId("step-info")).toBeVisible();
    await page.close();
  });

  test("steps one to three: the restaurant, its week and one table of four", async () => {
    const page = await restaurateur.newPage();
    await page.goto("/onboarding");
    await expect(page.getByTestId("step-info")).toBeVisible();
    await page.getByLabel("Adresse", { exact: true }).fill("Rue Haute 12, 1000 Bruxelles");
    await page.getByLabel("Téléphone").fill("+32 2 123 45 67");
    await page.getByLabel("E-mail de contact").fill(OWNER_EMAIL);
    await page.getByLabel("Raison sociale").fill("Marguerite SRL");
    await page.getByLabel("Numéro d'entreprise (BCE)").fill("0123.456.749");
    await page.getByTestId("step-info-continue").click();

    await expect(page.getByTestId("step-hours")).toBeVisible();
    await expect(page.getByText("Un jour fermé n'accepte aucune réservation.")).toBeVisible();
    await page.getByTestId("step-hours-continue").click();

    await expect(page.getByTestId("step-layout")).toBeVisible();
    await page.getByTestId("room-0-table-0-name").fill("T1");
    await page.getByRole("button", { name: "Un couvert de plus" }).click();
    await page.getByRole("button", { name: "Un couvert de plus" }).click();
    await page.getByTestId("step-layout-continue").click();
    await expect(page.getByTestId("step-menu")).toBeVisible();
    await page.close();
  });

  test("step four: the menu, with the allergens and diets a guest will filter on", async () => {
    const page = await restaurateur.newPage();
    await page.goto("/onboarding");
    await expect(page.getByTestId("step-menu")).toBeVisible();

    await page.getByTestId("menu-add-category").click();
    await page.getByTestId("category-0-name").fill("Entrées");

    const croquettes = "category-0-dish-0";
    await page.getByTestId(`${croquettes}-name`).fill("Croquettes aux crevettes");
    await page.getByTestId(`${croquettes}-price`).fill("14,50");
    await page
      .getByTestId(`${croquettes}-description`)
      .fill("Deux croquettes, citron, persil frit");
    await openDeclarations(page, croquettes);
    await page.getByTestId(`${croquettes}-allergen-Crustaceans`).click();
    await page.getByTestId(`${croquettes}-allergen-Gluten`).click();
    await expect(page.getByTestId(`${croquettes}-declarations`)).toContainText(
      "Allergènes et régimes (2)"
    );

    await page.getByTestId("category-0-add-dish").click();
    const salade = "category-0-dish-1";
    await page.getByTestId(`${salade}-name`).fill("Salade de saison");
    await page.getByTestId(`${salade}-price`).fill("12");
    await openDeclarations(page, salade);
    await page.getByTestId(`${salade}-diet-Vegan`).click();

    await page.getByTestId("category-0-add-dish").click();
    await page.getByTestId("category-0-dish-2-name").fill("Soupe du jour");

    await page.getByTestId("step-menu-continue").click();
    await expect(page.getByTestId("step-branding")).toBeVisible();

    const saved = (await (
      await restaurateur.request.get(`/api/onboarding/restaurants/${restaurantId}`)
    ).json()) as {
      menu: {
        categories: { items: { name: string; allergens: string[]; dietaryTags: string[] }[] }[];
      };
    };
    const dishes = Object.fromEntries(saved.menu.categories[0].items.map((i) => [i.name, i]));
    expect(dishes["Croquettes aux crevettes"].allergens.sort()).toEqual(["Crustaceans", "Gluten"]);
    expect(dishes["Salade de saison"].dietaryTags).toEqual(["Vegan"]);
    expect(dishes["Soupe du jour"].allergens).toEqual([]);
    await page.close();
  });

  test("the printed QR code decodes to the menu's address, and that page says 'unavailable' until the restaurant is published", async () => {
    const page = await restaurateur.newPage();
    await page.goto("/onboarding");
    await expect(page.getByTestId("step-branding")).toBeVisible();
    await page.getByTestId("step-branding-skip").click();
    await expect(page.getByTestId("stage-preview")).toBeVisible();
    await expect(
      page.getByText("Ce code ne fonctionnera qu'une fois votre établissement publié.")
    ).toBeVisible();

    const shown = (await page.getByTestId("qr-url").textContent())!.trim();
    expect(shown).toMatch(new RegExp(`^${BASE_URL}/menu/r/[A-Za-z0-9_-]{22}$`));

    const download = page.waitForEvent("download");
    await page.getByTestId("qr-download-png").click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/^chez-marguerite-\d+-carte\.png$/);
    const bytes = await (await import("node:fs/promises")).readFile((await file.path())!);
    const scanned = await scanImage(page, `data:image/png;base64,${bytes.toString("base64")}`);

    expect(scanned, "the downloaded image decodes").toBe(shown);
    menuAddress = scanned!;

    // A draft restaurant has no public menu: the page a guest would reach says so, plainly.
    const early = await guest.newPage();
    await early.goto(menuAddress);
    await expect(early.getByText("Carte indisponible")).toBeVisible();
    await expect(early.getByTestId("menu-item")).toHaveCount(0);
    await early.close();
    await page.close();
  });

  test("the restaurateur publishes", async () => {
    const page = await restaurateur.newPage();
    await page.goto("/onboarding");
    await expect(page.getByTestId("stage-preview")).toBeVisible();
    await page.getByTestId("publish-button").click();
    await page.getByRole("button", { name: "Oui, publier" }).click();
    await expect(page.getByTestId("publish-live")).toBeVisible();
    await expect(
      page.getByText("Ce code est actif : vos clients peuvent le scanner dès maintenant.")
    ).toBeVisible();
    await page.close();
  });

  test("a guest scans the code and reads the menu: names, prices, 'price on request'", async () => {
    const page = await guest.newPage();
    await page.goto(menuAddress);

    await expect(page.getByTestId("menu-restaurant-name")).toHaveText(NAME);
    await expect(visibleDishes(page)).toHaveCount(3);
    await expect(page.getByText("Croquettes aux crevettes")).toBeVisible();
    await expect(page.getByText("14,50 €")).toBeVisible();
    await expect(page.getByText("Prix sur demande")).toBeVisible();
    await expect(page.getByTestId("menu-no-declarations")).toHaveCount(0);
    await page.close();
  });

  test("the allergen filter hides the dish that declares it, and the diet filter keeps what fits", async () => {
    const page = await guest.newPage();
    await page.goto(menuAddress);
    await expect(visibleDishes(page)).toHaveCount(3);

    await page.getByTestId("menu-allergens-toggle").click();
    await page.getByTestId("menu-allergen-Crustaceans").click();
    await expect(visibleDishes(page)).toHaveCount(2);
    await expect(page.getByText("Croquettes aux crevettes")).toHaveCount(0);
    await expect(page.getByText("Salade de saison")).toBeVisible();

    await page.getByTestId("menu-filters-clear").click();
    await expect(visibleDishes(page)).toHaveCount(3);

    await page.getByTestId("menu-diet-Vegan").click();
    await expect(visibleDishes(page)).toHaveCount(1);
    await expect(page.getByText("Salade de saison")).toBeVisible();
    await page.close();
  });

  test("the guest books through this restaurant's own page and gets the confirmation", async () => {
    const page = await guest.newPage();
    await page.goto(menuAddress);
    await page.getByTestId("menu-book").click();

    await page.waitForURL(new RegExp(`/locations/${restaurantId}$`));
    await expect(page.getByTestId("locations-filter-bar")).toBeVisible({ timeout: 20_000 });
    await selectBookingDate(page, bookingDate);

    // The list shows every restaurant of the instance, so the slot is asked for by this one's name.
    const slot = page.getByLabel(new RegExp(`^Réserver ${NAME} à \\d{2}:\\d{2}$`)).first();
    await expect(slot).toBeVisible({ timeout: 20_000 });
    await slot.click();
    await expect(page.getByTestId("booking-drawer")).toBeVisible();

    await page.getByLabel("Nom complet").fill(GUEST_NAME);
    await page.getByLabel("Adresse e-mail").fill(GUEST_EMAIL);
    await page
      .getByLabel("Demandes particulières ou allergies")
      .fill("Allergie aux crustacés, merci.");

    const confirm = page.getByRole("button", { name: "Confirmer la réservation" });
    await expect(confirm).toBeEnabled({ timeout: 30_000 });
    await confirm.click();

    await page.waitForURL(/booking-confirmation\//, { timeout: 15_000 });
    await expect(page.getByText(/réservation confirmée/i)).toBeVisible();
    await expect(page.getByTestId("result-panel").getByText(NAME)).toBeVisible();
    await expect(page.getByTestId("result-panel").getByText(GUEST_EMAIL)).toBeVisible();
    bookingRef = page.url().split("/booking-confirmation/")[1].split("?")[0];
    expect(bookingRef).toMatch(/^[a-z]+(-[a-z]+)+-\d{4}$/);
    await page.close();
  });

  test("the team finds the booking, with the guest's note, and seats the party", async () => {
    const page = await platform.newPage();
    await page.goto("/admin/bookings");
    await page.getByPlaceholder("Nom, e-mail ou référence…").fill(GUEST_EMAIL);
    await page.getByRole("button", { name: "Rechercher" }).click();

    await page.getByText(GUEST_NAME).first().click();
    await expect(page.getByText("Allergie aux crustacés, merci.")).toBeVisible();
    await page.getByRole("button", { name: "Arrivé" }).click();
    await page.getByRole("button", { name: "Installé" }).click();
    await expect(page.getByText("Installé").first()).toBeVisible();

    const listed = (await (
      await platform.request.get(
        `/api/admin/bookings?restaurantId=${restaurantId}&email=${encodeURIComponent(GUEST_EMAIL)}&status=all`
      )
    ).json()) as { bookingRef: string; status: string }[];
    expect(listed).toHaveLength(1);
    expect(listed[0].bookingRef).toBe(bookingRef);
    expect(listed[0].status).toBe("Seated");
    await page.close();
  });

  test("the restaurateur closes a weekday, and the guest side stops offering it", async () => {
    const open = async (date: string) => {
      const res = await restaurateur.request.get(
        `/api/restaurants/${restaurantId}/availability?date=${date}&seats=2`
      );
      expect(res.ok()).toBeTruthy();
      return ((await res.json()) as { slots: { isAvailable: boolean }[] }).slots.filter(
        (slot) => slot.isAvailable
      );
    };
    expect((await open(closedDate)).length).toBeGreaterThan(0);

    const page = await restaurateur.newPage();
    await page.goto("/onboarding");
    await page.getByTestId("stepper-hours").click();
    await expect(page.getByTestId("step-hours")).toBeVisible();
    await page.getByRole("switch", { name: `${weekdayOf(closedDate)} : ouvert` }).click();
    await expect(page.getByText("Fermé").first()).toBeVisible();
    await page.getByTestId("step-hours-continue").click();
    await expect(page.getByTestId("step-layout")).toBeVisible();
    await page.close();

    expect(await open(closedDate)).toEqual([]);
    expect((await open(bookingDate)).length).toBeGreaterThan(0);
  });
});
