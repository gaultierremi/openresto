import React, { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { FilterChip, MenuFilters } from "@/components/menu/MenuFilters";
import { NO_FILTER, type MenuFilter } from "@/utils/menuFilter";

const onChange = jest.fn();

function Harness({ initial = NO_FILTER }: { initial?: MenuFilter }) {
  const [filter, setFilter] = useState<MenuFilter>(initial);
  return (
    <MenuFilters
      filter={filter}
      onChange={(next) => {
        onChange(next);
        setFilter(next);
      }}
    />
  );
}

describe("FilterChip", () => {
  it("is a checkbox by default and reports its state", () => {
    const onPress = jest.fn();
    render(<FilterChip label="Vegan" selected onPress={onPress} testID="chip" />);
    const chip = screen.getByTestId("chip");
    expect(chip.props.accessibilityRole).toBe("checkbox");
    expect(chip.props.accessibilityState).toEqual({ checked: true });
    expect(chip.props.accessibilityLabel).toBe("Vegan");
  });

  it("can be a radio for one choice out of a few", () => {
    render(
      <FilterChip
        label="Sold out"
        selected={false}
        role="radio"
        onPress={jest.fn()}
        testID="chip"
      />
    );
    const chip = screen.getByTestId("chip");
    expect(chip.props.accessibilityRole).toBe("radio");
    expect(chip.props.accessibilityState).toEqual({ checked: false });
  });

  it("calls onPress when pressed", () => {
    const onPress = jest.fn();
    render(<FilterChip label="Vegan" selected={false} onPress={onPress} testID="chip" />);
    fireEvent.press(screen.getByTestId("chip"));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

describe("MenuFilters", () => {
  beforeEach(() => jest.clearAllMocks());

  it("shows the three diets and keeps the allergens folded away until asked", () => {
    render(<Harness />);
    expect(screen.getByTestId("menu-diet-Vegetarian")).toBeTruthy();
    expect(screen.getByTestId("menu-diet-Vegan")).toBeTruthy();
    expect(screen.getByTestId("menu-diet-GlutenFree")).toBeTruthy();
    expect(screen.queryByTestId("menu-allergen-Gluten")).toBeNull();
    expect(screen.getByTestId("menu-allergens-toggle").props.accessibilityState).toEqual({
      expanded: false,
    });
  });

  it("selects a diet, and a second press unselects it", () => {
    render(<Harness />);
    fireEvent.press(screen.getByTestId("menu-diet-Vegan"));
    expect(onChange).toHaveBeenLastCalledWith({ avoid: [], diets: ["Vegan"] });
    expect(screen.getByTestId("menu-diet-Vegan").props.accessibilityState).toEqual({
      checked: true,
    });

    fireEvent.press(screen.getByTestId("menu-diet-Vegan"));
    expect(onChange).toHaveBeenLastCalledWith({ avoid: [], diets: [] });
    expect(screen.getByTestId("menu-diet-Vegan").props.accessibilityState).toEqual({
      checked: false,
    });
  });

  it("opens the fourteen allergens on the toggle and closes them on a second press", () => {
    render(<Harness />);
    fireEvent.press(screen.getByTestId("menu-allergens-toggle"));
    expect(screen.getAllByTestId(/^menu-allergen-(?!.*toggle)/)).toHaveLength(14);
    expect(screen.getByTestId("menu-allergens-toggle").props.accessibilityState).toEqual({
      expanded: true,
    });

    fireEvent.press(screen.getByTestId("menu-allergens-toggle"));
    expect(screen.queryByTestId("menu-allergen-Gluten")).toBeNull();
  });

  it("selects an allergen to avoid, counts it in the toggle, and unselects it", () => {
    render(<Harness />);
    expect(screen.getByText("Avoid allergens")).toBeTruthy();

    fireEvent.press(screen.getByTestId("menu-allergens-toggle"));
    fireEvent.press(screen.getByTestId("menu-allergen-Gluten"));
    expect(onChange).toHaveBeenLastCalledWith({ avoid: ["Gluten"], diets: [] });
    expect(screen.getByText("Avoiding 1 allergen")).toBeTruthy();

    fireEvent.press(screen.getByTestId("menu-allergen-Milk"));
    expect(screen.getByText("Avoiding 2 allergens")).toBeTruthy();

    fireEvent.press(screen.getByTestId("menu-allergen-Gluten"));
    fireEvent.press(screen.getByTestId("menu-allergen-Milk"));
    expect(onChange).toHaveBeenLastCalledWith({ avoid: [], diets: [] });
    expect(screen.getByText("Avoid allergens")).toBeTruthy();
  });

  it("opens the allergen panel on a pre-selected allergen", () => {
    render(<Harness initial={{ avoid: ["Fish"], diets: [] }} />);
    expect(screen.getByTestId("menu-allergen-Fish").props.accessibilityState).toEqual({
      checked: true,
    });
    expect(screen.getByTestId("menu-allergens-toggle").props.accessibilityState).toEqual({
      expanded: true,
    });
  });

  it("keeps the allergen panel shut for a diet-only pre-selection", () => {
    render(<Harness initial={{ avoid: [], diets: ["Vegan"] }} />);
    expect(screen.queryByTestId("menu-allergen-Fish")).toBeNull();
  });

  it("offers a reset only while a filter is active, and the reset clears both sets", () => {
    render(<Harness />);
    expect(screen.queryByTestId("menu-filters-clear")).toBeNull();

    fireEvent.press(screen.getByTestId("menu-diet-Vegetarian"));
    fireEvent.press(screen.getByTestId("menu-allergens-toggle"));
    fireEvent.press(screen.getByTestId("menu-allergen-Eggs"));
    expect(screen.getByTestId("menu-filters-clear")).toBeTruthy();

    fireEvent.press(screen.getByTestId("menu-filters-clear"));
    expect(onChange).toHaveBeenLastCalledWith(NO_FILTER);
    expect(screen.queryByTestId("menu-filters-clear")).toBeNull();
    expect(screen.getByTestId("menu-diet-Vegetarian").props.accessibilityState).toEqual({
      checked: false,
    });
  });

  describe("disclaimer", () => {
    it("is absent with no filter and the allergen panel closed", () => {
      render(<Harness />);
      expect(screen.queryByTestId("menu-filters-disclaimer")).toBeNull();
    });

    it("appears once a diet is selected", () => {
      render(<Harness />);
      fireEvent.press(screen.getByTestId("menu-diet-Vegan"));
      expect(screen.getByTestId("menu-filters-disclaimer")).toBeTruthy();
    });

    it("appears when the allergen panel is open, even with nothing selected", () => {
      render(<Harness />);
      fireEvent.press(screen.getByTestId("menu-allergens-toggle"));
      expect(screen.getByTestId("menu-filters-disclaimer")).toBeTruthy();
    });

    it("stays while a filter is active though the panel is closed again", () => {
      render(<Harness initial={{ avoid: ["Fish"], diets: [] }} />);
      fireEvent.press(screen.getByTestId("menu-allergens-toggle"));
      expect(screen.queryByTestId("menu-allergen-Fish")).toBeNull();
      expect(screen.getByTestId("menu-filters-disclaimer")).toBeTruthy();
    });

    it("goes away when the filter is cleared and the panel is shut", () => {
      render(<Harness initial={{ avoid: [], diets: ["Vegan"] }} />);
      fireEvent.press(screen.getByTestId("menu-filters-clear"));
      expect(screen.queryByTestId("menu-filters-disclaimer")).toBeNull();
    });
  });
});
