import { getActiveLocale } from "@/utils/locale";
import { MAX_PRICE_MINOR } from "@/constants/menu";

const FALLBACK_DIGITS = 2;

/**
 * How many decimals the currency's minor unit has: 2 for EUR, 0 for JPY, 3 for KWD. Read from
 * `Intl` so the list cannot drift from the platform's; an unknown code falls back to cents.
 */
export function currencyDigits(currency: string): number {
  try {
    const { maximumFractionDigits } = new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
    }).resolvedOptions();
    /* istanbul ignore next -- a currency-style formatter always reports its digits; the type is wider */
    return maximumFractionDigits ?? FALLBACK_DIGITS;
  } catch {
    return FALLBACK_DIGITS;
  }
}

/** A price for display, in the viewer's language: `12,50 €` in French, `€12.50` in English. */
export function formatPrice(minor: number, currency: string): string {
  const digits = currencyDigits(currency);
  const amount = minor / 10 ** digits;
  try {
    return new Intl.NumberFormat(getActiveLocale(), { style: "currency", currency }).format(amount);
  } catch {
    return `${amount.toFixed(digits)} ${currency}`;
  }
}

/**
 * What an admin typed, as minor units, or null when it is not a price. Accepts a comma or a
 * dot as the separator (a French keyboard offers the comma) and no more decimals than the
 * currency has, since silently rounding a typed `12.505` would save a price nobody entered.
 *
 * @see [menuPrice.test.ts](../tests/utils/menuPrice.test.ts) — pins both separators, the
 * decimal cap per currency and the server's ceiling, on both sides of each boundary.
 */
export function parsePrice(text: string, currency: string): number | null {
  const digits = currencyDigits(currency);
  const cleaned = text.trim().replace(/\s/g, "").replace(",", ".");
  const pattern = digits === 0 ? /^\d+$/ : new RegExp(`^\\d+(\\.\\d{0,${digits}})?$`);
  if (!pattern.test(cleaned)) return null;

  const [whole, fraction = ""] = cleaned.split(".");
  const minor = Number(whole) * 10 ** digits + Number(fraction.padEnd(digits, "0") || 0);
  return minor <= MAX_PRICE_MINOR ? minor : null;
}

/** A stored price back into the text field: `12.50`, with no currency symbol or grouping. */
export function priceToInput(minor: number, currency: string): string {
  const digits = currencyDigits(currency);
  return (minor / 10 ** digits).toFixed(digits);
}
