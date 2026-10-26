import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { FullWaitlistNotice } from "@/components/booking/FullWaitlistNotice";
import { getWaitlistQuote } from "@/api/waitlist";
jest.mock("@/api/waitlist", () => ({ getWaitlistQuote: jest.fn() }));

it.each([true, false, null])(
  "offers the waitlist only when the server accepts: %s",
  async (accepting) => {
    jest.mocked(getWaitlistQuote).mockResolvedValue(
      accepting === null
        ? null
        : {
            restaurantId: 7,
            acceptingGuests: accepting,
            estimatedWaitMinutes: 10,
            partiesWaiting: 1,
          }
    );
    const onJoin = jest.fn();
    render(<FullWaitlistNotice restaurantId={7} seats={2} onJoin={onJoin} />);
    await act(async () => {});
    if (accepting) {
      fireEvent.press(screen.getByTestId("full-join-waitlist"));
      expect(onJoin).toHaveBeenCalled();
    } else expect(screen.queryByTestId("full-join-waitlist")).toBeNull();
  }
);
