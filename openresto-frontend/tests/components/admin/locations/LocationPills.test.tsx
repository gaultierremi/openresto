/**
 * @jest-environment jsdom
 */
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { LocationPills } from "@/components/admin/locations/LocationPills";
import type { AdminRestaurantSummary } from "@/api/admin";

jest.setTimeout(20_000);

jest.mock("@/context/BrandContext", () => ({
  useBrand: () => ({ appName: "Open Resto", primaryColor: "#0a7ea4" }),
}));

const restaurants = [
  { id: 1, name: "Brasserie", isArchived: false },
  { id: 2, name: "Pub", isArchived: false },
  { id: 3, name: "Old place", isArchived: true },
] as AdminRestaurantSummary[];

describe("LocationPills", () => {
  it("announces only the selected location as checked, through aria-checked, which is what the web reads", () => {
    const onSelect = jest.fn();
    render(<LocationPills restaurants={restaurants} selectedId={2} onSelect={onSelect} />);

    // The `aria-*` prop is only visible on the component element, not on the host node.
    const prop = (label: string, name: string) =>
      screen
        .UNSAFE_getAllByProps({ accessibilityLabel: label })
        .map((node) => node.props[name])
        .find((value) => value !== undefined);
    const labels = ["Brasserie", "Pub", "Old place, archived"];

    expect(labels.map((l) => prop(l, "aria-checked"))).toEqual([false, true, false]);
    expect(labels.map((l) => prop(l, "accessibilityState").checked)).toEqual([false, true, false]);
  });

  it("selects the location whose pill is pressed", () => {
    const onSelect = jest.fn();
    render(<LocationPills restaurants={restaurants} selectedId={1} onSelect={onSelect} />);

    fireEvent.press(screen.getAllByRole("radio")[1]);

    expect(onSelect).toHaveBeenCalledWith(2);
  });
});
