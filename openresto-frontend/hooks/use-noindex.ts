import { useEffect } from "react";
import { Platform } from "react-native";

/**
 * Asks search engines to leave the mounted route out of their index, on web. A QR code's address
 * is a capability the restaurant hands to guests, not a page to be found by searching, so the
 * public menu says so in its own head rather than in a site-wide robots file that would also
 * cover the pages that do want to be found.
 *
 * @see [use-noindex.test.tsx](../tests/hooks/use-noindex.test.tsx) — pins that the tag is added
 * on web, left off elsewhere, and removed again on unmount.
 */
export function useNoIndex(): void {
  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") return;
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex";
    document.head.appendChild(meta);
    return () => {
      meta.remove();
    };
  }, []);
}
