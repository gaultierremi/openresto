import React from "react";
import { render, screen, fireEvent } from "@testing-library/react-native";
import { StyleSheet, type ViewStyle } from "react-native";
import { RowTextButton } from "@/components/common/RowTextButton";

jest.mock("@expo/vector-icons", () => ({
  Ionicons: ({ name }: { name: string }) =>
    require("react").createElement("Text", { testID: `icon-${name}` }, name),
}));

const resolvedStyle = () => StyleSheet.flatten(screen.getByRole("button").props.style) as ViewStyle;

/**
 * The leading glyph is decorative — <Icon> hides it from the accessibility tree on purpose —
 * so it is only reachable with hidden elements included.
 */
const queryIcon = (name: string) =>
  screen.queryByTestId(`icon-${name}`, { includeHiddenElements: true });

describe("RowTextButton", () => {
  const baseProps = { label: "Edit", color: "#0a7ea4" };

  it("renders its label", () => {
    render(<RowTextButton {...baseProps} />);
    expect(screen.getByText("Edit")).toBeTruthy();
  });

  it("calls onPress when tapped", () => {
    const onPress = jest.fn();
    render(<RowTextButton {...baseProps} onPress={onPress} />);
    fireEvent.press(screen.getByRole("button"));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("falls back to the label for the accessibility label", () => {
    render(<RowTextButton {...baseProps} />);
    expect(screen.getByLabelText("Edit")).toBeTruthy();
  });

  it("prefers an explicit accessibilityLabel over the label", () => {
    render(<RowTextButton {...baseProps} accessibilityLabel="Edit the Patio section" />);
    expect(screen.getByLabelText("Edit the Patio section")).toBeTruthy();
    expect(screen.queryByLabelText("Edit")).toBeNull();
  });

  it("renders a leading icon when one is supplied", () => {
    render(<RowTextButton {...baseProps} icon="pencil" />);
    expect(queryIcon("pencil")).toBeTruthy();
  });

  it("keeps the leading icon out of the accessibility tree", () => {
    render(<RowTextButton {...baseProps} icon="pencil" />);
    expect(screen.queryByTestId("icon-pencil")).toBeNull();
  });

  it("renders no icon by default", () => {
    render(<RowTextButton {...baseProps} />);
    expect(screen.queryByTestId(/^icon-/, { includeHiddenElements: true })).toBeNull();
  });

  it("applies the passed testID", () => {
    render(<RowTextButton {...baseProps} testID="edit-section" />);
    expect(screen.getByTestId("edit-section")).toBeTruthy();
  });

  it("is enabled and undimmed at rest", () => {
    render(<RowTextButton {...baseProps} />);
    expect(screen.getByRole("button").props.accessibilityState).toEqual({ disabled: false });
    expect(resolvedStyle().opacity).toBeUndefined();
  });

  it("dims to 0.6 under the finger and not at rest", () => {
    render(<RowTextButton {...baseProps} />);
    // The rendered node carries the style already resolved for "not pressed", so the press state
    // is reached through the callback the Pressable was handed.
    let node = screen.getByRole("button").parent;
    while (node && typeof node.props?.style !== "function") {
      node = node.parent;
    }
    const styleFn = node?.props.style as (state: { pressed: boolean }) => unknown[];
    expect(styleFn({ pressed: true })).toContainEqual({ opacity: 0.6 });
    expect(styleFn({ pressed: false })).not.toContainEqual({ opacity: 0.6 });
  });

  it("dims to 0.5 when disabled", () => {
    render(<RowTextButton {...baseProps} disabled />);
    expect(resolvedStyle().opacity).toBe(0.5);
  });

  it("marks itself disabled for assistive tech and ignores presses", () => {
    const onPress = jest.fn();
    render(<RowTextButton {...baseProps} disabled onPress={onPress} />);
    expect(screen.getByRole("button").props.accessibilityState).toEqual({ disabled: true });
    fireEvent.press(screen.getByRole("button"));
    expect(onPress).not.toHaveBeenCalled();
  });

  it("borders with the supplied color", () => {
    render(<RowTextButton {...baseProps} color="#c00" />);
    expect(resolvedStyle().borderColor).toBe("#c00");
  });

  it("merges a caller-supplied style over its own", () => {
    render(<RowTextButton {...baseProps} style={{ marginLeft: 8 }} />);
    expect(resolvedStyle().marginLeft).toBe(8);
  });

  /* A plain action carries no selection state — see "is enabled and undimmed at rest" above,
     which pins accessibilityState to exactly { disabled: false }. */
  it("fills with its color and announces the state when selected", () => {
    render(<RowTextButton {...baseProps} label="Pin" selected color="#0a7ea4" />);
    expect(resolvedStyle().backgroundColor).toBe("#0a7ea4");
    expect(screen.getByRole("button").props.accessibilityState).toMatchObject({ selected: true });
  });

  it("stays unfilled but still announces the state when deselected", () => {
    render(<RowTextButton {...baseProps} label="Pin" selected={false} />);
    expect(resolvedStyle().backgroundColor).toBeUndefined();
    expect(screen.getByRole("button").props.accessibilityState).toMatchObject({ selected: false });
  });

  describe("as a radio", () => {
    // The `aria-*` prop is only visible on the component element, not on the host node.
    const ariaChecked = (testID: string) =>
      screen
        .UNSAFE_getAllByProps({ testID })
        .map((node) => node.props["aria-checked"])
        .find((value) => value !== undefined);

    it("is a radio announcing checked through aria-checked and accessibilityState when selected", () => {
      render(<RowTextButton {...baseProps} radio selected testID="pill" />);
      expect(screen.getByRole("radio")).toBeTruthy();
      expect(screen.queryByRole("button")).toBeNull();
      expect(ariaChecked("pill")).toBe(true);
      expect(screen.getByRole("radio").props.accessibilityState).toEqual({
        disabled: false,
        checked: true,
      });
    });

    it("announces unchecked when it is the one not chosen", () => {
      render(<RowTextButton {...baseProps} radio selected={false} testID="pill" />);
      expect(screen.getByRole("radio")).toBeTruthy();
      expect(ariaChecked("pill")).toBe(false);
      expect(screen.getByRole("radio").props.accessibilityState).toEqual({
        disabled: false,
        checked: false,
      });
    });

    it("moves the checked state with the selection and still presses", () => {
      const onPress = jest.fn();
      const view = render(
        <RowTextButton {...baseProps} radio selected={false} testID="pill" onPress={onPress} />
      );
      fireEvent.press(screen.getByRole("radio"));
      expect(onPress).toHaveBeenCalledTimes(1);
      view.rerender(
        <RowTextButton {...baseProps} radio selected testID="pill" onPress={onPress} />
      );
      expect(ariaChecked("pill")).toBe(true);
    });

    it("keeps announcing a disabled radio as disabled", () => {
      render(<RowTextButton {...baseProps} radio selected disabled />);
      expect(screen.getByRole("radio").props.accessibilityState).toEqual({
        disabled: true,
        checked: true,
      });
    });

    it("stays a plain button when there is no selection to announce", () => {
      render(<RowTextButton {...baseProps} radio testID="pill" />);
      expect(screen.getByRole("button").props.accessibilityState).toEqual({ disabled: false });
      expect(screen.queryByRole("radio")).toBeNull();
      expect(ariaChecked("pill")).toBeUndefined();
    });

    it.each([true, false])(
      "is not a radio without the radio prop, even when selected=%s",
      (selected) => {
        render(<RowTextButton {...baseProps} selected={selected} testID="pill" />);
        expect(screen.getByRole("button")).toBeTruthy();
        expect(screen.queryByRole("radio")).toBeNull();
        expect(ariaChecked("pill")).toBeUndefined();
        expect(screen.getByRole("button").props.accessibilityState).toEqual({
          disabled: false,
          selected,
        });
      }
    );
  });

  it("reaches the 44px touch target through hitSlop", () => {
    render(<RowTextButton {...baseProps} />);
    expect(screen.getByRole("button").props.hitSlop).toEqual({
      top: 10,
      bottom: 10,
      left: 8,
      right: 8,
    });
  });
});
