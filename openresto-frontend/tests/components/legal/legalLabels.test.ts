import i18n from "@/i18n";
import { legalDocumentLabel, legalUpdatedOn } from "@/components/legal/legalLabels";

const en = i18n.getFixedT("en");
const fr = i18n.getFixedT("fr");

describe("legalDocumentLabel", () => {
  it("names the four documents, in the viewer's language", () => {
    const keys = ["terms", "privacy", "dpa", "legal-notice"];
    expect(keys.map((k) => legalDocumentLabel(en, k))).toEqual([
      "Terms of use",
      "Privacy policy",
      "Data processing agreement",
      "Legal notice",
    ]);
    expect(keys.map((k) => legalDocumentLabel(fr, k))).toEqual([
      "Conditions d’utilisation",
      "Politique de confidentialité",
      "Accord de sous-traitance",
      "Mentions légales",
    ]);
  });

  it("prints a key it does not know as it came", () => {
    expect(legalDocumentLabel(en, "cookies")).toBe("cookies");
  });
});

describe("legalUpdatedOn", () => {
  it("formats a plain ISO date as a long date", () => {
    expect(legalUpdatedOn("2026-10-20")).toMatch(/2026/);
    expect(legalUpdatedOn("2026-10-20")).toMatch(/20/);
  });

  it("shows something that is not a date as it came", () => {
    expect(legalUpdatedOn("next week")).toBe("next week");
  });
});
