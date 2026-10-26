import { suggestMenuText } from "@/utils/menuSuggestions";

it.each([
  [" Soupe du jour ", "fr", "nl", "Soep van de dag"],
  ["Soep van de dag", "nl", "en", "Soup of the day"],
  ["Soup of the day", "en", "fr", "Soupe du jour"],
  ["Légumes de saison", "fr", "en", "Seasonal vegetables"],
  ["Recette inconnue", "fr", "en", null],
  ["", "fr", "en", null],
  ["Texte original", "fr", "fr", "Texte original"],
] as const)(
  "suggests %s from %s to %s without inventing unknown recipes",
  (text, from, to, expected) => {
    expect(suggestMenuText(text, from, to)).toBe(expected);
  }
);
