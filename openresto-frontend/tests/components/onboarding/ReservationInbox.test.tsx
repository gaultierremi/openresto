import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { ReservationInbox, INBOX_POLL_MS } from "@/components/onboarding/ReservationInbox";
import { getInbox } from "@/api/onboarding";
import { ok, refused } from "@/tests/helpers/onboardingFixtures";

jest.mock("@/api/onboarding", () => ({ getInbox: jest.fn() }));
jest.mock("@/context/BrandContext", () => ({ useBrand: () => ({ primaryColor: "#215d49" }) }));
const booking = {
  id: 10,
  date: "2026-12-01T18:00:00Z",
  bookingRef: "EXAMPLE",
  customerName: "Client Example",
  customerEmail: "client@example.test",
  seats: 2,
  specialRequests: "Near the window",
  isCancelled: false,
};
const inbox = (bookings = [booking]) => ok({ timezone: "Europe/Brussels", bookings });
beforeEach(() => {
  jest.resetAllMocks();
  jest.useFakeTimers();
});
afterEach(() => jest.useRealTimers());
const flush = async () => {
  await act(async () => {});
};
const poll = async () => {
  await act(async () => {
    jest.advanceTimersByTime(INBOX_POLL_MS);
  });
};

it("shows the received reservation in restaurant time and alerts only once on new arrivals", async () => {
  jest.mocked(getInbox).mockResolvedValueOnce(inbox([])).mockResolvedValue(inbox());
  render(<ReservationInbox restaurantId={7} onExpired={jest.fn()} />);
  await flush();
  expect(screen.getByText(/Your first reservation/)).toBeTruthy();
  await poll();
  expect(screen.getByTestId("inbox-notification")).toHaveTextContent(/New reservations: 1/);
  expect(screen.getByTestId("inbox-booking-10")).toHaveTextContent(/Client Example/);
  expect(screen.getByTestId("inbox-booking-10")).toHaveTextContent(/7:00/);
  expect(screen.getByText("Near the window")).toBeTruthy();
  await poll();
  expect(screen.getByTestId("inbox-notification")).toHaveTextContent(/New reservations: 1/);
  fireEvent.press(screen.getByText("Mark as read"));
  expect(screen.queryByTestId("inbox-notification")).toBeNull();
});

it("keeps cancellations visible, reports failed refreshes and retries", async () => {
  jest
    .mocked(getInbox)
    .mockResolvedValueOnce(inbox([{ ...booking, isCancelled: true, specialRequests: "" }]))
    .mockResolvedValueOnce(refused("Unavailable", 503))
    .mockResolvedValue(inbox());
  render(<ReservationInbox restaurantId={7} onExpired={jest.fn()} />);
  await flush();
  expect(screen.getByTestId("inbox-booking-10")).toHaveTextContent(/Cancelled/);
  await poll();
  expect(screen.getByText("Unavailable")).toBeTruthy();
  await act(async () => {
    fireEvent.press(screen.getByText("Try again"));
  });
  expect(screen.queryByText("Unavailable")).toBeNull();
});

it("drops guest data and stops polling when the session ends", async () => {
  jest.mocked(getInbox).mockResolvedValueOnce(inbox()).mockResolvedValue(refused("Expired", 401));
  const expired = jest.fn();
  render(<ReservationInbox restaurantId={7} onExpired={expired} />);
  await flush();
  await poll();
  expect(expired).toHaveBeenCalledTimes(1);
  expect(screen.queryByTestId("inbox-booking-10")).toBeNull();
  await poll();
  expect(getInbox).toHaveBeenCalledTimes(2);
});

it("ignores an answer after leaving the screen", async () => {
  let resolve: (value: ReturnType<typeof inbox>) => void = () => {};
  jest.mocked(getInbox).mockReturnValue(
    new Promise((done) => {
      resolve = done;
    })
  );
  const view = render(<ReservationInbox restaurantId={7} onExpired={jest.fn()} />);
  view.unmount();
  await act(async () => {
    resolve(inbox());
  });
  await poll();
  expect(getInbox).toHaveBeenCalledTimes(1);
});
