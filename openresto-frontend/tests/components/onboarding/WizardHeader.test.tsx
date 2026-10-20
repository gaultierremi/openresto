import React from "react";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { WizardHeader } from "@/components/onboarding/WizardHeader";

jest.mock("@/context/BrandContext", () => ({
  useBrand: () => ({ appName: "Open Resto", primaryColor: "#0a7ea4" }),
}));
jest.mock("@/utils/haptics", () => ({
  haptics: { selection: jest.fn(), press: jest.fn(), outcome: jest.fn() },
}));

describe("WizardHeader", () => {
  it.each([
    ["Draft", "Draft"],
    ["Published", "Published"],
    ["Suspended", "Suspended"],
  ] as const)("names the restaurant and its status %s", (status, label) => {
    render(<WizardHeader name="Chez Paul" status={status} onSignOut={jest.fn()} />);
    expect(screen.getByTestId("wizard-name")).toHaveTextContent("Chez Paul");
    expect(screen.getByTestId("wizard-status")).toHaveTextContent(label);
  });

  it("signs out from its button", () => {
    const onSignOut = jest.fn();
    render(<WizardHeader name="Chez Paul" status="Draft" onSignOut={onSignOut} />);
    fireEvent.press(screen.getByRole("button", { name: "Sign out" }));
    expect(onSignOut).toHaveBeenCalledTimes(1);
  });
});
