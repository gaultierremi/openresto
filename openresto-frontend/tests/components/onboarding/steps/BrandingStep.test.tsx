import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { BrandingStep } from "@/components/onboarding/steps/BrandingStep";
import { deleteLogo, saveBranding, skipStep, uploadLogo } from "@/api/onboarding";
import { pickSiteImage } from "@/utils/siteImage";
import { COLOR_PRESETS } from "@/constants/onboarding";
import { ok, readyState, refused, state } from "@/tests/helpers/onboardingFixtures";
import { stepProps } from "./stepHarness";

jest.mock("@/context/BrandContext", () => ({
  useBrand: () => ({ appName: "Open Resto", primaryColor: "#0a7ea4" }),
}));
jest.mock("@/utils/haptics", () => ({
  haptics: { selection: jest.fn(), press: jest.fn(), outcome: jest.fn() },
}));
jest.mock("@/components/menu/MenuPhoto", () => {
  const { Text } = require("react-native");
  return { MenuPhoto: ({ uri }: { uri: string }) => <Text testID="logo-thumbnail">{uri}</Text> };
});
jest.mock("@/utils/siteImage", () => ({
  ...jest.requireActual("@/utils/siteImage"),
  pickSiteImage: jest.fn(),
}));
jest.mock("@/api/onboarding", () => ({
  saveBranding: jest.fn(),
  skipStep: jest.fn(),
  uploadLogo: jest.fn(),
  deleteLogo: jest.fn(),
}));

const mockSave = saveBranding as jest.Mock;
const mockSkip = skipStep as jest.Mock;
const mockUpload = uploadLogo as jest.Mock;
const mockDelete = deleteLogo as jest.Mock;
const mockPick = pickSiteImage as jest.Mock;

const withSkip = state({
  steps: [
    { key: "branding", state: "Todo", canSkip: true },
    { key: "menu", state: "Todo", canSkip: true },
  ],
});

const press = async (testID = "step-branding-continue") => {
  await act(async () => {
    fireEvent.press(screen.getByTestId(testID));
  });
};

beforeEach(() => jest.clearAllMocks());

describe("BrandingStep", () => {
  it("starts from the saved look, colour and tagline", () => {
    render(
      <BrandingStep
        {...stepProps({
          state: state({
            branding: {
              theme: "Cafe",
              primaryColor: "#166534",
              tagline: "Cuisine belge",
              logoUrl: null,
            },
          }),
        })}
      />
    );
    expect(screen.getByRole("radio", { name: "Café" }).props.accessibilityState.checked).toBe(true);
    expect(screen.getByTestId("branding-color-input").props.value).toBe("#166534");
    expect(screen.getByTestId("branding-tagline-input").props.value).toBe("Cuisine belge");
    expect(screen.getByTestId("branding-swatch-#166534").props.accessibilityState.checked).toBe(
      true
    );
  });

  describe("colour swatches as a radio group", () => {
    // The `aria-*` prop is only visible on the component element, not on the host node that
    // `getByTestId` returns, and it is the prop react-native-web turns into the DOM attribute.
    const ariaChecked = () =>
      COLOR_PRESETS.map((hex) =>
        screen
          .UNSAFE_getAllByProps({ testID: `branding-swatch-${hex}` })
          .map((node) => node.props["aria-checked"])
          .find((value) => value !== undefined)
      );
    const only = (hex: string) => COLOR_PRESETS.map((preset) => preset === hex);

    const renderWith = (primaryColor: string) =>
      render(
        <BrandingStep
          {...stepProps({
            state: state({
              branding: { theme: "Cafe", primaryColor, tagline: null, logoUrl: null },
            }),
          })}
        />
      );

    it("is a labelled radiogroup", () => {
      renderWith("#166534");
      // A bare grouping `View` is not "accessible", which `getByRole` insists on, so find it by prop.
      const group = screen
        .UNSAFE_getAllByProps({ accessibilityRole: "radiogroup" })
        .find((node) => node.props.accessibilityLabel === "Main colour");
      expect(group).toBeDefined();
      expect(group!.findAllByProps({ accessibilityRole: "radio" }).length).toBeGreaterThanOrEqual(
        COLOR_PRESETS.length
      );
    });

    it("announces the saved colour as the one checked radio and every other as unchecked", () => {
      renderWith("#9f1239");
      expect(ariaChecked()).toEqual(only("#9f1239"));
      expect(
        COLOR_PRESETS.map(
          (hex) => screen.getByTestId(`branding-swatch-${hex}`).props.accessibilityState.checked
        )
      ).toEqual(only("#9f1239"));
    });

    it("announces no swatch as checked when the colour is not a preset", () => {
      renderWith("#123456");
      expect(ariaChecked()).toEqual(only("none"));
    });

    it("moves the checked state to the swatch that is picked", () => {
      renderWith("#166534");
      expect(ariaChecked()).toEqual(only("#166534"));
      fireEvent.press(screen.getByTestId("branding-swatch-#1d4ed8"));
      expect(ariaChecked()).toEqual(only("#1d4ed8"));
    });
  });

  it("says in one sentence that the colour paints the website", () => {
    render(<BrandingStep {...stepProps()} />);
    expect(screen.getByText(/The colour you choose paints your restaurant's website/)).toBeTruthy();
  });

  describe("saving", () => {
    it("sends the theme, the colour and the tagline, then moves on with the answer", async () => {
      const saved = readyState();
      mockSave.mockResolvedValue(ok(saved));
      const props = stepProps();
      render(<BrandingStep {...props} />);
      fireEvent.press(screen.getByRole("radio", { name: "Fine dining" }));
      fireEvent.changeText(screen.getByTestId("branding-color-input"), "#b45309");
      fireEvent.changeText(screen.getByTestId("branding-tagline-input"), "  Cuisine belge ");

      await press();

      expect(mockSave).toHaveBeenCalledWith(7, {
        theme: "Gastronomique",
        primaryColor: "#b45309",
        tagline: "Cuisine belge",
      });
      expect(props.onState).toHaveBeenCalledWith(saved);
      expect(props.onAdvance).toHaveBeenCalledTimes(1);
    });

    it("sends an empty colour as empty, which is the platform's colour", async () => {
      mockSave.mockResolvedValue(ok(readyState()));
      render(<BrandingStep {...stepProps()} />);
      await press();
      expect(mockSave.mock.calls[0][1].primaryColor).toBe("");
    });

    it("picks a preset swatch into the colour field", async () => {
      mockSave.mockResolvedValue(ok(readyState()));
      render(<BrandingStep {...stepProps()} />);
      fireEvent.press(screen.getByTestId("branding-swatch-#9f1239"));
      expect(screen.getByTestId("branding-color-input").props.value).toBe("#9f1239");
      await press();
      expect(mockSave.mock.calls[0][1].primaryColor).toBe("#9f1239");
    });

    it("clears the colour back to the platform's", async () => {
      mockSave.mockResolvedValue(ok(readyState()));
      render(
        <BrandingStep
          {...stepProps({
            state: state({
              branding: {
                theme: "Brasserie",
                primaryColor: "#b45309",
                tagline: null,
                logoUrl: null,
              },
            }),
          })}
        />
      );
      fireEvent.press(screen.getByTestId("branding-color-clear"));
      expect(screen.getByTestId("branding-color-input").props.value).toBe("");
      expect(screen.queryByTestId("branding-color-clear")).toBeNull();
      await press();
      expect(mockSave.mock.calls[0][1].primaryColor).toBe("");
    });
  });

  describe("the colour", () => {
    it.each(["b45309", "#b4530", "red", "#12345g"])(
      "refuses %p on the press, sending nothing and not advancing",
      async (typed) => {
        const props = stepProps();
        render(<BrandingStep {...props} />);
        fireEvent.changeText(screen.getByTestId("branding-color-input"), typed);

        await press();

        expect(mockSave).not.toHaveBeenCalled();
        expect(props.onAdvance).not.toHaveBeenCalled();
        expect(screen.getByTestId("branding-color-error")).toHaveTextContent(
          "The colour must be written as #rrggbb, for example #b45309."
        );
      }
    );

    it("takes the message away once the colour is edited or a swatch is picked", async () => {
      render(<BrandingStep {...stepProps()} />);
      fireEvent.changeText(screen.getByTestId("branding-color-input"), "nope");
      await press();
      expect(screen.getByTestId("branding-color-error")).toBeTruthy();

      fireEvent.changeText(screen.getByTestId("branding-color-input"), "#12");
      expect(screen.queryByTestId("branding-color-error")).toBeNull();

      await press();
      expect(screen.getByTestId("branding-color-error")).toBeTruthy();
      fireEvent.press(screen.getByTestId("branding-swatch-#1d4ed8"));
      expect(screen.queryByTestId("branding-color-error")).toBeNull();

      fireEvent.changeText(screen.getByTestId("branding-color-input"), "nope");
      await press();
      fireEvent.press(screen.getByTestId("branding-color-clear"));
      expect(screen.queryByTestId("branding-color-error")).toBeNull();
    });
  });

  describe("a refused save", () => {
    it("shows a colour refusal by the server beside the colour", async () => {
      mockSave.mockResolvedValue(refused("Bad colour.", 400, "site.color_invalid"));
      const props = stepProps();
      render(<BrandingStep {...props} />);
      await press();
      expect(screen.getByTestId("branding-color-error")).toHaveTextContent("Bad colour.");
      expect(screen.queryByTestId("step-branding-banner")).toBeNull();
      expect(props.onAdvance).not.toHaveBeenCalled();
      expect(props.onState).not.toHaveBeenCalled();
    });

    it("shows a tagline refusal beside the tagline", async () => {
      mockSave.mockResolvedValue(refused("Too long.", 400, "site.tagline_too_long"));
      render(<BrandingStep {...stepProps()} />);
      await press();
      expect(screen.getByTestId("branding-tagline-error")).toHaveTextContent("Too long.");
    });

    it("shows any other refusal above the form", async () => {
      mockSave.mockResolvedValue(refused("Suspended.", 409, "onboarding.suspended"));
      render(<BrandingStep {...stepProps()} />);
      await press();
      expect(screen.getByTestId("step-branding-banner")).toHaveTextContent("Suspended.");
    });

    it("ends the session on a 401", async () => {
      mockSave.mockResolvedValue(refused("x", 401));
      const props = stepProps();
      render(<BrandingStep {...props} />);
      await press();
      expect(props.onExpired).toHaveBeenCalledTimes(1);
    });
  });

  describe("the logo", () => {
    const file = { type: "image/png", size: 1000, name: "logo.png" } as File;

    it("shows no thumbnail and no removal when there is no logo", () => {
      render(<BrandingStep {...stepProps()} />);
      expect(screen.getByText("Add a logo")).toBeTruthy();
      expect(screen.queryByTestId("logo-thumbnail")).toBeNull();
      expect(screen.queryByTestId("branding-logo-remove")).toBeNull();
    });

    it("uploads the chosen file and takes the answer in place, without leaving the step", async () => {
      const saved = state({
        branding: {
          theme: "Brasserie",
          primaryColor: null,
          tagline: null,
          logoUrl: "/media/l.png",
        },
      });
      mockPick.mockResolvedValue({ file, refusal: null });
      mockUpload.mockResolvedValue(ok(saved));
      const props = stepProps();
      render(<BrandingStep {...props} />);

      await press("branding-logo-upload");

      expect(mockUpload).toHaveBeenCalledWith(7, file);
      expect(props.onState).toHaveBeenCalledWith(saved);
      expect(props.onAdvance).not.toHaveBeenCalled();
    });

    it("shows the logo and offers to replace and to remove it", () => {
      render(
        <BrandingStep
          {...stepProps({
            state: state({
              branding: {
                theme: "Brasserie",
                primaryColor: null,
                tagline: null,
                logoUrl: "/media/l.png",
              },
            }),
          })}
        />
      );
      expect(screen.getByTestId("logo-thumbnail")).toHaveTextContent("/media/l.png");
      expect(screen.getByText("Replace the logo")).toBeTruthy();
      expect(screen.getByTestId("branding-logo-remove")).toBeTruthy();
    });

    it("removes it with the delete endpoint and takes the answer in place", async () => {
      const saved = state();
      mockDelete.mockResolvedValue(ok(saved));
      const props = stepProps({
        state: state({
          branding: {
            theme: "Brasserie",
            primaryColor: null,
            tagline: null,
            logoUrl: "/media/l.png",
          },
        }),
      });
      render(<BrandingStep {...props} />);

      await press("branding-logo-remove");

      expect(mockDelete).toHaveBeenCalledWith(7);
      expect(props.onState).toHaveBeenCalledWith(saved);
      expect(props.onAdvance).not.toHaveBeenCalled();
    });

    it("keeps the logo and shows the message when removing it is refused", async () => {
      mockDelete.mockResolvedValue(refused("Cannot remove.", 409, "onboarding.suspended"));
      const props = stepProps({
        state: state({
          branding: {
            theme: "Brasserie",
            primaryColor: null,
            tagline: null,
            logoUrl: "/media/l.png",
          },
        }),
      });
      render(<BrandingStep {...props} />);

      await press("branding-logo-remove");

      expect(screen.getByTestId("branding-logo-error")).toHaveTextContent("Cannot remove.");
      expect(screen.getByTestId("logo-thumbnail")).toBeTruthy();
      expect(props.onState).not.toHaveBeenCalled();
    });

    it("does nothing when the chooser is dismissed", async () => {
      mockPick.mockResolvedValue(null);
      render(<BrandingStep {...stepProps()} />);
      await press("branding-logo-upload");
      expect(mockUpload).not.toHaveBeenCalled();
    });

    it("refuses a file of the wrong type before it is sent, in the server's own words", async () => {
      mockPick.mockResolvedValue({ file: null, refusal: "type" });
      render(<BrandingStep {...stepProps()} />);
      await press("branding-logo-upload");
      expect(mockUpload).not.toHaveBeenCalled();
      expect(screen.getByTestId("branding-logo-error")).toHaveTextContent(
        "Only JPEG, PNG, and WebP images are accepted."
      );
    });

    it("refuses a file that is too large before it is sent", async () => {
      mockPick.mockResolvedValue({ file: null, refusal: "size" });
      render(<BrandingStep {...stepProps()} />);
      await press("branding-logo-upload");
      expect(mockUpload).not.toHaveBeenCalled();
      expect(screen.getByTestId("branding-logo-error")).toHaveTextContent(
        "The picture must be under 6 MB."
      );
    });

    it("shows the server's refusal of a file and keeps the step", async () => {
      mockPick.mockResolvedValue({ file, refusal: null });
      mockUpload.mockResolvedValue(refused("Unreadable.", 400, "site.image_unreadable"));
      const props = stepProps();
      render(<BrandingStep {...props} />);
      await press("branding-logo-upload");
      expect(screen.getByTestId("branding-logo-error")).toHaveTextContent("Unreadable.");
      expect(props.onState).not.toHaveBeenCalled();
    });

    it("clears a refusal when the next attempt starts", async () => {
      mockPick.mockResolvedValueOnce({ file: null, refusal: "type" }).mockResolvedValueOnce({
        file,
        refusal: null,
      });
      mockUpload.mockResolvedValue(ok(state()));
      render(<BrandingStep {...stepProps()} />);
      await press("branding-logo-upload");
      expect(screen.getByTestId("branding-logo-error")).toBeTruthy();

      await press("branding-logo-upload");

      expect(screen.queryByTestId("branding-logo-error")).toBeNull();
    });

    it("clears a refusal when the logo is then removed", async () => {
      mockPick.mockResolvedValue({ file: null, refusal: "type" });
      mockDelete.mockResolvedValue(ok(state()));
      render(
        <BrandingStep
          {...stepProps({
            state: state({
              branding: {
                theme: "Brasserie",
                primaryColor: null,
                tagline: null,
                logoUrl: "/media/l.png",
              },
            }),
          })}
        />
      );
      await press("branding-logo-upload");
      expect(screen.getByTestId("branding-logo-error")).toBeTruthy();
      await press("branding-logo-remove");
      expect(screen.queryByTestId("branding-logo-error")).toBeNull();
    });

    it("ends the session on a 401", async () => {
      mockPick.mockResolvedValue({ file, refusal: null });
      mockUpload.mockResolvedValue(refused("x", 401));
      const props = stepProps();
      render(<BrandingStep {...props} />);
      await press("branding-logo-upload");
      expect(props.onExpired).toHaveBeenCalledTimes(1);
      expect(screen.queryByTestId("branding-logo-error")).toBeNull();
    });
  });

  describe("skipping", () => {
    it("is offered, because the server says the step can be skipped", () => {
      render(<BrandingStep {...stepProps({ state: withSkip })} />);
      expect(screen.getByTestId("step-branding-skip")).toBeTruthy();
    });

    it("is not offered when the server does not say so", () => {
      render(
        <BrandingStep
          {...stepProps({
            state: state({ steps: [{ key: "branding", state: "Todo", canSkip: false }] }),
          })}
        />
      );
      expect(screen.queryByTestId("step-branding-skip")).toBeNull();
    });

    it("is not offered when the server leaves the step out altogether", () => {
      render(<BrandingStep {...stepProps({ state: state({ steps: [] }) })} />);
      expect(screen.queryByTestId("step-branding-skip")).toBeNull();
    });

    it("calls the skip endpoint, saves nothing, and moves on", async () => {
      const skipped = readyState();
      mockSkip.mockResolvedValue(ok(skipped));
      const props = stepProps({ state: withSkip });
      render(<BrandingStep {...props} />);

      await press("step-branding-skip");

      expect(mockSkip).toHaveBeenCalledWith(7, "branding");
      expect(mockSave).not.toHaveBeenCalled();
      expect(props.onState).toHaveBeenCalledWith(skipped);
      expect(props.onAdvance).toHaveBeenCalledTimes(1);
    });

    it("stays on the step with the message when the server refuses", async () => {
      mockSkip.mockResolvedValue(refused("Cannot skip.", 400, "onboarding.step_required"));
      const props = stepProps({ state: withSkip });
      render(<BrandingStep {...props} />);
      await press("step-branding-skip");
      expect(screen.getByTestId("step-branding-banner")).toHaveTextContent("Cannot skip.");
      expect(props.onAdvance).not.toHaveBeenCalled();
    });
  });

  it("goes back from its Back button", () => {
    const props = stepProps();
    render(<BrandingStep {...props} />);
    fireEvent.press(screen.getByTestId("step-branding-back"));
    expect(props.onBack).toHaveBeenCalledTimes(1);
  });

  it("is read-only on a suspended restaurant: no save, no skip, only Next, and the logo cannot be changed", async () => {
    const props = stepProps({
      readOnly: true,
      state: state({
        steps: withSkip.steps,
        branding: {
          theme: "Brasserie",
          primaryColor: null,
          tagline: null,
          logoUrl: "/media/l.png",
        },
      }),
    });
    render(<BrandingStep {...props} />);
    expect(screen.getByTestId("branding-logo-upload").props.accessibilityState.disabled).toBe(true);
    expect(screen.getByTestId("branding-logo-remove").props.accessibilityState.disabled).toBe(true);
    await press("branding-logo-upload");
    await press("branding-logo-remove");
    expect(mockPick).not.toHaveBeenCalled();
    expect(mockDelete).not.toHaveBeenCalled();
    expect(screen.getByTestId("branding-color-input").props.editable).toBe(false);
    expect(screen.getByTestId("branding-tagline-input").props.editable).toBe(false);
    expect(screen.getByTestId("step-branding-form").props.pointerEvents).toBe("none");
    expect(screen.queryByTestId("step-branding-continue")).toBeNull();
    expect(screen.queryByTestId("step-branding-skip")).toBeNull();
    fireEvent.press(screen.getByTestId("step-branding-next"));
    expect(props.onAdvance).toHaveBeenCalledTimes(1);
    expect(mockSave).not.toHaveBeenCalled();
  });
});
