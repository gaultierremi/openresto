/**
 * @jest-environment jsdom
 */
import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { PublishPanel } from "@/components/onboarding/PublishPanel";
import { publish, unpublish } from "@/api/onboarding";
import { openExternal } from "@/utils/openExternal";
import { liveState, ok, readyState, refused, state } from "@/tests/helpers/onboardingFixtures";

jest.mock("@/context/BrandContext", () => ({
  useBrand: () => ({ appName: "Open Resto", primaryColor: "#0a7ea4" }),
}));
jest.mock("@/utils/haptics", () => ({
  haptics: { selection: jest.fn(), press: jest.fn(), outcome: jest.fn() },
}));
jest.mock("@/utils/openExternal", () => ({ openExternal: jest.fn() }));
jest.mock("@/api/onboarding", () => ({ publish: jest.fn(), unpublish: jest.fn() }));

const mockPublish = publish as jest.Mock;
const mockUnpublish = unpublish as jest.Mock;
const mockOpen = openExternal as jest.Mock;

const renderPanel = (current = readyState()) => {
  const props = {
    restaurantId: 7,
    state: current,
    onState: jest.fn(),
    onGoToStep: jest.fn(),
    onExpired: jest.fn(),
  };
  render(<PublishPanel {...props} />);
  return props;
};

const press = async (testID: string) => {
  await act(async () => {
    fireEvent.press(screen.getByTestId(testID));
  });
};

beforeEach(() => jest.clearAllMocks());

describe("PublishPanel with something still to do", () => {
  const blocked = state({ publishBlockers: ["hours", "layout"] });

  it("lists each blocker as a link to its step", () => {
    renderPanel(blocked);
    expect(screen.getByText("Step to finish: Hours")).toBeTruthy();
    expect(screen.getByText("Step to finish: Rooms and tables")).toBeTruthy();
    expect(screen.queryByTestId("publish-blocker-info")).toBeNull();
  });

  it("opens the step a blocker names", () => {
    const props = renderPanel(blocked);
    fireEvent.press(screen.getByTestId("publish-blocker-layout"));
    expect(props.onGoToStep).toHaveBeenCalledWith("layout");
    fireEvent.press(screen.getByTestId("publish-blocker-hours"));
    expect(props.onGoToStep).toHaveBeenLastCalledWith("hours");
  });

  it("disables Publish, and pressing it opens nothing and calls nothing", async () => {
    renderPanel(blocked);
    expect(screen.getByTestId("publish-button").props.accessibilityState.disabled).toBe(true);
    await press("publish-button");
    expect(screen.queryByText("Publish your restaurant?")).toBeNull();
    expect(mockPublish).not.toHaveBeenCalled();
  });

  it("says some required steps are still to do", () => {
    renderPanel(blocked);
    expect(
      screen.getByText("Some required steps are still to do before you can publish.")
    ).toBeTruthy();
  });
});

describe("PublishPanel when nothing stands in the way", () => {
  it("enables Publish and lists no blocker", () => {
    renderPanel();
    expect(screen.getByTestId("publish-button").props.accessibilityState.disabled).toBe(false);
    expect(screen.queryByTestId("publish-blockers")).toBeNull();
  });

  it("asks first, and publishes only on the confirmation", async () => {
    const live = liveState();
    mockPublish.mockResolvedValue(ok(live));
    const props = renderPanel();

    await press("publish-button");
    expect(screen.getByText("Publish your restaurant?")).toBeTruthy();
    expect(mockPublish).not.toHaveBeenCalled();

    fireEvent.press(screen.getByText("Yes, publish"));
    await act(async () => {});

    expect(mockPublish).toHaveBeenCalledWith(7);
    expect(props.onState).toHaveBeenCalledWith(live);
    expect(screen.queryByText("Publish your restaurant?")).toBeNull();
  });

  it("sends nothing when the confirmation is cancelled", async () => {
    const props = renderPanel();
    await press("publish-button");
    fireEvent.press(screen.getByText("Cancel"));
    expect(screen.queryByText("Publish your restaurant?")).toBeNull();
    expect(mockPublish).not.toHaveBeenCalled();
    expect(props.onState).not.toHaveBeenCalled();
  });

  it("shows the server's refusal, closes the confirmation and keeps the state", async () => {
    mockPublish.mockResolvedValue(
      refused("Finish the required steps before publishing.", 409, "onboarding.not_publishable")
    );
    const props = renderPanel();
    await press("publish-button");

    fireEvent.press(screen.getByText("Yes, publish"));
    await act(async () => {});

    expect(screen.getByTestId("publish-error")).toHaveTextContent(
      "Finish the required steps before publishing."
    );
    expect(screen.queryByText("Publish your restaurant?")).toBeNull();
    expect(props.onState).not.toHaveBeenCalled();
  });

  it("ends the session on a 401 and shows no message", async () => {
    mockPublish.mockResolvedValue(refused("x", 401));
    const props = renderPanel();
    await press("publish-button");
    fireEvent.press(screen.getByText("Yes, publish"));
    await act(async () => {});
    expect(props.onExpired).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("publish-error")).toBeNull();
  });
});

describe("PublishPanel once live", () => {
  it("says so and shows the three public addresses", () => {
    renderPanel(liveState());
    expect(screen.getByTestId("publish-live")).toHaveTextContent("Your restaurant is live");
    expect(screen.getByText(`${window.location.origin}/r/chez-paul`)).toBeTruthy();
    expect(screen.getByText(`${window.location.origin}/locations/7`)).toBeTruthy();
    expect(screen.getByText(`${window.location.origin}/menu/r/tok-abc`)).toBeTruthy();
    expect(screen.queryByTestId("publish-button")).toBeNull();
  });

  it("opens an address from its button", () => {
    renderPanel(liveState());
    fireEvent.press(screen.getByTestId("publish-open-booking"));
    expect(mockOpen).toHaveBeenCalledWith(`${window.location.origin}/locations/7`);
    fireEvent.press(screen.getByTestId("publish-open-site"));
    expect(mockOpen).toHaveBeenLastCalledWith(`${window.location.origin}/r/chez-paul`);
    fireEvent.press(screen.getByTestId("publish-open-menu"));
    expect(mockOpen).toHaveBeenLastCalledWith(`${window.location.origin}/menu/r/tok-abc`);
  });

  it("shows only the addresses that exist: a site that is not live has no link", () => {
    renderPanel(liveState({ links: { ...liveState().links, sitePath: null } }));
    expect(screen.queryByTestId("publish-open-site")).toBeNull();
    expect(screen.getByTestId("publish-open-booking")).toBeTruthy();
  });

  it("asks first, and unpublishes only on the confirmation, with the answer replacing the state", async () => {
    const draft = readyState();
    mockUnpublish.mockResolvedValue(ok(draft));
    const props = renderPanel(liveState());

    await press("publish-unpublish");
    expect(screen.getByText("Unpublish your restaurant?")).toBeTruthy();
    expect(mockUnpublish).not.toHaveBeenCalled();

    fireEvent.press(screen.getByText("Yes, unpublish"));
    await act(async () => {});

    expect(mockUnpublish).toHaveBeenCalledWith(7);
    expect(props.onState).toHaveBeenCalledWith(draft);
  });

  it("sends nothing when the unpublish confirmation is cancelled", async () => {
    const props = renderPanel(liveState());
    await press("publish-unpublish");
    fireEvent.press(screen.getByText("Cancel"));
    expect(mockUnpublish).not.toHaveBeenCalled();
    expect(props.onState).not.toHaveBeenCalled();
    expect(screen.getByTestId("publish-live")).toBeTruthy();
  });

  it("keeps the panel live and shows the message when unpublishing is refused", async () => {
    mockUnpublish.mockResolvedValue(refused("Not possible.", 409, "onboarding.suspended"));
    const props = renderPanel(liveState());
    await press("publish-unpublish");
    fireEvent.press(screen.getByText("Yes, unpublish"));
    await act(async () => {});
    expect(screen.getByTestId("publish-error")).toHaveTextContent("Not possible.");
    expect(screen.getByTestId("publish-live")).toBeTruthy();
    expect(props.onState).not.toHaveBeenCalled();
  });
});

describe("PublishPanel on a suspended restaurant", () => {
  it("explains and offers neither publishing nor unpublishing", () => {
    renderPanel(readyState({ status: "Suspended", canPublish: false }));
    expect(screen.getByText(/it can be neither published nor unpublished/)).toBeTruthy();
    expect(screen.queryByTestId("publish-button")).toBeNull();
    expect(screen.queryByTestId("publish-unpublish")).toBeNull();
    expect(screen.queryByTestId("publish-blockers")).toBeNull();
  });
});
