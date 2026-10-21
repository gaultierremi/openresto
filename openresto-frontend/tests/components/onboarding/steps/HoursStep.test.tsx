import React from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react-native";
import { HoursStep } from "@/components/onboarding/steps/HoursStep";
import { saveHours } from "@/api/onboarding";
import { ok, readyState, refused, state } from "@/tests/helpers/onboardingFixtures";
import { stepProps } from "./stepHarness";

jest.mock("@/context/BrandContext", () => ({
  useBrand: () => ({ appName: "Open Resto", primaryColor: "#0a7ea4" }),
}));
jest.mock("@/utils/haptics", () => ({
  haptics: { selection: jest.fn(), press: jest.fn(), outcome: jest.fn() },
}));
jest.mock("@/api/onboarding", () => ({ saveHours: jest.fn() }));
jest.mock("@/components/common/TimePicker", () => {
  const { Pressable, Text } = require("react-native");
  return {
    __esModule: true,
    default: ({
      selectedTime,
      onSelect,
    }: {
      selectedTime: string;
      onSelect: (t: string) => void;
    }) => (
      <Pressable testID={`time-${selectedTime}`} onPress={() => onSelect("11:15")}>
        <Text>{selectedTime}</Text>
      </Pressable>
    ),
  };
});
jest.mock("@/components/common/Select", () => {
  const { Pressable, Text, View } = require("react-native");
  return {
    __esModule: true,
    default: ({
      options,
      selectedValue,
      onSelect,
    }: {
      options: { label: string; value: number }[];
      selectedValue: number;
      onSelect: (v: number) => void;
    }) => (
      <View>
        <Text testID="duration-selected">{String(selectedValue)}</Text>
        {options.map((o) => (
          <Pressable key={o.value} testID={`duration-${o.value}`} onPress={() => onSelect(o.value)}>
            <Text>{o.label}</Text>
          </Pressable>
        ))}
      </View>
    ),
  };
});

const mockSave = saveHours as jest.Mock;

const row = (day: number) => within(screen.getByTestId(`hours-row-${day}`));
const toggle = (day: number, dayName: string) =>
  fireEvent.press(screen.getByRole("switch", { name: `${dayName}: open` }));
const press = async () => {
  await act(async () => {
    fireEvent.press(screen.getByTestId("step-hours-continue"));
  });
};

beforeEach(() => jest.clearAllMocks());

describe("HoursStep", () => {
  it("shows the seven days, Monday first, closed where the server listed no entry", () => {
    render(<HoursStep {...stepProps({ state: readyState() })} />);
    for (let day = 1; day <= 7; day++) expect(screen.getByTestId(`hours-row-${day}`)).toBeTruthy();
    expect(row(2).queryByText("Closed")).toBeNull();
    expect(row(1).getByText("Closed")).toBeTruthy();
    expect(row(2).getByText("12:00")).toBeTruthy();
    expect(row(2).getByText("22:00")).toBeTruthy();
  });

  it("opens a day with its switch, and closes it again", () => {
    render(<HoursStep {...stepProps()} />);
    expect(row(1).getByText("Closed")).toBeTruthy();

    toggle(1, "Monday");
    expect(row(1).queryByText("Closed")).toBeNull();
    expect(row(1).getByText("09:00")).toBeTruthy();

    toggle(1, "Monday");
    expect(row(1).getByText("Closed")).toBeTruthy();
  });

  describe("at least one open day", () => {
    it("disables Continue and says why when every day is closed", async () => {
      const props = stepProps();
      render(<HoursStep {...props} />);
      expect(screen.getByTestId("step-hours-continue").props.accessibilityState.disabled).toBe(
        true
      );
      expect(screen.getByTestId("hours-none")).toHaveTextContent(
        "Open at least one day of the week."
      );

      await press();
      expect(mockSave).not.toHaveBeenCalled();
      expect(props.onAdvance).not.toHaveBeenCalled();
    });

    it("enables Continue with a single open day", () => {
      render(<HoursStep {...stepProps()} />);
      toggle(3, "Wednesday");
      expect(screen.getByTestId("step-hours-continue").props.accessibilityState.disabled).toBe(
        false
      );
      expect(screen.queryByTestId("hours-none")).toBeNull();
    });

    it("disables Continue again when the last open day is closed", () => {
      render(<HoursStep {...stepProps({ state: readyState() })} />);
      expect(screen.getByTestId("step-hours-continue").props.accessibilityState.disabled).toBe(
        false
      );
      toggle(2, "Tuesday");
      expect(screen.getByTestId("step-hours-continue").props.accessibilityState.disabled).toBe(
        true
      );
    });
  });

  it("saves only the open days, with their times and the sitting length, then moves on", async () => {
    const saved = readyState();
    mockSave.mockResolvedValue(ok(saved));
    const props = stepProps();
    render(<HoursStep {...props} />);
    toggle(5, "Friday");
    fireEvent.press(row(5).getByTestId("time-09:00"));
    fireEvent.press(screen.getByTestId("duration-120"));

    await press();

    expect(mockSave).toHaveBeenCalledWith(7, {
      openHours: [{ day: 5, open: "11:15", close: "22:00" }],
      defaultBookingDurationMinutes: 120,
    });
    expect(props.onState).toHaveBeenCalledWith(saved);
    expect(props.onAdvance).toHaveBeenCalledTimes(1);
  });

  it("changes the closing time of a day on its own", async () => {
    mockSave.mockResolvedValue(ok(readyState()));
    render(<HoursStep {...stepProps({ state: readyState() })} />);
    fireEvent.press(row(2).getByTestId("time-22:00"));
    await press();
    expect(mockSave.mock.calls[0][1].openHours).toEqual([
      { day: 2, open: "12:00", close: "11:15" },
    ]);
  });

  describe("booking duration", () => {
    it("offers the lengths the server accepts, and no other", () => {
      render(<HoursStep {...stepProps()} />);
      const offered = screen
        .getAllByTestId(/^duration-\d+$/)
        .map((n) => Number(n.props.testID.replace("duration-", "")));
      expect(offered).toEqual([30, 60, 90, 120, 150, 180, 240, 300, 360, 420, 480]);
      expect(screen.getByText("1 h 30")).toBeTruthy();
      expect(screen.getByText("30 min")).toBeTruthy();
      expect(screen.getByText("2 h")).toBeTruthy();
    });

    it("starts on the saved length", () => {
      render(
        <HoursStep
          {...stepProps({
            state: state({ hours: { openHours: [], defaultBookingDurationMinutes: 150 } }),
          })}
        />
      );
      expect(screen.getByTestId("duration-selected")).toHaveTextContent("150");
    });

    it("starts on 90 minutes when the saved length is one the server would refuse", () => {
      render(
        <HoursStep
          {...stepProps({
            state: state({ hours: { openHours: [], defaultBookingDurationMinutes: 45 } }),
          })}
        />
      );
      expect(screen.getByTestId("duration-selected")).toHaveTextContent("90");
    });
  });

  describe("copy to all days", () => {
    it("puts the first open day's times on every day without opening a closed one", async () => {
      mockSave.mockResolvedValue(ok(readyState()));
      render(<HoursStep {...stepProps({ state: readyState() })} />);
      toggle(4, "Thursday");
      fireEvent.press(row(4).getByTestId("time-09:00"));
      expect(row(4).getByText("11:15")).toBeTruthy();

      fireEvent.press(screen.getByTestId("hours-copy"));

      expect(row(4).getByText("12:00")).toBeTruthy();
      expect(row(1).getByText("Closed")).toBeTruthy();
      await press();
      expect(mockSave.mock.calls[0][1].openHours).toEqual([
        { day: 2, open: "12:00", close: "22:00" },
        { day: 4, open: "12:00", close: "22:00" },
      ]);
    });

    it("is unavailable until a day is open", () => {
      render(<HoursStep {...stepProps()} />);
      expect(screen.getByTestId("hours-copy").props.accessibilityState.disabled).toBe(true);
    });
  });

  describe("a refused save", () => {
    it("shows the server's message and does not advance or replace the state", async () => {
      mockSave.mockResolvedValue(
        refused("Closing time is invalid.", 400, "restaurant.open_hours_time_invalid")
      );
      const props = stepProps({ state: readyState() });
      render(<HoursStep {...props} />);

      await press();

      expect(screen.getByTestId("step-hours-banner")).toHaveTextContent("Closing time is invalid.");
      expect(props.onAdvance).not.toHaveBeenCalled();
      expect(props.onState).not.toHaveBeenCalled();
      expect(row(2).getByText("12:00")).toBeTruthy();
    });

    it("shows the no-open-day refusal if the server ever sends it", async () => {
      mockSave.mockResolvedValue(
        refused("Open at least one day of the week.", 400, "onboarding.hours_no_open_day")
      );
      render(<HoursStep {...stepProps({ state: readyState() })} />);
      await press();
      expect(screen.getByTestId("step-hours-banner")).toHaveTextContent(
        "Open at least one day of the week."
      );
    });

    it("ends the session on a 401", async () => {
      mockSave.mockResolvedValue(refused("x", 401));
      const props = stepProps({ state: readyState() });
      render(<HoursStep {...props} />);
      await press();
      expect(props.onExpired).toHaveBeenCalledTimes(1);
      expect(screen.queryByTestId("step-hours-banner")).toBeNull();
    });
  });

  it("does not offer to skip: the hours are required", () => {
    render(<HoursStep {...stepProps()} />);
    expect(screen.queryByTestId("step-hours-skip")).toBeNull();
  });

  it("goes back from its Back button", () => {
    const props = stepProps();
    render(<HoursStep {...props} />);
    fireEvent.press(screen.getByTestId("step-hours-back"));
    expect(props.onBack).toHaveBeenCalledTimes(1);
  });

  it("is read-only on a suspended restaurant: no save, only Next", () => {
    const props = stepProps({ readOnly: true, state: readyState({ status: "Suspended" }) });
    render(<HoursStep {...props} />);
    expect(screen.getByTestId("step-hours-form").props.pointerEvents).toBe("none");
    expect(screen.queryByTestId("step-hours-continue")).toBeNull();
    fireEvent.press(screen.getByTestId("step-hours-next"));
    expect(props.onAdvance).toHaveBeenCalledTimes(1);
    expect(mockSave).not.toHaveBeenCalled();
  });
});
