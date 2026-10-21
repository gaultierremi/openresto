import en from "@/locales/en.json";
import fr from "@/locales/fr.json";
import i18n from "@/i18n";

/**
 * The refusals the server can send during onboarding, by `ErrorCodes`. Each one has to reach a
 * restaurateur in French (the language of the platform's restaurants) and in English; a code
 * with no entry falls back to the server's English sentence, which is the bug this pins.
 */
const ONBOARDING_CODES = [
  "consent_required",
  "consent_outdated",
  "suspended",
  "not_publishable",
  "step_unknown",
  "step_required",
  "name_required",
  "address_required",
  "phone_required",
  "email_required",
  "legal_name_required",
  "company_number_required",
  "company_number_invalid",
  "vat_invalid",
  "retention_invalid",
  "layout_empty",
  "layout_invalid",
  "hours_no_open_day",
  "layout_in_use",
  "menu_invalid",
] as const;

type Errors = Record<string, Record<string, string>>;
const errorsOf = (locale: unknown) => (locale as { errors: Errors }).errors;

describe("the onboarding refusals", () => {
  it.each(ONBOARDING_CODES)(
    "%s has an English and a French sentence, and the French is not English",
    (code) => {
      const english = errorsOf(en).onboarding[code];
      const french = errorsOf(fr).onboarding[code];
      expect(english).toBeTruthy();
      expect(french).toBeTruthy();
      expect(french).not.toBe(english);
    }
  );

  it("has no entry the server cannot send", () => {
    expect(Object.keys(errorsOf(en).onboarding).sort()).toEqual([...ONBOARDING_CODES].sort());
  });

  it("is spoken in French to a French viewer, with the server's values in it", async () => {
    await i18n.changeLanguage("fr");
    try {
      expect(i18n.t("errors.onboarding.retention_invalid", { min: 1, max: 60 })).toBe(
        "La durée de conservation doit être comprise entre 1 et 60 mois."
      );
      expect(i18n.t("errors.onboarding.layout_in_use", { bookings: 3 })).toContain("(3)");
    } finally {
      await i18n.changeLanguage("en");
    }
  });

  it("has a French sentence for the colour the branding step can refuse", () => {
    expect(errorsOf(fr).site.color_invalid).toMatch(/#rrggbb/);
    expect(errorsOf(fr).site.color_invalid).not.toBe(errorsOf(en).site.color_invalid);
  });
});
