/** @jest-environment jsdom */
import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { OperationsDashboard } from "@/components/onboarding/OperationsDashboard";
import * as api from "@/api/operations";
import { downloadCsv } from "@/utils/downloadCsv";
import { ok, refused } from "@/tests/helpers/onboardingFixtures";

jest.mock("@/api/operations");
jest.mock("@/utils/downloadCsv");
jest.mock("@/context/BrandContext", () => ({
  useBrand: () => ({ appName: "OpenResto", primaryColor: "#0a7ea4" }),
}));
jest.mock("@/utils/haptics", () => ({
  haptics: { selection: jest.fn(), press: jest.fn(), outcome: jest.fn() },
}));
jest.mock("@/context/LocaleContext", () => ({ useRouteDefaultLocale: jest.fn() }));
const mockExpire = jest.fn(),
  mockSignOut = jest.fn(),
  mockPush = jest.fn();
jest.mock("@/context/OnboardingSessionContext", () => ({
  useOnboardingSession: () => ({ expire: mockExpire, signOut: mockSignOut }),
}));
jest.mock("expo-router", () => ({ useRouter: () => ({ push: mockPush, replace: jest.fn() }) }));

const data = (over: Partial<api.OperationsData> = {}): api.OperationsData => ({
  name: "Chez Paul",
  timezone: "Europe/Brussels",
  status: "Published",
  today: "2026-10-22",
  days: [
    { date: "2026-10-22", bookings: 1, covers: 2, noShows: 0, fillRate: 12.5 },
    { date: "2026-10-23", bookings: 1, covers: 4, noShows: 1, fillRate: null },
  ],
  bookings: [
    {
      id: 1,
      reference: "ABC",
      name: "Alice",
      email: "alice@example.test",
      date: "2026-10-22T17:00:00Z",
      seats: 2,
      status: "Booked",
      cancelled: false,
      reminder: "simulated",
      nextStatuses: ["Arrived", "NoShow"],
    },
    {
      id: 2,
      reference: "DEF",
      name: null,
      email: null,
      date: "2026-10-23T17:00:00Z",
      seats: 4,
      status: "Booked",
      cancelled: true,
      reminder: null,
      nextStatuses: [],
    },
  ],
  dishes: [{ name: "Carbonade", views: 42 }],
  exceptions: [{ date: "2026-12-25", closed: true, open: "00:00", close: "00:00" }],
  simulateEmailReminders: true,
  ...over,
});
const mockApi = jest.mocked(api);
const press = async (label: string) => {
  await act(async () => {
    fireEvent.press(screen.getByText(label));
  });
};
const open = async (over: Partial<api.OperationsData> = {}) => {
  mockApi.getOperations.mockResolvedValue(ok(data(over)));
  render(<OperationsDashboard restaurantId={7} />);
  await screen.findByTestId("operations-dashboard");
};
beforeEach(() => {
  jest.clearAllMocks();
  mockApi.getOperationsWaitlist.mockResolvedValue(
    ok({ restaurantId: 7, acceptingGuests: false, entries: [] })
  );
  for (const name of [
    "saveException",
    "removeException",
    "setReminderMode",
    "setOperationsStatus",
    "addOperationsWaitlist",
    "actOnOperationsWaitlist",
  ] as const)
    mockApi[name].mockResolvedValue(ok(undefined));
  mockApi.exportOperations.mockResolvedValue(ok("csv"));
});

it("shows local times, changes period, exports CSV, refreshes and opens setup", async () => {
  await open();
  expect(screen.getByText(/07:00 PM · Alice|19:00 · Alice/)).toBeTruthy();
  expect(screen.queryByTestId("booking-2")).toBeNull();
  fireEvent.press(screen.getByTestId("period-week"));
  expect(screen.getByTestId("booking-2")).toBeTruthy();
  await press("Export this week (CSV)");
  expect(downloadCsv).toHaveBeenCalledWith("csv");
  await press("Edit my restaurant");
  expect(mockPush).toHaveBeenCalledWith("/onboarding/restaurant/7");
  await press("Sign out");
  expect(mockSignOut).toHaveBeenCalled();
  await press("Refresh");
  expect(mockApi.getOperations).toHaveBeenCalledTimes(2);
});

it("commits statuses and special hours and removes an exception", async () => {
  await open();
  await press("Arrived");
  expect(mockApi.setOperationsStatus).toHaveBeenCalledWith(7, 1, "Arrived");
  await screen.findByTestId("operations-dashboard");
  await press("Remove");
  expect(mockApi.removeException).toHaveBeenCalledWith(7, "2026-12-25");
  await screen.findByTestId("operations-dashboard");
  fireEvent.changeText(screen.getByTestId("exception-date"), "2026-12-31");
  fireEvent(screen.getByLabelText("Closed that day"), "valueChange", false);
  fireEvent.changeText(screen.getByTestId("exception-open"), "18:00");
  fireEvent.changeText(screen.getByTestId("exception-close"), "02:00");
  await press("Add exception");
  expect(mockApi.saveException).toHaveBeenCalledWith(7, {
    date: "2026-12-31",
    closed: false,
    open: "18:00",
    close: "02:00",
  });
});

it("validates a waitlist party and clears it only after a successful add", async () => {
  await open();
  expect(screen.getByTestId("waitlist-add").props.accessibilityState.disabled).toBe(true);
  fireEvent.changeText(screen.getByTestId("waitlist-name"), " Ada ");
  fireEvent.changeText(screen.getByTestId("waitlist-seats"), "3");
  fireEvent.changeText(screen.getByTestId("waitlist-email"), "ada@example.test");
  await press("Add to waitlist");
  expect(mockApi.addOperationsWaitlist).toHaveBeenCalledWith(7, "Ada", 3, "ada@example.test");
  await screen.findByTestId("operations-dashboard");
  expect(screen.getByTestId("waitlist-name").props.value).toBe("");
});

it("asks before enabling real email, and supports returning to simulation", async () => {
  await open();
  await press("Enable real emails");
  expect(mockApi.setReminderMode).not.toHaveBeenCalled();
  await press("Cancel");
  await press("Enable real emails");
  await press("Confirm real emails");
  expect(mockApi.setReminderMode).toHaveBeenCalledWith(7, false);
});

it("returns to simulation and renders empty states", async () => {
  await open({ simulateEmailReminders: false, bookings: [], dishes: [], exceptions: [], days: [] });
  expect(screen.getByText("No reservations for this period.")).toBeTruthy();
  await press("Return to simulation");
  expect(mockApi.setReminderMode).toHaveBeenCalledWith(7, true);
});

it.each([401, 404, 500])("handles a %s read without retaining guest data", async (status) => {
  mockApi.getOperations.mockResolvedValue(refused("Unavailable", status));
  render(<OperationsDashboard restaurantId={7} />);
  await act(async () => {});
  if (status === 401) expect(mockExpire).toHaveBeenCalled();
  else if (status === 404) expect(screen.getByTestId("wizard-not-found-back")).toBeTruthy();
  else {
    await press("Try again");
    expect(mockApi.getOperations).toHaveBeenCalledTimes(2);
  }
  expect(screen.queryByText("Alice")).toBeNull();
});

it("renders suspended data read-only and reports mutation and export errors", async () => {
  await open({ status: "Suspended" });
  expect(screen.getByTestId("exception-add").props.accessibilityState.disabled).toBe(true);
  mockApi.exportOperations.mockResolvedValue(refused("Export refused", 403));
  await press("Export this week (CSV)");
  await waitFor(() => expect(screen.getByText("Export refused")).toBeTruthy());
});

it("seats or removes a queued party using its id", async () => {
  mockApi.getOperationsWaitlist.mockResolvedValue(
    ok({
      restaurantId: 7,
      acceptingGuests: true,
      entries: [
        {
          id: 8,
          number: 2,
          name: "Ada",
          email: null,
          seats: 2,
          status: "waiting",
          joinedAt: "2026-10-22T17:00:00Z",
          notifiedAt: null,
          partiesAhead: 0,
          estimatedWaitMinutes: 0,
          canSeatNow: true,
          skipsNumber: null,
        },
      ],
    })
  );
  await open({ exceptions: [] });
  await press("Seat party");
  expect(mockApi.actOnOperationsWaitlist).toHaveBeenCalledWith(7, 8, "seat");
  await screen.findByTestId("operations-dashboard");
  await press("Remove");
  expect(mockApi.actOnOperationsWaitlist).toHaveBeenCalledWith(7, 8, "remove");
});

it("keeps the guest’s input and shows a refused write beside the forms", async () => {
  await open();
  mockApi.addOperationsWaitlist.mockResolvedValue(refused("Aucune table adaptée", 409));
  fireEvent.changeText(screen.getByTestId("waitlist-name"), "Ada");
  await press("Add to waitlist");
  expect(screen.getByText("Aucune table adaptée")).toBeTruthy();
  expect(screen.getByTestId("waitlist-name").props.value).toBe("Ada");
});
