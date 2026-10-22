import en from "@/locales/en.json";
import fr from "@/locales/fr.json";
import es from "@/locales/es.json";
import de from "@/locales/de.json";
import nl from "@/locales/nl.json";
import { SUPPORTED_LOCALES } from "@/constants/locales";

type Json = { [key: string]: Json | string };

/**
 * Flattens a nested locale object into its leaf key paths ("restaurant.home.heroSubtitle"),
 * so two locale files can be compared by the *shape* of their keys regardless of the
 * (untranslated) string each leaf holds.
 */
function leafKeyPaths(node: Json, prefix = ""): string[] {
  return Object.keys(node)
    .sort()
    .flatMap((key) => {
      const value = node[key];
      const path = prefix ? `${prefix}.${key}` : key;
      return typeof value === "string" ? [path] : leafKeyPaths(value, path);
    });
}

/**
 * The interpolation variables a string references, e.g. "{{count}} of {{max}}" -> ["count", "max"].
 * i18next allows a format suffix ("{{count, number}}"), so only the name before the comma counts.
 */
function placeholders(value: string): string[] {
  return [...value.matchAll(/\{\{\s*([^}]+?)\s*\}\}/g)]
    .map((match) => match[1].split(",")[0].trim())
    .sort();
}

function leafEntries(node: Json, prefix = ""): [string, string][] {
  return Object.keys(node).flatMap((key): [string, string][] => {
    const value = node[key];
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof value === "string" ? [[path, value]] : leafEntries(value, path);
  });
}

const LOCALE_FILES: Record<string, Json> = { en, fr, es, de, nl };

/**
 * Locales that deliberately cover the guest surface only, mapped to the top-level segments
 * they leave out. Dutch is guest-facing only; the admin area has no Dutch, and `i18n/index.ts`
 * sends a Dutch viewer who reaches an admin key to French. Every other locale keeps exact
 * parity with en.json, so a missing key anywhere else still fails.
 */
const DUTCH_RESTAURATEUR_KEYS = [
  "admin.onboarding.",
  "admin.settings.weekdays.",
  "admin.site.themes.",
  "admin.menus.item.allergensHint",
  "admin.menus.item.allergensLabel",
  "admin.menus.item.dietaryLabel",
];
const GUEST_ONLY_LOCALES: Record<string, string[]> = { nl: ["admin"] };

function isOmitted(locale: string, path: string): boolean {
  return (
    (GUEST_ONLY_LOCALES[locale] ?? []).includes(path.split(".")[0]) &&
    !DUTCH_RESTAURATEUR_KEYS.some((prefix) => path.startsWith(prefix))
  );
}

const NON_ENGLISH = SUPPORTED_LOCALES.filter((locale) => locale !== "en");

describe("i18n locale key parity", () => {
  it("ships a locale file for every entry in SUPPORTED_LOCALES", () => {
    expect(Object.keys(LOCALE_FILES).sort()).toEqual([...SUPPORTED_LOCALES].sort());
  });

  const englishKeys = leafKeyPaths(en);

  it("en.json has at least one key (sanity check the fixture isn't empty)", () => {
    expect(englishKeys.length).toBeGreaterThan(0);
  });

  it("lets Dutch omit platform admin keys while covering the restaurateur space", () => {
    expect(GUEST_ONLY_LOCALES).toEqual({ nl: ["admin"] });
    expect(nl.admin.onboarding).toBeDefined();
    for (const locale of NON_ENGLISH.filter((l) => l !== "nl")) {
      expect(Object.keys(LOCALE_FILES[locale])).toContain("admin");
    }
  });

  it.each(NON_ENGLISH)(
    "%s.json has the same leaf key paths as en.json, less the segments it leaves out",
    (locale) => {
      const expected = englishKeys.filter((path) => !isOmitted(locale, path));
      expect(leafKeyPaths(LOCALE_FILES[locale])).toEqual(expected);
    }
  );

  it("nl.json translates every guest key en.json has and adds none of its own", () => {
    const guestKeys = englishKeys.filter((path) => !path.startsWith("admin."));
    expect(leafKeyPaths(nl).filter((path) => !path.startsWith("admin."))).toEqual(guestKeys);
  });

  /**
   * A placeholder a translation invents is never anything but a bug: nothing supplies it, so
   * i18next renders the braces literally and the viewer reads "{{naem}}". Key parity cannot
   * see this — the key is present and the value is a plausible sentence.
   */
  it.each(NON_ENGLISH)(
    "%s.json references no interpolation variable en.json does not supply",
    (locale) => {
      const english = new Map(leafEntries(en));
      const unknown = leafEntries(LOCALE_FILES[locale])
        .map(([path, value]) => ({
          path,
          extra: placeholders(value).filter(
            (name) => !placeholders(english.get(path) ?? "").includes(name)
          ),
        }))
        .filter(({ extra }) => extra.length > 0);

      expect(unknown).toEqual([]);
    }
  );

  /**
   * The mirror case: a dropped placeholder silently loses the value from the sentence. The one
   * principled exception is `count` on a singular variant — "the following booking" is idiomatic
   * where "the following 1 booking" is not, in every language whose `_one` form means exactly one.
   */
  it.each(NON_ENGLISH)("%s.json keeps every interpolation variable en.json supplies", (locale) => {
    const translated = new Map(leafEntries(LOCALE_FILES[locale]));
    const dropped = leafEntries(en)
      .filter(([path]) => !isOmitted(locale, path))
      .map(([path, value]) => ({
        path,
        missing: placeholders(value).filter(
          (name) =>
            !placeholders(translated.get(path) ?? "").includes(name) &&
            !(name === "count" && path.endsWith("_one"))
        ),
      }))
      .filter(({ missing }) => missing.length > 0);

    expect(dropped).toEqual([]);
  });

  it("only nests keys under the six approved top-level segments", () => {
    const approved = ["common", "booking", "restaurant", "lookup", "admin", "errors"];
    for (const locale of SUPPORTED_LOCALES) {
      for (const topLevelKey of Object.keys(LOCALE_FILES[locale])) {
        expect(approved).toContain(topLevelKey);
      }
    }
  });
});
