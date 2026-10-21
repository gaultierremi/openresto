/**
 * @jest-environment jsdom
 */
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { MoveButtons } from "@/components/admin/menus/MoveButtons";

jest.mock("@/context/BrandContext", () => ({
  useBrand: () => ({ appName: "Open Resto", primaryColor: "#0a7ea4" }),
}));
jest.mock("@/utils/haptics", () => ({
  haptics: { selection: jest.fn(), press: jest.fn(), outcome: jest.fn() },
}));

const renderButtons = (props: Partial<React.ComponentProps<typeof MoveButtons>> = {}) => {
  const onMove = jest.fn();
  render(
    <MoveButtons
      name="Starters"
      isFirst={false}
      isLast={false}
      onMove={onMove}
      testIDPrefix="row"
      {...props}
    />
  );
  return onMove;
};

const up = () => screen.getByTestId("row-move-up");
const down = () => screen.getByTestId("row-move-down");

describe("MoveButtons", () => {
  it("names what it moves in each arrow's label", () => {
    renderButtons();
    expect(screen.getByLabelText("Move Starters up")).toBeTruthy();
    expect(screen.getByLabelText("Move Starters down")).toBeTruthy();
  });

  it("moves up by -1 and down by 1 in the middle of a list", () => {
    const onMove = renderButtons();
    fireEvent.press(up());
    fireEvent.press(down());
    expect(onMove).toHaveBeenNthCalledWith(1, -1);
    expect(onMove).toHaveBeenNthCalledWith(2, 1);
  });

  it("disables the up arrow on the first row and refuses its press", () => {
    const onMove = renderButtons({ isFirst: true });
    expect(up()).toBeDisabled();
    expect(down()).not.toBeDisabled();
    fireEvent.press(up());
    expect(onMove).not.toHaveBeenCalled();
  });

  it("disables the down arrow on the last row and refuses its press", () => {
    const onMove = renderButtons({ isLast: true });
    expect(down()).toBeDisabled();
    expect(up()).not.toBeDisabled();
    fireEvent.press(down());
    expect(onMove).not.toHaveBeenCalled();
  });

  it("disables both arrows while a previous move is still in flight", () => {
    const onMove = renderButtons({ busy: true });
    expect(up()).toBeDisabled();
    expect(down()).toBeDisabled();
    fireEvent.press(up());
    fireEvent.press(down());
    expect(onMove).not.toHaveBeenCalled();
  });

  it("disables both arrows for a list of one", () => {
    renderButtons({ isFirst: true, isLast: true });
    expect(up()).toBeDisabled();
    expect(down()).toBeDisabled();
  });
});
