import type { DishTranslations } from "@/api/menus";

export function menuTranslation(
  item: {
    name: string;
    description: string | null;
    primaryLanguage?: string;
    translations?: DishTranslations;
  },
  language: string
) {
  const primary = language.split(/[-_]/)[0];
  const translated = item.translations?.[primary as keyof DishTranslations];
  if (primary === item.primaryLanguage) return { name: item.name, description: item.description };
  return {
    name: translated?.name?.trim() || item.name,
    description: translated?.description?.trim() || item.description,
  };
}
