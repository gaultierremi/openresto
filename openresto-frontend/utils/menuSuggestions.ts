import type { DishLanguage } from "@/api/menus";

const PHRASES: readonly [string, string, string][] = [
  ["Entrées", "Voorgerechten", "Starters"],
  ["Plats", "Hoofdgerechten", "Main courses"],
  ["Desserts", "Desserts", "Desserts"],
  ["Soupe du jour", "Soep van de dag", "Soup of the day"],
  ["Salade de saison", "Seizoenssalade", "Seasonal salad"],
  ["Salade verte", "Groene salade", "Green salad"],
  ["Croquettes aux crevettes", "Garnaalkroketten", "Shrimp croquettes"],
  ["Croquettes au fromage", "Kaaskroketten", "Cheese croquettes"],
  ["Carbonnade flamande", "Vlaamse stoverij", "Flemish beef stew"],
  ["Moules-frites", "Mosselen met friet", "Mussels and fries"],
  ["Steak-frites", "Steak met friet", "Steak and fries"],
  ["Poulet rôti", "Gebraden kip", "Roast chicken"],
  ["Poisson du jour", "Vis van de dag", "Fish of the day"],
  ["Risotto aux champignons", "Paddenstoelenrisotto", "Mushroom risotto"],
  ["Pâtes aux légumes", "Pasta met groenten", "Vegetable pasta"],
  ["Frites", "Frieten", "Fries"],
  ["Légumes de saison", "Seizoensgroenten", "Seasonal vegetables"],
  ["Mousse au chocolat", "Chocolademousse", "Chocolate mousse"],
  ["Gaufre de Bruxelles", "Brusselse wafel", "Brussels waffle"],
  ["Dame blanche", "Dame blanche", "Vanilla ice cream with chocolate sauce"],
  ["Crème brûlée", "Crème brûlée", "Crème brûlée"],
  ["Tarte aux pommes", "Appeltaart", "Apple tart"],
  ["Glace vanille", "Vanille-ijs", "Vanilla ice cream"],
  ["Café", "Koffie", "Coffee"],
  ["Thé", "Thee", "Tea"],
  ["Eau plate", "Plat water", "Still water"],
  ["Eau pétillante", "Bruiswater", "Sparkling water"],
  ["Servi avec des frites", "Geserveerd met frieten", "Served with fries"],
  ["Servi avec une salade", "Geserveerd met een salade", "Served with a salad"],
  ["Préparé sur place", "Huisbereid", "Homemade"],
];
const COLUMN: Record<DishLanguage, number> = { fr: 0, nl: 1, en: 2 };
const normalized = (text: string) => text.trim().normalize("NFC").toLocaleLowerCase("fr");

/** @see [menuSuggestions.test.ts](../tests/utils/menuSuggestions.test.ts) — unknown phrases are never invented. */
export function suggestMenuText(text: string, from: DishLanguage, to: DishLanguage): string | null {
  if (!text.trim()) return null;
  if (from === to) return text.trim();
  return (
    PHRASES.find((row) => normalized(row[COLUMN[from]]) === normalized(text))?.[COLUMN[to]] ?? null
  );
}
