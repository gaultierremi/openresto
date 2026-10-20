import { MENU_CURRENCY } from "@/constants/onboarding";
import { getActiveLocale } from "@/utils/locale";
import { parsePrice } from "@/utils/menuPrice";

export type DishPrice = { ok: true; priceMinor: number | null } | { ok: false };

/**
 * What a restaurateur typed for a dish, as cents. An empty field is a dish with no price shown
 * ("prix sur demande"), which is a valid answer; anything that is not a non-negative amount with
 * at most two decimals is refused rather than rounded or read as zero.
 *
 * @see [onboardingPrice.test.ts](../tests/utils/onboardingPrice.test.ts) — pins both separators,
 * the empty price, and that a negative, a third decimal and plain text are all refused.
 */
export function parseDishPrice(text: string): DishPrice {
  if (text.trim() === "") return { ok: true, priceMinor: null };
  const priceMinor = parsePrice(text, MENU_CURRENCY);
  return priceMinor === null ? { ok: false } : { ok: true, priceMinor };
}

/** Cents back into the field, with the separator of the active language: `12,50` or `12.50`. */
export function dishPriceText(priceMinor: number | null): string {
  if (priceMinor === null) return "";
  return new Intl.NumberFormat(getActiveLocale(), {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    useGrouping: false,
  }).format(priceMinor / 100);
}
