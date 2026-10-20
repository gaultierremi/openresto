/**
 * @jest-environment jsdom
 */
import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import OnboardingSitePreviewDefault, {
  OnboardingSitePreview,
} from "@/components/onboarding/OnboardingSitePreview.web";
import { fetchSitePreview } from "@/api/onboarding";
import { PHONE_WIDTH } from "@/components/onboarding/OnboardingSitePreview.styles";
import { ok, refused } from "@/tests/helpers/onboardingFixtures";

jest.setTimeout(20_000);

jest.mock("@/context/BrandContext", () => ({
  useBrand: () => ({ appName: "Open Resto", primaryColor: "#0a7ea4" }),
}));
jest.mock("@/utils/haptics", () => ({
  haptics: { selection: jest.fn(), press: jest.fn(), outcome: jest.fn() },
}));
jest.mock("@/api/onboarding", () => ({ fetchSitePreview: jest.fn() }));

const fetchPreview = fetchSitePreview as jest.Mock;

type Props = React.ComponentProps<typeof OnboardingSitePreview>;

const frame = () => screen.UNSAFE_getByType("iframe" as never);

const renderPreview = async (props: Partial<Props> = {}) => {
  const all: Props = { restaurantId: 7, version: "v1", ...props };
  const view = render(<OnboardingSitePreview {...all} />);
  await act(async () => {});
  return {
    rerender: async (next: Partial<Props>) => {
      view.rerender(<OnboardingSitePreview {...all} {...next} />);
      await act(async () => {});
    },
  };
};

beforeEach(() => {
  jest.clearAllMocks();
  fetchPreview.mockResolvedValue(ok("<html>page</html>"));
});

describe("OnboardingSitePreview (web)", () => {
  it("says it is loading until the page arrives", () => {
    fetchPreview.mockReturnValue(new Promise(() => {}));
    render(<OnboardingSitePreview restaurantId={7} version={null} />);
    expect(screen.getByText("Loading the website preview…")).toBeTruthy();
    expect(screen.UNSAFE_queryByType("iframe" as never)).toBeNull();
  });

  it("puts the server's HTML in a frame with no script permission, titled for a screen reader", async () => {
    await renderPreview();

    expect(fetchPreview).toHaveBeenCalledWith(7);
    expect(frame().props.srcDoc).toBe("<html>page</html>");
    expect(frame().props.sandbox).toBe("");
    expect(frame().props.title).toBe("Website preview");
  });

  it("asks again when the version changes, and not when nothing did", async () => {
    const { rerender } = await renderPreview();
    await rerender({ version: "v1" });
    expect(fetchPreview).toHaveBeenCalledTimes(1);

    await rerender({ version: "v2" });
    expect(fetchPreview).toHaveBeenCalledTimes(2);
  });

  it("asks again for another restaurant", async () => {
    const { rerender } = await renderPreview();
    await rerender({ restaurantId: 8 });
    expect(fetchPreview).toHaveBeenLastCalledWith(8);
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
    const view = render(<OnboardingSitePreview restaurantId={7} version="v1" />);
    fetchPreview.mockResolvedValue(ok("<html>second</html>"));
    view.rerender(<OnboardingSitePreview restaurantId={7} version="v2" />);
    await act(async () => {});

    await act(async () => resolveFirst(ok("<html>first</html>")));

    expect(frame().props.srcDoc).toBe("<html>second</html>");
  });

  it("says so when the preview cannot be loaded, and shows nothing else", async () => {
    fetchPreview.mockResolvedValue(refused("Network error.", 0));
    await renderPreview();
    expect(screen.getByRole("alert")).toHaveTextContent("The website preview could not be loaded.");
    expect(screen.queryByText("Loading the website preview…")).toBeNull();
    expect(screen.UNSAFE_queryByType("iframe" as never)).toBeNull();
  });

  it("keeps the old page and says so when a reload fails, then clears the message on success", async () => {
    const { rerender } = await renderPreview();
    fetchPreview.mockResolvedValue(refused("Network error.", 0));
    await rerender({ version: "v2" });
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(frame().props.srcDoc).toBe("<html>page</html>");

    fetchPreview.mockResolvedValue(ok("<html>again</html>"));
    await rerender({ version: "v3" });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(frame().props.srcDoc).toBe("<html>again</html>");
  });

  it("starts at phone width and switches to the full width and back", async () => {
    await renderPreview();
    expect(frame().props.style.width).toBe(PHONE_WIDTH);

    fireEvent.press(screen.getByTestId("onboarding-site-preview-desktop"));
    expect(frame().props.style.width).toBe("100%");

    fireEvent.press(screen.getByTestId("onboarding-site-preview-phone"));
    expect(frame().props.style.width).toBe(PHONE_WIDTH);
  });

  it("is also the module's default export", () => {
    expect(OnboardingSitePreviewDefault).toBe(OnboardingSitePreview);
  });
});
