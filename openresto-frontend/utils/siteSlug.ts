export const SLUG_MIN_LENGTH = 3;
export const SLUG_MAX_LENGTH = 60;

const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * What the address field keeps of a keystroke: lower case, and a space as the hyphen it would
 * have to become. Everything else is left for the validity check to name, rather than silently
 * dropped from what the admin typed.
 *
 * @see [siteSlug.test.ts](../tests/utils/siteSlug.test.ts) — pins the case folding and the
 * space-to-hyphen step, and that other characters survive to be reported.
 */
export const typedSlug = (text: string): string => text.toLowerCase().replace(/\s/g, "-");

/**
 * The address segment of a site, as the server's `SiteSlug.IsValid` takes it: lower-case words
 * and digits joined by single hyphens, between {@link SLUG_MIN_LENGTH} and {@link SLUG_MAX_LENGTH}
 * long.
 *
 * @see [siteSlug.test.ts](../tests/utils/siteSlug.test.ts) — pins the shortest and longest
 * slug, one character either side of them, and each shape the server refuses.
 */
export function isValidSlug(slug: string): boolean {
  return (
    slug.length >= SLUG_MIN_LENGTH && slug.length <= SLUG_MAX_LENGTH && SLUG_PATTERN.test(slug)
  );
}
