import type { SiteDto, SitePhoto } from "@/api/site";

export const photo = (over: Partial<SitePhoto> = {}): SitePhoto => ({
  id: "photo-a",
  url: "/media/site-photo-a.jpg",
  alt: "La salle",
  width: 1200,
  height: 800,
  ...over,
});

export const site = (over: Partial<SiteDto> = {}): SiteDto => ({
  exists: true,
  slug: "brasserie-test",
  publicPath: "/r/brasserie-test",
  isPublished: false,
  theme: "Brasserie",
  tagline: "Cuisine belge",
  logoUrl: null,
  coverUrl: null,
  photos: [],
  socialLinks: [],
  legal: { name: "Senne SRL", companyNumber: "0123.456.789", vatNumber: null, address: null },
  brandColor: "#b45309",
  missing: [],
  updatedAt: "2026-10-20T12:00:00Z",
  ...over,
});

export const ok = <T,>(value: T) => ({ ok: true as const, value });
export const refused = (message: string) => ({ ok: false as const, message });

/** A file as the chooser hands it over. */
export const pickedFile = (over: Partial<{ type: string; size: number; name: string }> = {}) =>
  ({ type: "image/jpeg", size: 1000, name: "photo.jpg", ...over }) as File;
