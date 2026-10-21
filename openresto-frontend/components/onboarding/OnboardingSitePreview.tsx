export interface OnboardingSitePreviewProps {
  restaurantId: number;
  /** Changes whenever what the page shows may have, which is what makes it load again. */
  version: string | null;
}

/**
 * The restaurant's website as a guest would see it. Off web it shows nothing: the assistant is a
 * web surface and a native build redirects away from it. The web build is
 * `OnboardingSitePreview.web.tsx`.
 */
export function OnboardingSitePreview(_props: OnboardingSitePreviewProps) {
  return null;
}

export default OnboardingSitePreview;
