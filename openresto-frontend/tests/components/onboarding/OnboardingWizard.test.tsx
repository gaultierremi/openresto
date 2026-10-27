/**
 * @jest-environment jsdom
 */
import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { OnboardingWizard } from "@/components/onboarding/OnboardingWizard";
import { getPreview, getState, publish, saveInfo, saveHours, skipStep } from "@/api/onboarding";
import { useOnboardingSession } from "@/context/OnboardingSessionContext";
import { useLocalSearchParams } from "expo-router";
import {
  liveState,
  ok,
  preview,
  readyState,
  refused,
  state,
  steps,
} from "@/tests/helpers/onboardingFixtures";

jest.setTimeout(20_000);

jest.mock("@/context/BrandContext", () => ({
  useBrand: () => ({ appName: "Open Resto", primaryColor: "#0a7ea4" }),
}));
jest.mock("@/utils/haptics", () => ({
  haptics: { selection: jest.fn(), press: jest.fn(), outcome: jest.fn() },
}));
jest.mock("@/api/onboarding", () => ({
  getInbox: jest
    .fn()
    .mockResolvedValue({ ok: true, value: { timezone: "Europe/Brussels", bookings: [] } }),
  getState: jest.fn(),
  getPreview: jest.fn(),
  saveInfo: jest.fn(),
  saveHours: jest.fn(),
  skipStep: jest.fn(),
  publish: jest.fn(),
  unpublish: jest.fn(),
  fetchSitePreview: jest.fn(),
}));
jest.mock("@/context/OnboardingSessionContext", () => ({ useOnboardingSession: jest.fn() }));

const mockReplace = jest.fn();
const mockSetParams = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: jest.fn(),
}));
const mockRouter = { replace: mockReplace, setParams: mockSetParams };

const mockGetState = getState as jest.Mock;
const mockGetPreview = getPreview as jest.Mock;
const mockSaveInfo = saveInfo as jest.Mock;
const mockSaveHours = saveHours as jest.Mock;
const mockSkip = skipStep as jest.Mock;
const mockPublish = publish as jest.Mock;
const mockParams = useLocalSearchParams as jest.Mock;
const mockSession = useOnboardingSession as jest.Mock;
const expire = jest.fn();
const signOut = jest.fn();

const renderWizard = async () => {
  const view = render(<OnboardingWizard restaurantId={7} />);
  await act(async () => {});
  return view;
};

const press = async (testID: string) => {
  await act(async () => {
    fireEvent.press(screen.getByTestId(testID));
  });
};

const fillInfo = () => {
  const type = (label: string, text: string) =>
    fireEvent.changeText(screen.getByLabelText(label), text);
  type("Address", "Rue Haute 1, 1000 Bruxelles");
  type("Phone", "+32 2 123 45 67");
  type("Contact e-mail", "paul@chezpaul.be");
  type("Legal name", "Chez Paul SRL");
  type("Enterprise number (BCE/KBO)", "0123.456.749");
};

beforeEach(() => {
  jest.clearAllMocks();
  mockParams.mockReturnValue({});
  mockSession.mockReturnValue({ expire, signOut });
  mockGetState.mockResolvedValue(ok(state()));
  mockGetPreview.mockResolvedValue(ok(preview()));
});

describe("opening", () => {
  it("says it is loading, and loads the restaurant it was given", async () => {
    mockGetState.mockReturnValue(new Promise(() => {}));
    render(<OnboardingWizard restaurantId={7} />);
    expect(screen.getByTestId("wizard-loading")).toBeTruthy();
    expect(mockGetState).toHaveBeenCalledWith(7);
  });

  it("opens the first step still to do", async () => {
    mockGetState.mockResolvedValue(ok(state({ nextStep: "layout" })));
    await renderWizard();
    expect(screen.getByTestId("step-layout")).toBeTruthy();
    expect(screen.queryByTestId("step-info")).toBeNull();
  });

  it("opens the stage the address names, whatever the steps say", async () => {
    mockParams.mockReturnValue({ step: "branding" });
    mockGetState.mockResolvedValue(ok(state({ nextStep: "hours" })));
    await renderWizard();
    expect(screen.getByTestId("step-branding")).toBeTruthy();
  });

  it("opens the preview when the address asks for it", async () => {
    mockParams.mockReturnValue({ step: "preview" });
    await renderWizard();
    expect(screen.getByTestId("stage-preview")).toBeTruthy();
  });

  it("ignores an address that names no stage and opens the first step still to do", async () => {
    mockParams.mockReturnValue({ step: "nonsense" });
    mockGetState.mockResolvedValue(ok(state({ nextStep: "hours" })));
    await renderWizard();
    expect(screen.getByTestId("step-hours")).toBeTruthy();
  });

  it("opens the preview once every step is settled", async () => {
    mockGetState.mockResolvedValue(ok(readyState()));
    await renderWizard();
    expect(screen.getByTestId("stage-preview")).toBeTruthy();
  });

  it("names the restaurant and its status", async () => {
    await renderWizard();
    expect(screen.getByTestId("wizard-name")).toHaveTextContent("Chez Paul");
    expect(screen.getByTestId("wizard-status")).toHaveTextContent("Draft");
  });

  it("shows where each step stands in the stepper", async () => {
    mockGetState.mockResolvedValue(
      ok(state({ steps: steps({ info: "Done", menu: "Skipped" }), nextStep: "hours" }))
    );
    await renderWizard();
    expect(screen.getByRole("tab", { name: "Details, Done" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Menu, Skipped" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Hours, To do" })).toBeTruthy();
  });

  it("follows an address that changes while it is open", async () => {
    mockGetState.mockResolvedValue(ok(state({ nextStep: "info" })));
    const view = await renderWizard();
    expect(screen.getByTestId("step-info")).toBeTruthy();

    mockParams.mockReturnValue({ step: "menu" });
    view.rerender(<OnboardingWizard restaurantId={7} />);
    await act(async () => {});

    expect(screen.getByTestId("step-menu")).toBeTruthy();
  });

  it("ignores a later address that names no stage", async () => {
    const view = await renderWizard();
    mockParams.mockReturnValue({ step: "nonsense" });
    view.rerender(<OnboardingWizard restaurantId={7} />);
    await act(async () => {});
    expect(screen.getByTestId("step-info")).toBeTruthy();
  });

  it("ignores an answer that arrives after it was closed", async () => {
    let resolve: (value: unknown) => void = () => {};
    mockGetState.mockReturnValue(new Promise((r) => (resolve = r)));
    const view = render(<OnboardingWizard restaurantId={7} />);
    view.unmount();
    await act(async () => resolve(refused("x", 401)));
    expect(expire).not.toHaveBeenCalled();
  });
});

describe("resuming at any time", () => {
  it("opens any stage from the stepper, a later one included, and puts it in the address", async () => {
    await renderWizard();
    await press("stepper-preview");
    expect(screen.getByTestId("stage-preview")).toBeTruthy();
    expect(mockSetParams).toHaveBeenLastCalledWith({ step: "preview" });

    await press("stepper-layout");
    expect(screen.getByTestId("step-layout")).toBeTruthy();
    expect(mockSetParams).toHaveBeenLastCalledWith({ step: "layout" });
  });

  it("goes back a stage from Back, and has no Back on the first", async () => {
    mockGetState.mockResolvedValue(ok(state({ nextStep: "hours" })));
    await renderWizard();
    await press("step-hours-back");
    expect(screen.getByTestId("step-info")).toBeTruthy();
    expect(screen.queryByTestId("step-info-back")).toBeNull();
  });

  it("goes back from the preview to the last step", async () => {
    mockGetState.mockResolvedValue(ok(readyState()));
    await renderWizard();
    await press("stage-preview-back");
    expect(screen.getByTestId("step-branding")).toBeTruthy();
  });
});

describe("a step saving", () => {
  it("replaces the state with the answer and moves to the next stage", async () => {
    mockSaveInfo.mockResolvedValue(
      ok(state({ name: "Chez Paul & fils", steps: steps({ info: "Done" }), nextStep: "hours" }))
    );
    await renderWizard();
    fillInfo();

    await press("step-info-continue");

    expect(mockSaveInfo).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("step-hours")).toBeTruthy();
    expect(screen.queryByTestId("step-info")).toBeNull();
    expect(screen.getByTestId("wizard-name")).toHaveTextContent("Chez Paul & fils");
    expect(screen.getByRole("tab", { name: "Details, Done" })).toBeTruthy();
    expect(mockSetParams).toHaveBeenLastCalledWith({ step: "hours" });
    expect(mockGetState).toHaveBeenCalledTimes(1);
  });

  it("does not move, and does not touch the state, when the save is refused", async () => {
    mockSaveInfo.mockResolvedValue(
      refused("Not a valid number.", 400, "onboarding.company_number_invalid")
    );
    await renderWizard();
    fillInfo();

    await press("step-info-continue");

    expect(screen.getByTestId("step-info")).toBeTruthy();
    expect(screen.queryByTestId("step-hours")).toBeNull();
    expect(screen.getByTestId("info-companyNumber-error")).toHaveTextContent("Not a valid number.");
    expect(mockSetParams).not.toHaveBeenCalled();
    expect(screen.getByRole("tab", { name: "Details, To do" })).toBeTruthy();
  });

  it("does not move when the form is refused on sight, and calls nothing", async () => {
    await renderWizard();
    await press("step-info-continue");
    expect(mockSaveInfo).not.toHaveBeenCalled();
    expect(screen.getByTestId("step-info")).toBeTruthy();
    expect(mockSetParams).not.toHaveBeenCalled();
  });

  it("saves the hours of the second step and moves on to the third", async () => {
    mockGetState.mockResolvedValue(ok(readyState({ nextStep: "hours", canPublish: false })));
    mockSaveHours.mockResolvedValue(ok(readyState({ nextStep: "layout" })));
    await renderWizard();

    await press("step-hours-continue");

    expect(mockSaveHours).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("step-layout")).toBeTruthy();
  });

  it("skips the menu with the skip endpoint and moves on to the branding", async () => {
    mockGetState.mockResolvedValue(ok(readyState({ nextStep: "menu" })));
    mockSkip.mockResolvedValue(ok(readyState({ nextStep: "branding" })));
    await renderWizard();
    expect(screen.getByTestId("step-menu")).toBeTruthy();

    await press("step-menu-skip");

    expect(mockSkip).toHaveBeenCalledWith(7, "menu");
    expect(screen.getByTestId("step-branding")).toBeTruthy();
  });

  it("offers skipping on the menu and the branding only, never on the three required steps", async () => {
    await renderWizard();
    const skipOffered: Record<string, boolean> = {};
    for (const stage of ["info", "hours", "layout", "menu", "branding"]) {
      await press(`stepper-${stage}`);
      skipOffered[stage] = screen.queryByTestId(`step-${stage}-skip`) !== null;
    }
    expect(skipOffered).toEqual({
      info: false,
      hours: false,
      layout: false,
      menu: true,
      branding: true,
    });
  });
});

describe("a restaurant that is not there", () => {
  it("shows 'not found' and none of the restaurant's data, for a 404", async () => {
    mockGetState.mockResolvedValue(refused("Restaurant not found.", 404, "platform.not_found"));
    await renderWizard();
    expect(screen.getByTestId("wizard-not-found")).toBeTruthy();
    expect(screen.getByText("Restaurant not found")).toBeTruthy();
    expect(screen.queryByTestId("wizard-name")).toBeNull();
    expect(screen.queryByRole("tab")).toBeNull();
    expect(screen.queryByTestId("step-info")).toBeNull();
    expect(expire).not.toHaveBeenCalled();
  });

  it("leads back to the list from there", async () => {
    mockGetState.mockResolvedValue(refused("x", 404));
    await renderWizard();
    fireEvent.press(screen.getByTestId("wizard-not-found-back"));
    expect(mockReplace).toHaveBeenCalledWith("/onboarding");
  });

  it("says it could not load, with a retry, for any other failure, and is not taken for 'not found'", async () => {
    mockGetState
      .mockResolvedValueOnce(refused("The server could not be reached.", 0))
      .mockResolvedValueOnce(ok(state()));
    await renderWizard();
    expect(screen.getByTestId("wizard-error")).toBeTruthy();
    expect(screen.getByText("The server could not be reached.")).toBeTruthy();
    expect(screen.queryByTestId("wizard-not-found")).toBeNull();

    await press("wizard-retry");

    expect(mockGetState).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId("step-info")).toBeTruthy();
  });
});

describe("a session that ended", () => {
  it("is handed to the session, which sends the visitor to sign in, when the first load answers 401", async () => {
    mockGetState.mockResolvedValue(refused("x", 401));
    await renderWizard();
    expect(expire).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("wizard-not-found")).toBeNull();
    expect(screen.queryByTestId("wizard-error")).toBeNull();
  });

  it("is handed to the session when a save answers 401, without a message of its own", async () => {
    mockSaveInfo.mockResolvedValue(refused("x", 401));
    await renderWizard();
    fillInfo();
    await press("step-info-continue");
    expect(expire).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("step-info-banner")).toBeNull();
    expect(screen.queryByTestId("step-hours")).toBeNull();
  });

  it("is handed to the session when the preview answers 401", async () => {
    mockGetState.mockResolvedValue(ok(readyState()));
    mockGetPreview.mockResolvedValue(refused("x", 401));
    await renderWizard();
    expect(expire).toHaveBeenCalledTimes(1);
  });

  it("is handed to the session when publishing answers 401", async () => {
    mockGetState.mockResolvedValue(ok(readyState()));
    mockPublish.mockResolvedValue(refused("x", 401));
    await renderWizard();
    await press("publish-button");
    await act(async () => {
      fireEvent.press(screen.getByText("Yes, publish"));
    });
    expect(expire).toHaveBeenCalledTimes(1);
  });
});

describe("a suspended restaurant", () => {
  const suspended = (reason: string | null) =>
    state({
      status: "Suspended",
      suspensionReason: reason,
      nextStep: "info",
      info: readyState().info,
    });

  it("shows the reason in a banner and the status in the header", async () => {
    mockGetState.mockResolvedValue(ok(suspended("Unpaid invoice")));
    await renderWizard();
    expect(screen.getByTestId("wizard-suspended")).toHaveTextContent(
      "Your restaurant has been suspended by the platform. Reason: Unpaid invoice. The forms are read-only."
    );
    expect(screen.getByTestId("wizard-status")).toHaveTextContent("Suspended");
  });

  it("says so too when the platform gave no reason", async () => {
    mockGetState.mockResolvedValue(ok(suspended(null)));
    await renderWizard();
    expect(screen.getByTestId("wizard-suspended")).toHaveTextContent(
      /suspended by the platform. The forms are read-only; contact the platform/
    );
  });

  it("makes every form read-only: no input, no save, no skip, and moving on calls nothing", async () => {
    mockGetState.mockResolvedValue(ok(suspended("Unpaid invoice")));
    await renderWizard();
    expect(screen.getByLabelText("Restaurant name").props.editable).toBe(false);
    expect(screen.getByTestId("step-info-form").props.pointerEvents).toBe("none");
    expect(screen.queryByTestId("step-info-continue")).toBeNull();

    await press("step-info-next");
    expect(screen.getByTestId("step-hours")).toBeTruthy();
    expect(screen.queryByTestId("step-hours-continue")).toBeNull();

    await press("stepper-menu");
    expect(screen.queryByTestId("step-menu-skip")).toBeNull();
    expect(screen.queryByTestId("step-menu-continue")).toBeNull();

    expect(mockSaveInfo).not.toHaveBeenCalled();
    expect(mockSaveHours).not.toHaveBeenCalled();
    expect(mockSkip).not.toHaveBeenCalled();
  });

  it("offers no publishing on the preview", async () => {
    mockGetState.mockResolvedValue(ok(suspended("Unpaid invoice")));
    mockParams.mockReturnValue({ step: "preview" });
    await renderWizard();
    expect(screen.queryByTestId("publish-button")).toBeNull();
    expect(screen.queryByTestId("publish-unpublish")).toBeNull();
  });

  it("shows no banner on a restaurant that is not suspended", async () => {
    await renderWizard();
    expect(screen.queryByTestId("wizard-suspended")).toBeNull();
  });
});

describe("the preview and publication", () => {
  it("takes a blocker to the step that settles it", async () => {
    mockGetState.mockResolvedValue(ok(state({ nextStep: null, publishBlockers: ["hours"] })));
    await renderWizard();
    expect(screen.getByTestId("publish-button").props.accessibilityState.disabled).toBe(true);

    await press("publish-blocker-hours");

    expect(screen.getByTestId("step-hours")).toBeTruthy();
    expect(mockSetParams).toHaveBeenLastCalledWith({ step: "hours" });
  });

  it("publishes without a reload: the panel turns into the live one from the answer alone", async () => {
    mockGetState.mockResolvedValue(ok(readyState()));
    mockPublish.mockResolvedValue(ok(liveState()));
    await renderWizard();

    await press("publish-button");
    await act(async () => {
      fireEvent.press(screen.getByText("Yes, publish"));
    });

    expect(mockPublish).toHaveBeenCalledWith(7);
    expect(screen.getByTestId("publish-live")).toBeTruthy();
    expect(screen.getByTestId("wizard-status")).toHaveTextContent("Published");
    expect(mockGetState).toHaveBeenCalledTimes(1);
  });

  it("unpublishes without a reload", async () => {
    const { unpublish } = jest.requireMock("@/api/onboarding");
    mockGetState.mockResolvedValue(ok(liveState()));
    unpublish.mockResolvedValue(ok(readyState()));
    await renderWizard();

    await press("publish-unpublish");
    await act(async () => {
      fireEvent.press(screen.getByText("Yes, unpublish"));
    });

    expect(screen.getByTestId("publish-button")).toBeTruthy();
    expect(screen.getByTestId("wizard-status")).toHaveTextContent("Draft");
    expect(mockGetState).toHaveBeenCalledTimes(1);
  });
});

it("signs out from the header", async () => {
  await renderWizard();
  await press("wizard-sign-out");
  expect(signOut).toHaveBeenCalledTimes(1);
});
