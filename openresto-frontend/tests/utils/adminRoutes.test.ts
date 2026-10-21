import { ADMIN_MIN_WIDTH, isChromeless, showsDesktopWall } from "@/utils/adminRoutes";

describe("showsDesktopWall", () => {
  it("walls a narrow window off the desktop-only screens", () => {
    expect(showsDesktopWall("/admin/dashboard", ADMIN_MIN_WIDTH - 1)).toBe(true);
    expect(showsDesktopWall("/admin/menus", 390)).toBe(true);
  });

  it("lets the width that fits a sidebar through", () => {
    expect(showsDesktopWall("/admin/dashboard", ADMIN_MIN_WIDTH)).toBe(false);
  });

  it("leaves the sign-in and the service screen reachable on a phone", () => {
    expect(showsDesktopWall("/admin/login", 390)).toBe(false);
    expect(showsDesktopWall("/admin/menus/service", 390)).toBe(false);
  });
});

describe("isChromeless", () => {
  it("drops the sidebar from the service screen on a phone only", () => {
    expect(isChromeless("/admin/menus/service", ADMIN_MIN_WIDTH - 1)).toBe(true);
    expect(isChromeless("/admin/menus/service", ADMIN_MIN_WIDTH)).toBe(false);
  });

  it("always drops it from the print sheet", () => {
    expect(isChromeless("/admin/qr-codes/print", 390)).toBe(true);
    expect(isChromeless("/admin/qr-codes/print", 1440)).toBe(true);
  });

  it("keeps it on every other screen", () => {
    expect(isChromeless("/admin/menus", 390)).toBe(false);
    expect(isChromeless("/admin/qr-codes", 1440)).toBe(false);
  });
});
