import type { TFunction } from "i18next";
import { SITE_IMAGE_MAX_BYTES, SITE_IMAGE_TYPES } from "@/constants/site";
import { pickFile } from "@/utils/pickFile";

export type SiteImageRefusal = "type" | "size";

/**
 * Why the server would turn this file away before it ever decodes it, so the refusal is
 * immediate instead of after a 6 MB upload. The server re-checks both, and the file's own bytes.
 *
 * @see [siteImage.test.ts](../tests/utils/siteImage.test.ts) — pins the three accepted types, a
 * file exactly at the cap and one byte over it.
 */
export function refuseSiteImage(file: { type: string; size: number }): SiteImageRefusal | null {
  if (!(SITE_IMAGE_TYPES as readonly string[]).includes(file.type)) return "type";
  return file.size > SITE_IMAGE_MAX_BYTES ? "size" : null;
}

export const siteImageRefusalMessage = (refusal: SiteImageRefusal, t: TFunction): string =>
  refusal === "type" ? t("errors.media.unsupported_image_type") : t("errors.site.image_too_large");

export type PickedSiteImage =
  { file: File; refusal: null } | { file: null; refusal: SiteImageRefusal } | null;

/** Opens the chooser; null when it was dismissed. */
export async function pickSiteImage(): Promise<PickedSiteImage> {
  const file = await pickFile(SITE_IMAGE_TYPES.join(","));
  if (!file) return null;
  const refusal = refuseSiteImage(file);
  return refusal ? { file: null, refusal } : { file, refusal: null };
}
