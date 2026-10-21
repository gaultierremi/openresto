import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { RetentionModal } from "@/components/admin/platform/RetentionModal";
import { setPlatformRetention } from "@/api/platform";
import { ok, refused, restaurant } from "@/tests/helpers/platformFixtures";
import { invokeOnPress } from "@/tests/helpers/invokeOnPress";

jest.mock("@/context/BrandContext", () => ({
  useBrand: () => ({ appName: "Open Resto", primaryColor: "#0a7ea4" }),
}));
jest.mock("@/api/platform", () => ({ setPlatformRetention: jest.fn() }));

const setRetention = setPlatformRetention as jest.Mock;
beforeEach(() => setRetention.mockReset());

const MONTHS = "Months after the sitting (1 to 60)";
const RANGE_ERROR = "The retention period must be between 1 and 60 months.";

const open = (months: number | null = 12) => {
  const onSaved = jest.fn();
  const onClose = jest.fn();
  render(
    <RetentionModal
      restaurant={restaurant({ id: 4, bookingRetentionMonths: months })}
      onSaved={onSaved}
      onClose={onClose}
    />
  );
  return { onSaved, onClose };
};

const type = (value: string) => fireEvent.changeText(screen.getByLabelText(MONTHS), value);
const radio = (name: string) => screen.getByRole("radio", { name });
const save = () => screen.getByRole("button", { name: "Save" });

describe("RetentionModal, what it opens on", () => {
  it("opens on the restaurant's period, ready to change", () => {
    open(6);
    expect(radio("Erase after a set period").props.accessibilityState.checked).toBe(true);
    expect(radio("No automatic erasure").props.accessibilityState.checked).toBe(false);
    expect(screen.getByLabelText(MONTHS).props.value).toBe("6");
    expect(screen.getByText(/Bookings older than the period are anonymised/)).toBeTruthy();
  });

  it("opens a restaurant with no period on no automatic erasure, with the default ready to type", () => {
    open(null);
    expect(radio("No automatic erasure").props.accessibilityState.checked).toBe(true);
    expect(
      screen.getByText(/Nothing is erased automatically until a period is fixed/)
    ).toBeTruthy();
    expect(screen.queryByLabelText(MONTHS)).toBeNull();

    fireEvent.press(radio("Erase after a set period"));
    expect(screen.getByLabelText(MONTHS).props.value).toBe("12");
  });
});

describe("RetentionModal, the period", () => {
  it.each([["1"], ["60"], [" 24 "]])("sends %s months", async (typed) => {
    setRetention.mockResolvedValue(ok(restaurant({ id: 4, bookingRetentionMonths: 1 })));
    const { onSaved, onClose } = open();
    type(typed);
    fireEvent.press(save());

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(setRetention).toHaveBeenCalledWith(4, Number(typed.trim()));
    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ id: 4 }));
  });

  it.each([["0"], ["61"], [""], ["12.5"], ["-3"], ["abc"]])(
    "keeps the button off for %p and calls nothing",
    (typed) => {
      open();
      type(typed);
      expect(save()).toBeDisabled();
      fireEvent.press(save());
      expect(setRetention).not.toHaveBeenCalled();
    }
  );

  it.each([["0"], ["61"], [""], ["abc"]])(
    "refuses %p in the handler too, past the disabled button, with the range in words",
    (typed) => {
      const { onSaved, onClose } = open();
      type(typed);
      invokeOnPress("Save");

      expect(setRetention).not.toHaveBeenCalled();
      expect(screen.getByTestId("retention-error")).toHaveTextContent(RANGE_ERROR);
      expect(onSaved).not.toHaveBeenCalled();
      expect(onClose).not.toHaveBeenCalled();
    }
  );

  it("limits the field to three characters", () => {
    open();
    expect(screen.getByLabelText(MONTHS).props.maxLength).toBe(3);
  });
});

describe("RetentionModal, no automatic erasure", () => {
  it("sends null, whatever was typed in the months field", async () => {
    setRetention.mockResolvedValue(ok(restaurant({ id: 4, bookingRetentionMonths: null })));
    const { onSaved, onClose } = open(12);
    type("999");
    fireEvent.press(radio("No automatic erasure"));
    expect(save()).not.toBeDisabled();
    fireEvent.press(save());

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(setRetention).toHaveBeenCalledWith(4, null);
    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ bookingRetentionMonths: null }));
  });
});

describe("RetentionModal, when the call does not go through", () => {
  it("shows the server's refusal and hands nothing up", async () => {
    setRetention.mockResolvedValue(refused("The restaurant is gone.", "platform.not_found"));
    const { onSaved, onClose } = open();
    fireEvent.press(save());

    await waitFor(() => expect(screen.getByTestId("retention-error")).toBeTruthy());
    expect(screen.getByTestId("retention-error")).toHaveTextContent("The restaurant is gone.");
    expect(onSaved).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("words the server's out-of-range refusal in the viewer's language", async () => {
    setRetention.mockResolvedValue(
      refused("English from the server.", "platform.retention_invalid")
    );
    open();
    fireEvent.press(save());

    await waitFor(() => expect(screen.getByTestId("retention-error")).toBeTruthy());
    expect(screen.getByTestId("retention-error")).toHaveTextContent(RANGE_ERROR);
  });

  it("forgets a refusal when the next press goes through", async () => {
    setRetention.mockResolvedValueOnce(refused("The restaurant is gone.", "platform.not_found"));
    setRetention.mockResolvedValueOnce(ok(restaurant({ id: 4 })));
    const { onClose } = open();
    fireEvent.press(save());
    await waitFor(() => expect(screen.getByTestId("retention-error")).toBeTruthy());

    fireEvent.press(save());
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(screen.queryByTestId("retention-error")).toBeNull();
  });

  it("takes no second call while the first is in flight", async () => {
    let finish: (value: unknown) => void = () => {};
    setRetention.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const { onClose } = open();
    fireEvent.press(save());
    invokeOnPress("Save");

    expect(setRetention).toHaveBeenCalledTimes(1);
    finish(ok(restaurant({ id: 4 })));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("cancels without calling anything", () => {
    const { onClose } = open();
    fireEvent.press(screen.getByText("Cancel"));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(setRetention).not.toHaveBeenCalled();
  });
});
