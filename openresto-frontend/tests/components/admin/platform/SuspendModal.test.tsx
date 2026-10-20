import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { SuspendModal } from "@/components/admin/platform/SuspendModal";
import { suspendPlatformRestaurant } from "@/api/platform";
import { ok, refused, restaurant } from "@/tests/helpers/platformFixtures";

jest.mock("@/context/BrandContext", () => ({
  useBrand: () => ({ appName: "Open Resto", primaryColor: "#0a7ea4" }),
}));
jest.mock("@/api/platform", () => ({ suspendPlatformRestaurant: jest.fn() }));

const suspend = suspendPlatformRestaurant as jest.Mock;
beforeEach(() => suspend.mockReset());

const open = () => {
  const onSaved = jest.fn();
  const onClose = jest.fn();
  render(<SuspendModal restaurant={restaurant({ id: 4 })} onSaved={onSaved} onClose={onClose} />);
  return { onSaved, onClose };
};

describe("SuspendModal", () => {
  it("explains that the restaurateur sees the reason and the restaurant disappears at once", () => {
    open();
    expect(screen.getByText(/The restaurateur sees the reason you give below/)).toBeTruthy();
    expect(screen.getByText(/the restaurant disappears from guests at once/)).toBeTruthy();
  });

  it("counts the reason against its 300-character limit and enforces it on the field", () => {
    open();
    fireEvent.changeText(screen.getByLabelText("Reason (optional)"), "Unpaid");
    expect(screen.getByTestId("suspend-counter")).toHaveTextContent("6 / 300");
    expect(screen.getByLabelText("Reason (optional)").props.maxLength).toBe(300);
  });

  it("calls nothing until the confirmation is accepted", () => {
    open();
    fireEvent.changeText(screen.getByLabelText("Reason (optional)"), "Unpaid invoice");
    fireEvent.press(screen.getByText("Continue"));

    expect(screen.getByText("Suspend Chez Léa?")).toBeTruthy();
    expect(suspend).not.toHaveBeenCalled();
  });

  it("sends the trimmed reason once the confirmation is accepted, then hands the row up and closes", async () => {
    suspend.mockResolvedValue(ok(restaurant({ id: 4, status: "Suspended" })));
    const { onSaved, onClose } = open();
    fireEvent.changeText(screen.getByLabelText("Reason (optional)"), "  Unpaid invoice ");
    fireEvent.press(screen.getByText("Continue"));
    fireEvent.press(screen.getByText("Yes, suspend"));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(suspend).toHaveBeenCalledWith(4, "Unpaid invoice");
    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ id: 4, status: "Suspended" }));
  });

  it("sends no reason at all when it was left blank", async () => {
    suspend.mockResolvedValue(ok(restaurant({ id: 4, status: "Suspended" })));
    const { onClose } = open();
    fireEvent.changeText(screen.getByLabelText("Reason (optional)"), "    ");
    fireEvent.press(screen.getByText("Continue"));
    fireEvent.press(screen.getByText("Yes, suspend"));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(suspend).toHaveBeenCalledWith(4, null);
  });

  it("goes back from the confirmation to the reason, keeping what was typed, with no call", () => {
    open();
    fireEvent.changeText(screen.getByLabelText("Reason (optional)"), "Unpaid invoice");
    fireEvent.press(screen.getByText("Continue"));
    fireEvent.press(screen.getByText("Back"));

    expect(screen.getByLabelText("Reason (optional)").props.value).toBe("Unpaid invoice");
    expect(suspend).not.toHaveBeenCalled();
  });

  it("shows the server's refusal on the confirmation and leaves the row untouched", async () => {
    suspend.mockResolvedValue(
      refused("This restaurant is already suspended.", "platform.already_suspended")
    );
    const { onSaved, onClose } = open();
    fireEvent.press(screen.getByText("Continue"));
    fireEvent.press(screen.getByText("Yes, suspend"));

    await waitFor(() => expect(screen.getByTestId("suspend-error")).toBeTruthy());
    expect(screen.getByTestId("suspend-error")).toHaveTextContent(
      "This restaurant is already suspended."
    );
    expect(onSaved).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("forgets a refusal when the admin steps back", async () => {
    suspend.mockResolvedValue(
      refused("This restaurant is already suspended.", "platform.already_suspended")
    );
    open();
    fireEvent.press(screen.getByText("Continue"));
    fireEvent.press(screen.getByText("Yes, suspend"));
    await waitFor(() => expect(screen.getByTestId("suspend-error")).toBeTruthy());

    fireEvent.press(screen.getByText("Back"));
    fireEvent.press(screen.getByText("Continue"));
    expect(screen.queryByTestId("suspend-error")).toBeNull();
  });

  it("takes no second confirmation while the first call is in flight", async () => {
    let finish: (value: unknown) => void = () => {};
    suspend.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const { onClose } = open();
    fireEvent.press(screen.getByText("Continue"));
    fireEvent.press(screen.getByText("Yes, suspend"));
    fireEvent.press(screen.getByText("Yes, suspend"));
    expect(suspend).toHaveBeenCalledTimes(1);
    finish(ok(restaurant({ status: "Suspended" })));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("cancels from the reason step without calling anything", () => {
    const { onClose } = open();
    fireEvent.press(screen.getByText("Cancel"));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(suspend).not.toHaveBeenCalled();
  });
});
