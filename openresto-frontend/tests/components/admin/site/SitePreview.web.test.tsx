/**
 * @jest-environment jsdom
 */
import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import SitePreviewDefault, { SitePreview } from "@/components/admin/site/SitePreview.web";
import * as siteApi from "@/api/site";
import { PHONE_WIDTH } from "@/components/admin/site/SitePreview.styles";
import { ok, refused } from "@/tests/helpers/siteFixtures";

jest.setTimeout(20_000);

jest.mock("@/context/BrandContext", () => ({
  useBrand: () => ({ appName: "Open Resto", primaryColor: "#0a7ea4" }),
}));
jest.mock("@/utils/haptics", () => ({
  haptics: { selection: jest.fn(), press: jest.fn(), outcome: jest.fn() },
}));
jest.mock("@/api/site", () => ({
  ...jest.requireActual("@/api/site"),
  adminFetchSitePreview: jest.fn(),
}));

const fetchPreview = siteApi.adminFetchSitePreview as jest.Mock;

type Props = React.ComponentProps<typeof SitePreview>;

const frame = () => screen.UNSAFE_getByType("iframe" as never);

const renderPreview = async (props: Partial<Props> = {}) => {
  const all: Props = { restaurantId: 7, theme: "Brasserie", version: "v1", ...props };
  const view = render(<SitePreview {...all} />);
  await act(async () => {});
  return {
    rerender: async (next: Partial<Props>) => {
      view.rerender(<SitePreview {...all} {...next} />);
      await act(async () => {});
    },
  };
};

beforeEach(() => {
  jest.clearAllMocks();
  fetchPreview.mockResolvedValue(ok("<html>page</html>"));
});

describe("SitePreview (web)", () => {
  it("says it is loading until the page arrives", () => {
    fetchPreview.mockReturnValue(new Promise(() => {}));
    render(<SitePreview restaurantId={7} theme="Brasserie" version={null} />);
    expect(screen.getByText("Loading the preview…")).toBeTruthy();
    expect(screen.UNSAFE_queryByType("iframe" as never)).toBeNull();
  });

  it("puts the server's HTML in a frame with no script permission, titled for a screen reader", async () => {
    await renderPreview();

    expect(fetchPreview).toHaveBeenCalledWith(7, "Brasserie");
    expect(frame().props.srcDoc).toBe("<html>page</html>");
    expect(frame().props.sandbox).toBe("");
    expect(frame().props.title).toBe("Website preview");
  });

  it("asks again for another theme, without waiting for it to be saved", async () => {
    const { rerender } = await renderPreview();
    fetchPreview.mockResolvedValue(ok("<html>dark</html>"));

    await rerender({ theme: "Gastronomique" });

    expect(fetchPreview).toHaveBeenLastCalledWith(7, "Gastronomique");
    expect(frame().props.srcDoc).toBe("<html>dark</html>");
  });

  it("asks again when the saved site changes, and not when nothing did", async () => {
    const { rerender } = await renderPreview();
    await rerender({ version: "v1" });
    expect(fetchPreview).toHaveBeenCalledTimes(1);

    await rerender({ version: "v2" });
    expect(fetchPreview).toHaveBeenCalledTimes(2);
  });

  it("asks again for another location", async () => {
    const { rerender } = await renderPreview();
    await rerender({ restaurantId: 8 });
    expect(fetchPreview).toHaveBeenLastCalledWith(8, "Brasserie");
  });

  it("keeps the page up while the next one loads", async () => {
    const { rerender } = await renderPreview();
    fetchPreview.mockReturnValue(new Promise(() => {}));
    await rerender({ version: "v2" });
    expect(frame().props.srcDoc).toBe("<html>page</html>");
  });

  it("ignores an answer that arrives after the preview moved on", async () => {
    let resolveFirst: (value: unknown) => void = () => {};
    fetchPreview.mockReturnValueOnce(new Promise((resolve) => (resolveFirst = resolve)));
    const view = render(<SitePreview restaurantId={7} theme="Brasserie" version="v1" />);
    fetchPreview.mockResolvedValue(ok("<html>second</html>"));
    view.rerender(<SitePreview restaurantId={7} theme="Brasserie" version="v2" />);
    await act(async () => {});

    await act(async () => resolveFirst(ok("<html>first</html>")));

    expect(frame().props.srcDoc).toBe("<html>second</html>");
  });

  it("says so when the preview cannot be loaded, and shows nothing else", async () => {
    fetchPreview.mockResolvedValue(refused("Network error."));
    await renderPreview();
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn’t load the preview.");
    expect(screen.queryByText("Loading the preview…")).toBeNull();
    expect(screen.UNSAFE_queryByType("iframe" as never)).toBeNull();
  });

  it("clears the message once a later load succeeds, keeping the page", async () => {
    fetchPreview.mockResolvedValueOnce(refused("Network error."));
    const { rerender } = await renderPreview();
    await rerender({ version: "v2" });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(frame().props.srcDoc).toBe("<html>page</html>");
  });

  it("keeps the old page and says so when a reload fails", async () => {
    const { rerender } = await renderPreview();
    fetchPreview.mockResolvedValue(refused("Network error."));
    await rerender({ version: "v2" });
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(frame().props.srcDoc).toBe("<html>page</html>");
  });

  it("starts at phone width and switches to the full width and back", async () => {
    await renderPreview();
    expect(frame().props.style.width).toBe(PHONE_WIDTH);

    fireEvent.press(screen.getByTestId("site-preview-desktop"));
    expect(frame().props.style.width).toBe("100%");

    fireEvent.press(screen.getByTestId("site-preview-phone"));
    expect(frame().props.style.width).toBe(PHONE_WIDTH);
  });

  it("is also the module's default export", () => {
    expect(SitePreviewDefault).toBe(SitePreview);
  });
});
