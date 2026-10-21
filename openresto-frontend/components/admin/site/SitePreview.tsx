import type { SiteTheme } from "@/constants/site";

export interface SitePreviewProps {
  restaurantId: number;
  /** The look to show, which may not be saved yet. */
  theme: SiteTheme;
  /** Changes whenever the saved site does, which is what makes the preview load again. */
  version: string | null;
}

/**
 * The page as a guest would see it. Off web it shows nothing: the admin is a web surface and a
 * native build redirects away from it. The web build is `SitePreview.web.tsx`.
 */
export function SitePreview(_props: SitePreviewProps) {
  return null;
}

export default SitePreview;
