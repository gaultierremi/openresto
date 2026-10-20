/**
 * @jest-environment jsdom
 */
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { SiteThemePicker } from "@/components/admin/site/SiteThemePicker";
import { SITE_THEMES } from "@/constants/site";

jest.setTimeout(20_000);

jest.mock("@/context/BrandContext", () => ({
  useBrand: () => ({ appName: "Open Resto", primaryColor: "#0a7ea4" }),
}));

const renderPicker = (value: "Brasserie" | "Gastronomique" | "Cafe" = "Brasserie") => {
  const onChange = jest.fn();
  render(<SiteThemePicker value={value} brandColor="#b45309" onChange={onChange} />);
  return onChange;
};

describe("SiteThemePicker", () => {
  it("offers the three themes as radios in a labelled group", () => {
    renderPicker();
    expect(screen.getByLabelText("Website theme").props.accessibilityRole).toBe("radiogroup");
    expect(screen.getAllByRole("radio")).toHaveLength(SITE_THEMES.length);
    expect(screen.getByRole("radio", { name: "Brasserie" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "Fine dining" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "Café" })).toBeTruthy();
  });

  it("shows each theme's one-line description", () => {
    renderPicker();
    expect(screen.getByText("Warm and welcoming: cream paper, serif headings.")).toBeTruthy();
    expect(
      screen.getByText("Understated and elegant: dark background, spaced lettering.")
    ).toBeTruthy();
    expect(
      screen.getByText("Light and rounded: touches of your colour, very readable.")
    ).toBeTruthy();
  });

  it.each(SITE_THEMES)("checks only %s when it is the value", (theme) => {
    renderPicker(theme);
    SITE_THEMES.forEach((other) => {
      expect(screen.getByTestId(`site-theme-${other}`).props.accessibilityState.checked).toBe(
        other === theme
      );
    });
  });

  it.each(SITE_THEMES)("selects %s when its card is pressed", (theme) => {
    const onChange = renderPicker(theme === "Cafe" ? "Brasserie" : "Cafe");
    fireEvent.press(screen.getByTestId(`site-theme-${theme}`));
    expect(onChange).toHaveBeenCalledWith(theme);
  });
});
