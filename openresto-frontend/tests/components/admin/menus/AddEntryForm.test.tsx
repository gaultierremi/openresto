/**
 * @jest-environment jsdom
 */
import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { AddEntryForm } from "@/components/admin/menus/AddEntryForm";

jest.mock("@/context/BrandContext", () => ({
  useBrand: () => ({ appName: "Open Resto", primaryColor: "#0a7ea4" }),
}));
jest.mock("@/utils/haptics", () => ({
  haptics: { selection: jest.fn(), press: jest.fn(), outcome: jest.fn() },
}));

const renderForm = (props: Partial<React.ComponentProps<typeof AddEntryForm>> = {}) => {
  const onAdd = props.onAdd ?? jest.fn().mockResolvedValue(null);
  render(
    <AddEntryForm
      label="Add a dish"
      placeholder="Dish name"
      onAdd={onAdd}
      testID="add"
      {...props}
    />
  );
  return onAdd as jest.Mock;
};

const open = () => fireEvent.press(screen.getByTestId("add"));

describe("AddEntryForm", () => {
  it("shows only the button until it is pressed", () => {
    renderForm();
    expect(screen.getByText("Add a dish")).toBeTruthy();
    expect(screen.queryByTestId("add-name")).toBeNull();
  });

  it("opens a name field and closes again on Cancel, discarding what was typed", () => {
    renderForm();
    open();
    fireEvent.changeText(screen.getByTestId("add-name"), "Dra");
    fireEvent.press(screen.getByText("Cancel"));
    expect(screen.queryByTestId("add-name")).toBeNull();
    open();
    expect(screen.getByTestId("add-name").props.value).toBe("");
  });

  it("disables Add while the name is empty or only spaces, and enables it once there is one", () => {
    renderForm();
    open();
    expect(screen.getByTestId("add-submit")).toBeDisabled();
    fireEvent.changeText(screen.getByTestId("add-name"), "   ");
    expect(screen.getByTestId("add-submit")).toBeDisabled();
    fireEvent.changeText(screen.getByTestId("add-name"), "Soup");
    expect(screen.getByTestId("add-submit")).not.toBeDisabled();
  });

  it("offers a price field only when a price placeholder is given", () => {
    renderForm();
    open();
    expect(screen.queryByTestId("add-price")).toBeNull();
  });

  it("shows the price field when a price placeholder is given", () => {
    renderForm({ pricePlaceholder: "Price" });
    open();
    expect(screen.getByTestId("add-price")).toBeTruthy();
  });

  it("hands the trimmed name and the untouched price text to onAdd, then closes and clears", async () => {
    const onAdd = renderForm({ pricePlaceholder: "Price" });
    open();
    fireEvent.changeText(screen.getByTestId("add-name"), "  Soup  ");
    fireEvent.changeText(screen.getByTestId("add-price"), " 12,50 ");
    await act(async () => {
      fireEvent.press(screen.getByTestId("add-submit"));
    });
    expect(onAdd).toHaveBeenCalledWith("Soup", " 12,50 ");
    expect(screen.queryByTestId("add-name")).toBeNull();
    open();
    expect(screen.getByTestId("add-name").props.value).toBe("");
    expect(screen.getByTestId("add-price").props.value).toBe("");
  });

  it("stays open with the refusal message and what was typed when onAdd answers a message", async () => {
    const onAdd = renderForm({ onAdd: jest.fn().mockResolvedValue("Name too long") });
    open();
    fireEvent.changeText(screen.getByTestId("add-name"), "Soup");
    await act(async () => {
      fireEvent.press(screen.getByTestId("add-submit"));
    });
    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Name too long")).toBeTruthy();
    expect(screen.getByTestId("add-name").props.value).toBe("Soup");
  });

  it("clears an earlier refusal when the next attempt succeeds", async () => {
    const onAdd = jest.fn().mockResolvedValueOnce("Name too long").mockResolvedValueOnce(null);
    renderForm({ onAdd });
    open();
    fireEvent.changeText(screen.getByTestId("add-name"), "Soup");
    await act(async () => {
      fireEvent.press(screen.getByTestId("add-submit"));
    });
    expect(screen.getByText("Name too long")).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByTestId("add-submit"));
    });
    await waitFor(() => expect(screen.queryByTestId("add-name")).toBeNull());
    expect(screen.queryByText("Name too long")).toBeNull();
  });

  it("drops the refusal message when the form is cancelled", async () => {
    renderForm({ onAdd: jest.fn().mockResolvedValue("Nope") });
    open();
    fireEvent.changeText(screen.getByTestId("add-name"), "Soup");
    await act(async () => {
      fireEvent.press(screen.getByTestId("add-submit"));
    });
    fireEvent.press(screen.getByText("Cancel"));
    open();
    expect(screen.queryByText("Nope")).toBeNull();
  });

  it("works without a testID", () => {
    render(<AddEntryForm label="Add a menu" placeholder="Menu name" onAdd={jest.fn()} />);
    fireEvent.press(screen.getByText("Add a menu"));
    expect(screen.getByLabelText("Menu name")).toBeTruthy();
  });

  it("works without a testID once a price is offered", () => {
    render(
      <AddEntryForm
        label="Add a dish"
        placeholder="Dish name"
        pricePlaceholder="Price"
        onAdd={jest.fn()}
      />
    );
    fireEvent.press(screen.getByText("Add a dish"));
    expect(screen.getByLabelText("Price")).toBeTruthy();
  });
});
