import React from "react";
import { Text } from "react-native";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { StepShell } from "@/components/onboarding/StepShell";

jest.mock("@/context/BrandContext", () => ({
  useBrand: () => ({ appName: "Open Resto", primaryColor: "#0a7ea4" }),
}));
jest.mock("@/utils/haptics", () => ({
  haptics: { selection: jest.fn(), press: jest.fn(), outcome: jest.fn() },
}));

const renderShell = (over: Partial<React.ComponentProps<typeof StepShell>> = {}) => {
  const props: React.ComponentProps<typeof StepShell> = {
    title: "Your restaurant",
    description: "Who you are.",
    readOnly: false,
    busy: false,
    onPrimary: jest.fn(),
    onNext: jest.fn(),
    testID: "shell",
    children: <Text>form body</Text>,
    ...over,
  };
  render(<StepShell {...props} />);
  return props;
};

describe("StepShell", () => {
  it("shows the title, what the step is for and its form", () => {
    renderShell();
    expect(screen.getByText("Your restaurant")).toBeTruthy();
    expect(screen.getByText("Who you are.")).toBeTruthy();
    expect(screen.getByText("form body")).toBeTruthy();
  });

  it("saves from the filled button, named Continue", () => {
    const props = renderShell();
    fireEvent.press(screen.getByRole("button", { name: "Continue" }));
    expect(props.onPrimary).toHaveBeenCalledTimes(1);
    expect(props.onNext).not.toHaveBeenCalled();
  });

  it("can name the filled button something else", () => {
    renderShell({ primaryLabel: "Publish" });
    expect(screen.getByRole("button", { name: "Publish" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Continue" })).toBeNull();
  });

  it("offers Back only when there is a step before, and Skip only when asked", () => {
    renderShell();
    expect(screen.queryByTestId("shell-back")).toBeNull();
    expect(screen.queryByTestId("shell-skip")).toBeNull();
  });

  it("puts Back and Skip before the filled button, which comes last", () => {
    renderShell({ onBack: jest.fn(), onSkip: jest.fn() });
    const ids = screen.getAllByRole("button").map((n) => n.props.testID);
    expect(ids.indexOf("shell-back")).toBeLessThan(ids.indexOf("shell-skip"));
    expect(ids.indexOf("shell-skip")).toBeLessThan(ids.indexOf("shell-continue"));
  });

  it("calls Back and Skip from their own buttons", () => {
    const props = renderShell({ onBack: jest.fn(), onSkip: jest.fn() });
    fireEvent.press(screen.getByTestId("shell-back"));
    fireEvent.press(screen.getByTestId("shell-skip"));
    expect(props.onBack).toHaveBeenCalledTimes(1);
    expect(props.onSkip).toHaveBeenCalledTimes(1);
    expect(props.onPrimary).not.toHaveBeenCalled();
  });

  it("blocks the filled button while a call is in flight", () => {
    const props = renderShell({ busy: true, onBack: jest.fn() });
    fireEvent.press(screen.getByTestId("shell-continue"));
    fireEvent.press(screen.getByTestId("shell-back"));
    expect(props.onPrimary).not.toHaveBeenCalled();
    expect(props.onBack).not.toHaveBeenCalled();
  });

  it("disables the filled button when the step says it cannot be sent", () => {
    const props = renderShell({ primaryDisabled: true });
    fireEvent.press(screen.getByTestId("shell-continue"));
    expect(props.onPrimary).not.toHaveBeenCalled();
    expect(screen.getByTestId("shell-continue").props.accessibilityState.disabled).toBe(true);
  });

  it("enables it when nothing stands in the way", () => {
    renderShell({ primaryDisabled: false });
    expect(screen.getByTestId("shell-continue").props.accessibilityState.disabled).toBe(false);
  });

  describe("read-only", () => {
    it("closes the form to input", () => {
      renderShell({ readOnly: true });
      expect(screen.getByTestId("shell-form").props.pointerEvents).toBe("none");
    });

    it("leaves the form open to input otherwise", () => {
      renderShell();
      expect(screen.getByTestId("shell-form").props.pointerEvents).toBe("auto");
    });

    it("only moves on, under another name, and never saves", () => {
      const props = renderShell({ readOnly: true });
      expect(screen.queryByTestId("shell-continue")).toBeNull();
      fireEvent.press(screen.getByRole("button", { name: "Next" }));
      expect(props.onNext).toHaveBeenCalledTimes(1);
      expect(props.onPrimary).not.toHaveBeenCalled();
    });

    it("does not offer to skip a step it cannot change", () => {
      renderShell({ readOnly: true, onSkip: jest.fn() });
      expect(screen.queryByTestId("shell-skip")).toBeNull();
    });
  });
});
