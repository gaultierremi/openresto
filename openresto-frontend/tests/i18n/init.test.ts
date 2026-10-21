import i18n from "@/i18n";
import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from "@/constants/locales";

describe("i18n/index", () => {
  afterEach(async () => {
    await i18n.changeLanguage(DEFAULT_LOCALE);
  });

  it("initializes with every supported locale bundled as a resource", () => {
    for (const locale of SUPPORTED_LOCALES) {
      expect(i18n.hasResourceBundle(locale, "translation")).toBe(true);
    }
  });

  it("falls back to DEFAULT_LOCALE", () => {
    expect(i18n.options.fallbackLng).toMatchObject({ default: [DEFAULT_LOCALE] });
  });

  it("falls back from Dutch to French, then English", () => {
    expect(i18n.options.fallbackLng).toMatchObject({ nl: ["fr", "en"] });
  });

  it("does not escape interpolated values (React/RN already escapes on render)", () => {
    expect(i18n.options.interpolation?.escapeValue).toBe(false);
  });

  it("resolves the end-to-end extracted key on the default language", () => {
    expect(i18n.t("restaurant.home.locationsHeading")).toBe("Our locations");
  });

  it("re-renders through the same key in another supported language on changeLanguage", async () => {
    await i18n.changeLanguage("fr");
    expect(i18n.t("restaurant.home.locationsHeading")).toBe("Nos établissements");
  });

  it("serves a guest key in Dutch under nl", async () => {
    await i18n.changeLanguage("nl");
    expect(i18n.t("restaurant.home.locationsHeading")).toBe("Onze vestigingen");
  });

  it("serves an admin key, which nl does not ship, in French under nl", async () => {
    await i18n.changeLanguage("nl");
    expect(i18n.t("admin.activity.title")).toBe("Activité");
  });

  it("serves an admin key in its own language under a locale outside the nl chain", async () => {
    await i18n.changeLanguage("de");
    expect(i18n.t("admin.activity.title")).toBe("Aktivität");
  });

  it("serves English for a key neither nl nor fr has", async () => {
    i18n.addResource("en", "translation", "test.onlyEnglish", "English only");
    await i18n.changeLanguage("nl");
    expect(i18n.t("test.onlyEnglish" as never)).toBe("English only");
  });
});
