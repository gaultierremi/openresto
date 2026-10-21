import type { SaveSiteInput, SiteDto } from "@/api/site";
import {
  MAX_SOCIAL_URL_LENGTH,
  SOCIAL_KINDS,
  type SiteTheme,
  type SocialKind,
} from "@/constants/site";
import { isValidSlug } from "@/utils/siteSlug";

/** A social row as typed: the URL may still be empty or half-written. */
export interface SocialRow {
  kind: SocialKind;
  url: string;
}

export interface SiteForm {
  slug: string;
  theme: SiteTheme;
  tagline: string;
  socials: SocialRow[];
  legalName: string;
  companyNumber: string;
  vatNumber: string;
  legalAddress: string;
}

/** Why the form cannot be saved right now; the card turns each into a sentence. */
export type SiteFormProblem =
  "slug" | "socialUrl" | "socialDuplicate" | "identifier" | "legalRequired";

const IDENTIFIER_PATTERN = /^[A-Za-z0-9 .\-/]*$/;

/** A payload back into the form's fields: what an undo puts into the inputs. */
export const formFromInput = (input: SaveSiteInput): SiteForm => ({
  slug: input.slug,
  theme: input.theme,
  tagline: input.tagline ?? "",
  socials: input.socialLinks.map(({ kind, url }) => ({ kind, url })),
  legalName: input.legal.name ?? "",
  companyNumber: input.legal.companyNumber ?? "",
  vatNumber: input.legal.vatNumber ?? "",
  legalAddress: input.legal.address ?? "",
});

export const formFromSite = (site: SiteDto): SiteForm =>
  formFromInput({
    slug: site.slug,
    theme: site.theme,
    tagline: site.tagline,
    socialLinks: site.socialLinks,
    legal: site.legal,
  });

const orNull = (text: string) => text.trim() || null;

const socialOrder = (kind: SocialKind) => SOCIAL_KINDS.indexOf(kind);

/**
 * The payload as the server will hold it back: trimmed, blanks as null, and the links in the
 * server's own order with the not-yet-filled rows left out. Matching the server's shape is what
 * lets autosave compare it with `inputFromSite` and see no difference after a round trip.
 */
export function inputFromForm(form: SiteForm): SaveSiteInput {
  return {
    slug: form.slug.trim(),
    theme: form.theme,
    tagline: orNull(form.tagline),
    socialLinks: form.socials
      .map(({ kind, url }) => ({ kind, url: url.trim() }))
      .filter(({ url }) => url !== "")
      .sort((a, b) => socialOrder(a.kind) - socialOrder(b.kind)),
    legal: {
      name: orNull(form.legalName),
      companyNumber: orNull(form.companyNumber),
      vatNumber: orNull(form.vatNumber),
      address: orNull(form.legalAddress),
    },
  };
}

export const inputFromSite = (site: SiteDto): SaveSiteInput => inputFromForm(formFromSite(site));

const HTTPS_URL_PATTERN = /^https:\/\/[^\s/?#]+\S*$/i;

export const isValidSocialUrl = (url: string): boolean =>
  url.length <= MAX_SOCIAL_URL_LENGTH && HTTPS_URL_PATTERN.test(url);

/**
 * The first reason the server would refuse this form, in the order the card lists its fields.
 * A live site must keep the legal name and company number it was published with, so emptying
 * either is held back here rather than saved and bounced.
 *
 * @see [siteForm.test.ts](../tests/utils/siteForm.test.ts) — pins each reason on both sides of
 * its boundary, including the legal identity of a draft versus a live site.
 */
export function siteFormProblem(form: SiteForm, published: boolean): SiteFormProblem | null {
  if (!isValidSlug(form.slug.trim())) return "slug";

  const filled = form.socials.filter(({ url }) => url.trim() !== "");
  if (filled.some(({ url }) => !isValidSocialUrl(url.trim()))) return "socialUrl";
  if (new Set(form.socials.map(({ kind }) => kind)).size !== form.socials.length) {
    return "socialDuplicate";
  }

  if (![form.companyNumber, form.vatNumber].every((value) => IDENTIFIER_PATTERN.test(value))) {
    return "identifier";
  }

  if (published && (!form.legalName.trim() || !form.companyNumber.trim())) return "legalRequired";
  return null;
}

/** The first network not yet in the list, for the "add a network" row to start from. */
export function nextFreeKind(socials: readonly SocialRow[]): SocialKind | null {
  const taken = new Set(socials.map(({ kind }) => kind));
  return SOCIAL_KINDS.find((kind) => !taken.has(kind)) ?? null;
}
