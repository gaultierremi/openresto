/**
 * @jest-environment jsdom
 */
import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { PreviewStage } from "@/components/onboarding/PreviewStage";
import { getPreview } from "@/api/onboarding";
import { ok, preview, readyState, refused, state } from "@/tests/helpers/onboardingFixtures";

jest.mock("@/context/BrandContext", () => ({
  useBrand: () => ({ appName: "Open Resto", primaryColor: "#0a7ea4" }),
}));
jest.mock("@/utils/haptics", () => ({
  haptics: { selection: jest.fn(), press: jest.fn(), outcome: jest.fn() },
}));
jest.mock("@/api/onboarding", () => ({ getPreview: jest.fn() }));
jest.mock("@/components/onboarding/OnboardingSitePreview", () => {
  const { Text } = require("react-native");
  return {
    OnboardingSitePreview: ({
      restaurantId,
      version,
    }: {
      restaurantId: number;
      version: string;
    }) => <Text testID="site-preview">{`${restaurantId}:${version}`}</Text>,
  };
});
jest.mock("@/components/onboarding/PublishPanel", () => {
  const { Pressable, Text } = require("react-native");
  return {
    PublishPanel: ({
      onGoToStep,
      state: s,
    }: {
      onGoToStep: (k: string) => void;
      state: { status: string };
    }) => (
      <Pressable testID="publish-panel" onPress={() => onGoToStep("hours")}>
        <Text>{s.status}</Text>
      </Pressable>
    ),
  };
});

const mockGet = getPreview as jest.Mock;

const renderStage = async (current = readyState()) => {
  const props = {
    restaurantId: 7,
    state: current,
    onState: jest.fn(),
    onGoToStep: jest.fn(),
    onBack: jest.fn(),
    onExpired: jest.fn(),
  };
  render(<PreviewStage {...props} />);
  await act(async () => {});
  return props;
};

beforeEach(() => {
  jest.clearAllMocks();
  mockGet.mockResolvedValue(ok(preview()));
});

describe("PreviewStage", () => {
  it("shows the three panels: the website, the QR menu and the booking page", async () => {
    await renderStage();
    expect(screen.getByTestId("preview-panel-site")).toBeTruthy();
    expect(screen.getByTestId("preview-panel-qr")).toBeTruthy();
    expect(screen.getByTestId("preview-panel-booking")).toBeTruthy();
    expect(screen.getByText("Your website")).toBeTruthy();
    expect(screen.getByText("Your QR menu")).toBeTruthy();
    expect(screen.getByText("Your booking page")).toBeTruthy();
  });

  it("frames the website of this restaurant, keyed to its status", async () => {
    await renderStage();
    expect(screen.getByTestId("site-preview")).toHaveTextContent("7:Draft");
  });

  it("loads the preview of this restaurant", async () => {
    await renderStage();
    expect(mockGet).toHaveBeenCalledWith(7);
  });

  it("fills the QR panel from the menu and the booking mock from the figures, labelled as a preview", async () => {
    await renderStage();
    expect(screen.getByText("Croquettes aux crevettes")).toBeTruthy();
    expect(screen.getByTestId("booking-mock-label")).toHaveTextContent(
      "Preview — the real page will be available once published"
    );
    expect(screen.getByText("18:30")).toBeTruthy();
  });

  it("gives the QR panel the restaurant's own token and whether it is live", async () => {
    await renderStage(readyState({ links: { ...state().links, menuToken: "mine" } }));
    expect(screen.getByTestId("qr-url").props.children).toBe(
      `${window.location.origin}/menu/r/mine`
    );
    expect(
      screen.getByText("This code will only work once your restaurant is published.")
    ).toBeTruthy();
  });

  it("tells a live restaurant's code is live", async () => {
    await renderStage(readyState({ status: "Published" }));
    expect(screen.getByText("This code is live: your guests can scan it right now.")).toBeTruthy();
  });

  it("says it is loading until the preview answers, with the publication already there", async () => {
    mockGet.mockReturnValue(new Promise(() => {}));
    await renderStage();
    expect(screen.getByText("Loading the preview…")).toBeTruthy();
    expect(screen.queryByTestId("preview-panel-qr")).toBeNull();
    expect(screen.getByTestId("publish-panel")).toBeTruthy();
  });

  describe("when the preview cannot be loaded", () => {
    it("shows the message and a retry instead of the two panels it feeds", async () => {
      mockGet.mockResolvedValue(refused("Server error.", 500));
      await renderStage();
      expect(screen.getByRole("alert")).toHaveTextContent("Server error.");
      expect(screen.queryByTestId("preview-panel-qr")).toBeNull();
      expect(screen.queryByTestId("preview-panel-booking")).toBeNull();
      expect(screen.getByTestId("preview-panel-site")).toBeTruthy();
      expect(screen.getByTestId("publish-panel")).toBeTruthy();
    });

    it("loads again on retry and shows the panels", async () => {
      mockGet
        .mockResolvedValueOnce(refused("Server error.", 500))
        .mockResolvedValueOnce(ok(preview()));
      await renderStage();

      await act(async () => {
        fireEvent.press(screen.getByTestId("preview-retry"));
      });

      expect(mockGet).toHaveBeenCalledTimes(2);
      expect(screen.queryByRole("alert")).toBeNull();
      expect(screen.getByTestId("preview-panel-qr")).toBeTruthy();
    });

    it("hands a 401 to the session and shows no message", async () => {
      mockGet.mockResolvedValue(refused("x", 401));
      const props = await renderStage();
      expect(props.onExpired).toHaveBeenCalledTimes(1);
      expect(screen.queryByRole("alert")).toBeNull();
    });
  });

  it("ignores an answer that arrives after it was closed", async () => {
    let resolve: (value: unknown) => void = () => {};
    mockGet.mockReturnValue(new Promise((r) => (resolve = r)));
    const props = {
      restaurantId: 7,
      state: readyState(),
      onState: jest.fn(),
      onGoToStep: jest.fn(),
      onBack: jest.fn(),
      onExpired: jest.fn(),
    };
    const view = render(<PreviewStage {...props} />);
    view.unmount();
    await act(async () => resolve(ok(preview())));
    expect(props.onExpired).not.toHaveBeenCalled();
  });

  it("passes a blocker's step on to the wizard", async () => {
    const props = await renderStage();
    fireEvent.press(screen.getByTestId("publish-panel"));
    expect(props.onGoToStep).toHaveBeenCalledWith("hours");
  });

  it("goes back from its Back button", async () => {
    const props = await renderStage();
    fireEvent.press(screen.getByTestId("stage-preview-back"));
    expect(props.onBack).toHaveBeenCalledTimes(1);
  });
});
