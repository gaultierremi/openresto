import { menuTranslation } from "@/utils/menuTranslation";

const dish = {
  name: "Soupe",
  description: "Légumes",
  primaryLanguage: "fr",
  translations: {
    nl: { name: "Soep", description: " " },
    en: { name: null, description: "Vegetables" },
  },
};

it.each([
  ["fr", "Soupe", "Légumes"],
  ["nl-BE", "Soep", "Légumes"],
  ["en", "Soupe", "Vegetables"],
  ["de", "Soupe", "Légumes"],
])("resolves %s with independent fallbacks", (language, name, description) => {
  expect(menuTranslation(dish, language)).toEqual({ name, description });
});

it("keeps a legacy dish readable without translation metadata", () => {
  expect(menuTranslation({ name: "Soupe", description: null }, "nl")).toEqual({
    name: "Soupe",
    description: null,
  });
});
