import React from "react";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { WizardStepper } from "@/components/onboarding/WizardStepper";
import { state, steps } from "@/tests/helpers/onboardingFixtures";

jest.mock("@/context/BrandContext", () => ({
  useBrand: () => ({ appName: "Open Resto", primaryColor: "#0a7ea4" }),
}));

const doneAndSkipped = state({
  steps: steps({ info: "Done", hours: "Done", menu: "Skipped" }),
});

describe("WizardStepper", () => {
  it("lists the five steps and the preview, in order", () => {
    render(<WizardStepper state={state()} stage="info" onSelect={jest.fn()} />);
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((t) => t.props.testID)).toEqual([
      "stepper-info",
      "stepper-hours",
      "stepper-layout",
      "stepper-menu",
      "stepper-branding",
      "stepper-preview",
    ]);
  });

  it("shows where each step stands: done, skipped, to do", () => {
    render(<WizardStepper state={doneAndSkipped} stage="info" onSelect={jest.fn()} />);
    expect(screen.getByRole("tab", { name: "Details, Done" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Hours, Done" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Rooms and tables, To do" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Menu, Skipped" })).toBeTruthy();
  });

  it("gives the preview no state, since nothing is saved there", () => {
    render(<WizardStepper state={doneAndSkipped} stage="preview" onSelect={jest.fn()} />);
    expect(screen.getByRole("tab", { name: "Preview and publish" })).toBeTruthy();
  });

  it("marks the open stage as the selected one", () => {
    render(<WizardStepper state={state()} stage="layout" onSelect={jest.fn()} />);
    expect(screen.getByTestId("stepper-layout").props.accessibilityState.selected).toBe(true);
    expect(screen.getByTestId("stepper-hours").props.accessibilityState.selected).toBe(false);
  });

  it("opens any stage on a press, a later one included, whatever the earlier ones say", () => {
    const onSelect = jest.fn();
    render(<WizardStepper state={state()} stage="info" onSelect={onSelect} />);
    fireEvent.press(screen.getByTestId("stepper-preview"));
    fireEvent.press(screen.getByTestId("stepper-branding"));
    fireEvent.press(screen.getByTestId("stepper-info"));
    expect(onSelect.mock.calls.map((c) => c[0])).toEqual(["preview", "branding", "info"]);
  });
});
