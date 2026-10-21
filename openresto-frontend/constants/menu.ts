/**
 * Mirrors the backend's menu enums and field caps (`Menu.cs`, `MenuFields.cs`). The API speaks
 * enum names rather than bit values, so the lists below are the whole contract: a name added
 * server-side has to be added here before the editor can offer it.
 */

/** The fourteen allergens EU Regulation 1169/2011 (Annex II) requires a menu to declare. */
export const ALLERGENS = [
  "Gluten",
  "Crustaceans",
  "Eggs",
  "Fish",
  "Peanuts",
  "Soybeans",
  "Milk",
  "Nuts",
  "Celery",
  "Mustard",
  "Sesame",
  "Sulphites",
  "Lupin",
  "Molluscs",
] as const;

export type Allergen = (typeof ALLERGENS)[number];

export const DIETARY_TAGS = ["Vegetarian", "Vegan", "GlutenFree"] as const;

export type DietaryTag = (typeof DIETARY_TAGS)[number];

export const AVAILABILITIES = ["Available", "SoldOut", "Hidden"] as const;

export type Availability = (typeof AVAILABILITIES)[number];

export const MAX_NAME_LENGTH = 80;
export const MAX_DESCRIPTION_LENGTH = 500;

/** One million in major units, the server's ceiling on a price in minor units. */
export const MAX_PRICE_MINOR = 100_000_000;

export const DEFAULT_CURRENCY = "EUR";

/** The currencies the editor offers; the server accepts any active ISO 4217 code. */
export const COMMON_CURRENCIES = ["EUR", "USD", "GBP", "CHF", "CAD"] as const;

/** Dish photos: same types and ceiling as the API's upload endpoint. */
export const PHOTO_MAX_BYTES = 2 * 1024 * 1024;
export const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
