import { buildUrl, del, get, patch, post, put } from "./client";
import { apiErrorMessage } from "@/api/errors";
import type { MissingField, SiteTheme, SocialKind } from "@/constants/site";

// ── Shapes (mirror SiteDto.cs) ───────────────────────────────────────────────

export interface SitePhoto {
  /** A random token: the handle for editing or removing the photo, never shown to guests. */
  id: string;
  url: string;
  alt: string;
  width: number;
  height: number;
}

export interface SiteSocialLink {
  kind: SocialKind;
  url: string;
}

export interface SiteLegal {
  name: string | null;
  companyNumber: string | null;
  vatNumber: string | null;
  address: string | null;
}

export interface SiteDto {
  /** False for a location whose site has never been saved: the rest is what it would start from. */
  exists: boolean;
  slug: string;
  publicPath: string;
  isPublished: boolean;
  theme: SiteTheme;
  tagline: string | null;
  logoUrl: string | null;
  coverUrl: string | null;
  photos: SitePhoto[];
  socialLinks: SiteSocialLink[];
  legal: SiteLegal;
  brandColor: string;
  missing: MissingField[];
  updatedAt: string | null;
}

/** The whole editable text of a site; the server replaces every field with it. */
export interface SaveSiteInput {
  slug: string;
  theme: SiteTheme;
  tagline: string | null;
  socialLinks: SiteSocialLink[];
  legal: SiteLegal;
}

export type SiteResult<T> = { ok: true; value: T } | { ok: false; message: string };

async function request<T>(
  call: () => Promise<Response>,
  read: (res: Response) => Promise<T>
): Promise<SiteResult<T>> {
  try {
    const res = await call();
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return { ok: false, message: apiErrorMessage(body, "Request failed.") };
    }
    return { ok: true, value: await read(res) };
  } catch {
    return { ok: false, message: "Network error." };
  }
}

const json = <T>(res: Response): Promise<T> => res.json() as Promise<T>;
const siteOf = json<SiteDto>;

const base = (restaurantId: number) => `/admin/restaurants/${restaurantId}/site`;

// ── Settings and publication ─────────────────────────────────────────────────

export const adminGetSite = (restaurantId: number) =>
  request(() => get(base(restaurantId)), siteOf);

export const adminSaveSite = (restaurantId: number, input: SaveSiteInput) =>
  request(() => put(base(restaurantId), input), siteOf);

export const adminSetSitePublished = (restaurantId: number, published: boolean) =>
  request(() => post(`${base(restaurantId)}/${published ? "publish" : "unpublish"}`), siteOf);

/**
 * The page as it would render now, as the HTML a guest would get. `theme` previews another look
 * without saving it.
 */
export const adminFetchSitePreview = (restaurantId: number, theme?: SiteTheme) =>
  request(
    () =>
      get(`${base(restaurantId)}/preview${theme ? `?theme=${encodeURIComponent(theme)}` : ""}`, {
        headers: { Accept: "text/html" },
      }),
    (res) => res.text()
  );

// ── Pictures ─────────────────────────────────────────────────────────────────

/**
 * Not through `post`: the client JSON-encodes a body, and a multipart one has to keep the
 * boundary the browser writes into its own Content-Type header.
 */
function upload(path: string, file: File, fields: Record<string, string> = {}) {
  const form = new FormData();
  form.append("file", file);
  Object.entries(fields).forEach(([name, value]) => form.append(name, value));
  return request(
    () => fetch(buildUrl(path), { method: "POST", credentials: "include", body: form }),
    siteOf
  );
}

export type SiteImageSlot = "logo" | "cover";

export const adminUploadSiteImage = (restaurantId: number, slot: SiteImageSlot, file: File) =>
  upload(`${base(restaurantId)}/${slot}`, file);

export const adminDeleteSiteImage = (restaurantId: number, slot: SiteImageSlot) =>
  request(() => del(`${base(restaurantId)}/${slot}`), siteOf);

export const adminAddSitePhoto = (restaurantId: number, file: File, alt: string) =>
  upload(`${base(restaurantId)}/photos`, file, { alt });

export const adminUpdateSitePhotoAlt = (restaurantId: number, photoId: string, alt: string) =>
  request(
    () => put(`${base(restaurantId)}/photos/${encodeURIComponent(photoId)}`, { alt }),
    siteOf
  );

export const adminReorderSitePhotos = (restaurantId: number, ids: string[]) =>
  request(() => patch(`${base(restaurantId)}/photos/reorder`, { ids }), siteOf);

export const adminDeleteSitePhoto = (restaurantId: number, photoId: string) =>
  request(() => del(`${base(restaurantId)}/photos/${encodeURIComponent(photoId)}`), siteOf);
