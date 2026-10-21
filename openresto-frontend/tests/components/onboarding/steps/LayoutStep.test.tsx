import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { LayoutStep } from "@/components/onboarding/steps/LayoutStep";
import { saveLayout } from "@/api/onboarding";
import { ok, readyState, refused, state } from "@/tests/helpers/onboardingFixtures";
import { stepProps } from "./stepHarness";

jest.mock("@/context/BrandContext", () => ({
  useBrand: () => ({ appName: "Open Resto", primaryColor: "#0a7ea4" }),
}));
jest.mock("@/utils/haptics", () => ({
  haptics: { selection: jest.fn(), press: jest.fn(), outcome: jest.fn() },
}));
jest.mock("@/api/onboarding", () => ({ saveLayout: jest.fn() }));

const mockSave = saveLayout as jest.Mock;

const SAVED = state({
  layout: {
    sections: [
      {
        id: 10,
        name: "Salle",
        tables: [
          { id: 100, name: "T1", seats: 4 },
          { id: 101, name: null, seats: 2 },
        ],
      },
      { id: 11, name: "Terrasse", tables: [{ id: 102, name: "T3", seats: 6 }] },
    ],
  },
});

const press = async () => {
  await act(async () => {
    fireEvent.press(screen.getByTestId("step-layout-continue"));
  });
};

beforeEach(() => jest.clearAllMocks());

describe("LayoutStep", () => {
  it("starts a restaurant with no layout on one room holding one table", () => {
    render(<LayoutStep {...stepProps()} />);
    expect(screen.getByTestId("room-0-name").props.value).toBe("Dining room");
    expect(screen.getByTestId("room-0-table-0")).toBeTruthy();
    expect(screen.queryByTestId("room-0-table-1")).toBeNull();
    expect(screen.queryByTestId("room-1")).toBeNull();
  });

  it("shows the saved rooms and tables with their names and seats", () => {
    render(<LayoutStep {...stepProps({ state: SAVED })} />);
    expect(screen.getByTestId("room-0-name").props.value).toBe("Salle");
    expect(screen.getByTestId("room-1-name").props.value).toBe("Terrasse");
    expect(screen.getByTestId("room-0-table-0-name").props.value).toBe("T1");
    expect(screen.getByTestId("room-0-table-1-name").props.value).toBe("");
    expect(screen.getByTestId("room-0-table-0-seats")).toHaveProp("accessibilityValue", {
      text: "4",
    });
  });

  it("sends the ids of what exists and none for what was added", async () => {
    const saved = readyState();
    mockSave.mockResolvedValue(ok(saved));
    const props = stepProps({ state: SAVED });
    render(<LayoutStep {...props} />);

    fireEvent.press(screen.getByTestId("room-0-add-table"));
    fireEvent.changeText(screen.getByTestId("room-0-table-2-name"), "Bar");
    fireEvent.press(screen.getByTestId("layout-add-room"));
    fireEvent.changeText(screen.getByTestId("room-2-name"), "Patio");

    await press();

    expect(mockSave).toHaveBeenCalledTimes(1);
    expect(mockSave).toHaveBeenCalledWith(7, {
      sections: [
        {
          id: 10,
          name: "Salle",
          tables: [
            { id: 100, name: "T1", seats: 4 },
            { id: 101, name: null, seats: 2 },
            { name: "Bar", seats: 2 },
          ],
        },
        { id: 11, name: "Terrasse", tables: [{ id: 102, name: "T3", seats: 6 }] },
        { name: "Patio", tables: [{ name: null, seats: 2 }] },
      ],
    });
    expect(props.onState).toHaveBeenCalledWith(saved);
    expect(props.onAdvance).toHaveBeenCalledTimes(1);
  });

  it("changes seats one at a time within 1 to 50", () => {
    render(<LayoutStep {...stepProps({ state: SAVED })} />);
    const seats = () => screen.getByTestId("room-0-table-0-seats").props.accessibilityValue.text;
    fireEvent.press(screen.getAllByLabelText("One seat more")[0]);
    expect(seats()).toBe("5");
    fireEvent.press(screen.getAllByLabelText("One seat fewer")[0]);
    fireEvent.press(screen.getAllByLabelText("One seat fewer")[0]);
    expect(seats()).toBe("3");
  });

  it("stops the seats at 1 and at 50", () => {
    const one = state({
      layout: { sections: [{ id: 1, name: "S", tables: [{ id: 1, name: null, seats: 1 }] }] },
    });
    const fifty = state({
      layout: { sections: [{ id: 1, name: "S", tables: [{ id: 1, name: null, seats: 50 }] }] },
    });
    const { unmount } = render(<LayoutStep {...stepProps({ state: one })} />);
    expect(screen.getByLabelText("One seat fewer").props.accessibilityState.disabled).toBe(true);
    unmount();
    render(<LayoutStep {...stepProps({ state: fifty })} />);
    expect(screen.getByLabelText("One seat more").props.accessibilityState.disabled).toBe(true);
  });

  describe("at least one table", () => {
    it("disables Continue and says why when the last table is removed", async () => {
      const props = stepProps();
      render(<LayoutStep {...props} />);
      expect(screen.getByTestId("step-layout-continue").props.accessibilityState.disabled).toBe(
        false
      );

      fireEvent.press(screen.getByTestId("room-0-table-0-remove"));

      expect(screen.getByTestId("step-layout-continue").props.accessibilityState.disabled).toBe(
        true
      );
      expect(screen.getByTestId("layout-none")).toHaveTextContent("Add at least one table.");
      await press();
      expect(mockSave).not.toHaveBeenCalled();
    });

    it("enables it again once a table is added", () => {
      render(<LayoutStep {...stepProps()} />);
      fireEvent.press(screen.getByTestId("room-0-table-0-remove"));
      fireEvent.press(screen.getByTestId("room-0-add-table"));
      expect(screen.getByTestId("step-layout-continue").props.accessibilityState.disabled).toBe(
        false
      );
      expect(screen.queryByTestId("layout-none")).toBeNull();
    });

    it("counts a room with no tables as no table", () => {
      render(<LayoutStep {...stepProps()} />);
      fireEvent.press(screen.getByTestId("room-0-remove"));
      fireEvent.press(screen.getByTestId("layout-add-room"));
      fireEvent.press(screen.getByTestId("room-0-table-0-remove"));
      expect(screen.getByTestId("layout-none")).toBeTruthy();
    });
  });

  it("removes a room, and the request no longer names it", async () => {
    mockSave.mockResolvedValue(ok(readyState()));
    render(<LayoutStep {...stepProps({ state: SAVED })} />);
    fireEvent.press(screen.getByTestId("room-1-remove"));
    expect(screen.queryByTestId("room-1")).toBeNull();

    await press();

    expect(mockSave.mock.calls[0][1].sections.map((s: { id: number }) => s.id)).toEqual([10]);
  });

  it("refuses an unnamed room on the press, sending nothing", async () => {
    const props = stepProps({ state: SAVED });
    render(<LayoutStep {...props} />);
    fireEvent.changeText(screen.getByTestId("room-1-name"), "   ");

    await press();

    expect(mockSave).not.toHaveBeenCalled();
    expect(props.onAdvance).not.toHaveBeenCalled();
    expect(screen.getByTestId("room-1-name-field-error")).toHaveTextContent(
      "Every room needs a name, and every table between 1 and 50 seats."
    );
    expect(screen.queryByTestId("room-0-name-field-error")).toBeNull();
  });

  it("takes the unnamed-room message away once the room is named", async () => {
    render(<LayoutStep {...stepProps({ state: SAVED })} />);
    fireEvent.changeText(screen.getByTestId("room-1-name"), "");
    await press();
    fireEvent.changeText(screen.getByTestId("room-1-name"), "Patio");
    expect(screen.queryByTestId("room-1-name-field-error")).toBeNull();
  });

  describe("a table with an upcoming booking", () => {
    const refusal = () =>
      refused(
        "A room or table with upcoming bookings (2) cannot be removed. Nothing was changed.",
        409,
        "onboarding.layout_in_use"
      );

    it("shows the refusal as a readable message and does not advance", async () => {
      mockSave.mockResolvedValue(refusal());
      const props = stepProps({ state: SAVED });
      render(<LayoutStep {...props} />);
      fireEvent.press(screen.getByTestId("room-0-table-0-remove"));

      await press();

      expect(screen.getByTestId("step-layout-banner")).toHaveTextContent(
        "A room or table with upcoming bookings (2) cannot be removed. Nothing was changed."
      );
      expect(props.onAdvance).not.toHaveBeenCalled();
      expect(props.onState).not.toHaveBeenCalled();
    });

    it("keeps the form exactly as it was, edits included", async () => {
      mockSave.mockResolvedValue(refusal());
      render(<LayoutStep {...stepProps({ state: SAVED })} />);
      fireEvent.press(screen.getByTestId("room-0-table-0-remove"));
      fireEvent.changeText(screen.getByTestId("room-0-name"), "Grande salle");
      fireEvent.press(screen.getByTestId("layout-add-room"));

      await press();

      expect(screen.getByTestId("room-0-name").props.value).toBe("Grande salle");
      expect(screen.getByTestId("room-0-table-0-name").props.value).toBe("");
      expect(screen.queryByTestId("room-0-table-1")).toBeNull();
      expect(screen.getByTestId("room-2")).toBeTruthy();
    });

    it("lets the next press try again", async () => {
      mockSave.mockResolvedValueOnce(refusal()).mockResolvedValueOnce(ok(readyState()));
      const props = stepProps({ state: SAVED });
      render(<LayoutStep {...props} />);
      fireEvent.press(screen.getByTestId("room-0-table-0-remove"));
      await press();
      expect(props.onAdvance).not.toHaveBeenCalled();

      await press();

      expect(mockSave).toHaveBeenCalledTimes(2);
      expect(screen.queryByTestId("step-layout-banner")).toBeNull();
      expect(props.onAdvance).toHaveBeenCalledTimes(1);
    });
  });

  it("ends the session on a 401", async () => {
    mockSave.mockResolvedValue(refused("x", 401));
    const props = stepProps({ state: SAVED });
    render(<LayoutStep {...props} />);
    await press();
    expect(props.onExpired).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("step-layout-banner")).toBeNull();
  });

  it("does not offer to skip: a table is required", () => {
    render(<LayoutStep {...stepProps()} />);
    expect(screen.queryByTestId("step-layout-skip")).toBeNull();
  });

  it("goes back from its Back button", () => {
    const props = stepProps();
    render(<LayoutStep {...props} />);
    fireEvent.press(screen.getByTestId("step-layout-back"));
    expect(props.onBack).toHaveBeenCalledTimes(1);
  });

  it("is read-only on a suspended restaurant: no save, only Next", () => {
    const props = stepProps({ readOnly: true, state: SAVED });
    render(<LayoutStep {...props} />);
    expect(screen.getByTestId("room-0-name").props.editable).toBe(false);
    expect(screen.getByTestId("step-layout-form").props.pointerEvents).toBe("none");
    expect(screen.queryByTestId("step-layout-continue")).toBeNull();
    fireEvent.press(screen.getByTestId("step-layout-next"));
    expect(props.onAdvance).toHaveBeenCalledTimes(1);
    expect(mockSave).not.toHaveBeenCalled();
  });
});
