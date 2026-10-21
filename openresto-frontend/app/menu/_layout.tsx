import { Slot } from "expo-router";
import { useNoIndex } from "@/hooks/use-noindex";

/**
 * The public menu, outside `(user)` on purpose: a guest who scanned a QR code wants the dishes,
 * not the site's navbar, tab bar and keyboard shortcuts around them. The page carries its own
 * language picker and a booking button into the guest surface.
 *
 * @see [menu-layout.test.tsx](../../tests/app/menu-layout.test.tsx) — pins that the routes
 * under it are kept out of search indexes.
 */
export default function MenuLayout() {
  useNoIndex();
  return <Slot />;
}
