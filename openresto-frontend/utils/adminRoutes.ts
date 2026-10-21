/** Below this width the admin shows its "use a larger screen" wall. */
export const ADMIN_MIN_WIDTH = 600;

/**
 * The admin screens built to be used on a phone. The rest of the admin is a desktop and tablet
 * surface (a sidebar, wide tables), so a narrow window gets the wall; these are the exceptions:
 * the sign-in, which a phone has to reach to use anything else, and the service screen, which
 * exists to flip a dish to sold out from the pass in the middle of a rush.
 */
const PHONE_FRIENDLY = ["/admin/login", "/admin/menus/service"];

/** Printed from the browser, so the page carries no navigation around the sheet. */
const PRINT_SHEET = "/admin/qr-codes/print";

export function showsDesktopWall(pathname: string, width: number): boolean {
  return width < ADMIN_MIN_WIDTH && !PHONE_FRIENDLY.includes(pathname);
}

/**
 * Whether a route renders without the admin sidebar: always for the print sheet, and for a
 * phone-friendly screen once the window is too narrow to fit a sidebar beside it.
 *
 * @see [adminRoutes.test.ts](../tests/utils/adminRoutes.test.ts) — pins the wall and the
 * chromeless rule on both sides of the 600px boundary.
 */
export function isChromeless(pathname: string, width: number): boolean {
  return pathname === PRINT_SHEET || (width < ADMIN_MIN_WIDTH && PHONE_FRIENDLY.includes(pathname));
}
