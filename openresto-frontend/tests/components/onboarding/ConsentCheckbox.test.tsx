import React from "react";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { ConsentCheckbox } from "@/components/onboarding/ConsentCheckbox";

jest.mock("@/context/BrandContext", () => ({
  useBrand: () => ({ appName: "Open Resto", primaryColor: "#0a7ea4" }),
}));

const renderBox = (checked: boolean) => {
  const onChange = jest.fn();
  const onOpen = jest.fn();
  render(
    <ConsentCheckbox
      checked={checked}
      onChange={onChange}
      label="I accept the terms"
      linkLabel="Read the terms"
      onOpen={onOpen}
      testID="box"
    />
  );
  return { onChange, onOpen };
};

describe("ConsentCheckbox", () => {
  it("is an unchecked checkbox named by its sentence", () => {
    renderBox(false);
    const box = screen.getByRole("checkbox", { name: "I accept the terms" });
    expect(box.props.accessibilityState.checked).toBe(false);
  });

  it("is a checked one when ticked", () => {
    renderBox(true);
    expect(screen.getByRole("checkbox").props.accessibilityState.checked).toBe(true);
  });

  it("ticks from the box and unticks a ticked one", () => {
    const first = renderBox(false);
    fireEvent.press(screen.getByRole("checkbox"));
    expect(first.onChange).toHaveBeenCalledWith(true);
  });

  it("unticks from the box when it is ticked", () => {
    const { onChange } = renderBox(true);
    fireEvent.press(screen.getByRole("checkbox"));
    expect(onChange).toHaveBeenCalledWith(false);
  });

  it("toggles from its sentence too", () => {
    const { onChange } = renderBox(false);
    fireEvent.press(screen.getByText("I accept the terms"));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("opens the document from the link without ticking", () => {
    const { onChange, onOpen } = renderBox(false);
    fireEvent.press(screen.getByRole("link", { name: "Read the terms" }));
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onChange).not.toHaveBeenCalled();
  });
});
