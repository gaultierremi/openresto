import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react-native";
import { GuestDataModal } from "@/components/admin/platform/GuestDataModal";
import { accessPlatformGuestData } from "@/api/platform";
import { guestBooking, guestData, ok, refused, restaurant } from "@/tests/helpers/platformFixtures";
import { invokeOnPress } from "@/tests/helpers/invokeOnPress";
import { StorageService } from "@/services/storage";

jest.mock("@/context/BrandContext", () => ({
  useBrand: () => ({ appName: "Open Resto", primaryColor: "#0a7ea4" }),
}));
jest.mock("@/services/storage", () => ({
  StorageService: { getItem: jest.fn(() => null), setItem: jest.fn(), removeItem: jest.fn() },
}));
jest.mock("@/api/platform", () => ({ accessPlatformGuestData: jest.fn() }));

const access = accessPlatformGuestData as jest.Mock;
beforeEach(() => {
  access.mockReset();
  jest.clearAllMocks();
});

const NINE = "123456789";
const TEN = "1234567890";
const GOOD_REASON = "Ticket 4821: booking confirmation never arrived";

const open = (onClose = jest.fn()) => {
  render(<GuestDataModal restaurant={restaurant({ id: 5, name: "Chez Léa" })} onClose={onClose} />);
  return onClose;
};

const type = (value: string) =>
  fireEvent.changeText(screen.getByLabelText("Reason for the access"), value);

const submitButton = () => screen.getByRole("button", { name: "Open the guest data" });

const unlock = async (bookings = [guestBooking()], totalBookings = bookings.length) => {
  access.mockResolvedValue(ok(guestData({ bookings, totalBookings })));
  type(GOOD_REASON);
  fireEvent.press(submitButton());
  await waitFor(() => expect(screen.getByTestId("guest-data-banner")).toBeTruthy());
};

describe("GuestDataModal, before the access", () => {
  it("states in plain words what the access is, before anything is asked or fetched", () => {
    open();
    const warning = screen.getByTestId("guest-data-warning");
    expect(
      within(warning).getByText(/does not read a restaurant’s guests by default/)
    ).toBeTruthy();
    expect(
      within(warning).getByText(/recorded in the audit trail, with your reason and your name/)
    ).toBeTruthy();
    expect(within(warning).getByText(/Never name a guest in it/)).toBeTruthy();
    expect(access).not.toHaveBeenCalled();
    expect(screen.queryByTestId("guest-data-banner")).toBeNull();
  });

  it("keeps the submit off at 9 characters, with a live counter, and fetches nothing", () => {
    open();
    type(NINE);

    expect(screen.getByTestId("guest-data-counter")).toHaveTextContent(
      "9 / 300 characters (at least 10)"
    );
    expect(submitButton()).toBeDisabled();
    fireEvent.press(submitButton());
    expect(access).not.toHaveBeenCalled();
  });

  it("turns the submit on at exactly 10 characters", () => {
    open();
    type(TEN);

    expect(screen.getByTestId("guest-data-counter")).toHaveTextContent(
      "10 / 300 characters (at least 10)"
    );
    expect(submitButton()).not.toBeDisabled();
  });

  it("counts the reason without its surrounding spaces, as the server does", () => {
    open();
    type(`   ${NINE}   `);
    expect(submitButton()).toBeDisabled();
    expect(screen.getByTestId("guest-data-counter")).toHaveTextContent(/^9 \/ 300 characters/);
  });

  it("holds the field to 300 characters", () => {
    open();
    expect(screen.getByLabelText("Reason for the access").props.maxLength).toBe(300);
  });

  it("asks for the access with the trimmed reason once it is long enough", async () => {
    open();
    await unlock();
    expect(access).toHaveBeenCalledTimes(1);
    expect(access).toHaveBeenCalledWith(5, GOOD_REASON);
  });

  it("shows the server's refusal and no data, and may be tried again", async () => {
    access.mockResolvedValueOnce(
      refused(
        "State why the guests’ data is needed, in 10 to 300 characters.",
        "platform.access_reason_required"
      )
    );
    open();
    type(GOOD_REASON);
    fireEvent.press(submitButton());

    await waitFor(() => expect(screen.getByTestId("guest-data-error")).toBeTruthy());
    expect(screen.getByTestId("guest-data-error")).toHaveTextContent(
      "State why the guests’ data is needed, in 10 to 300 characters."
    );
    expect(screen.queryByTestId("guest-data-banner")).toBeNull();
    expect(screen.queryByText("AB12CD")).toBeNull();

    access.mockResolvedValueOnce(ok(guestData()));
    fireEvent.press(submitButton());
    await waitFor(() => expect(screen.getByTestId("guest-data-banner")).toBeTruthy());
    expect(access).toHaveBeenCalledTimes(2);
  });

  it("takes no second press while the first call is in flight", async () => {
    let finish: (value: unknown) => void = () => {};
    access.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    open();
    type(GOOD_REASON);
    fireEvent.press(submitButton());
    // The button is busy, and the handler refuses a second call on its own too.
    fireEvent.press(submitButton());
    invokeOnPress("Open the guest data");
    expect(access).toHaveBeenCalledTimes(1);
    finish(ok(guestData()));
    await waitFor(() => expect(screen.getByTestId("guest-data-banner")).toBeTruthy());
  });

  it("refuses a reason below the minimum in the handler too, not only by greying the button", () => {
    open();
    type(NINE);
    invokeOnPress("Open the guest data");
    expect(access).not.toHaveBeenCalled();
    expect(screen.queryByTestId("guest-data-banner")).toBeNull();
  });

  it("cancels without fetching anything", () => {
    const onClose = open();
    type(GOOD_REASON);
    fireEvent.press(screen.getByText("Cancel"));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(access).not.toHaveBeenCalled();
  });
});

describe("GuestDataModal, once the access is granted", () => {
  it("shows the logged-access banner and the bookings table", async () => {
    open();
    await unlock();

    expect(screen.getByTestId("guest-data-banner")).toHaveTextContent(/^Access logged/);
    expect(screen.getByTestId("guest-data-banner")).toHaveTextContent(
      /Your reason and your name are in the audit trail/
    );
    const row = screen.getByTestId("guest-data-row-AB12CD");
    expect(within(row).getByText("AB12CD")).toBeTruthy();
    expect(within(row).getByText("4")).toBeTruthy();
    expect(within(row).getByText("Camille Dupont")).toBeTruthy();
    expect(within(row).getByText("camille@example.com")).toBeTruthy();
    expect(within(row).getByText("Chaise haute")).toBeTruthy();
    expect(screen.queryByTestId("guest-data-warning")).toBeNull();
  });

  it("labels every column", async () => {
    open();
    await unlock();
    for (const heading of ["Reference", "Date", "Party", "Name", "E-mail", "Requests", "Status"]) {
      expect(screen.getByText(heading)).toBeTruthy();
    }
  });

  it("shows 'Anonymised' in place of the name of an anonymised booking", async () => {
    open();
    await unlock([
      guestBooking({
        bookingRef: "ZZ99ZZ",
        customerName: "Should Not Show",
        customerEmail: null,
        specialRequests: null,
        isAnonymized: true,
      }),
    ]);
    const row = screen.getByTestId("guest-data-row-ZZ99ZZ");
    expect(within(row).queryByText("Should Not Show")).toBeNull();
    // Once as the name, once among the row's flags.
    expect(within(row).getAllByText("Anonymised")).toHaveLength(2);
  });

  it("flags a cancelled booking, and both flags together", async () => {
    open();
    await unlock([
      guestBooking({ bookingRef: "CA11CE", isCancelled: true }),
      guestBooking({ bookingRef: "BO7H00", isCancelled: true, isAnonymized: true }),
      guestBooking({ bookingRef: "PL41N0" }),
    ]);
    expect(within(screen.getByTestId("guest-data-row-CA11CE")).getByText("Cancelled")).toBeTruthy();
    expect(
      within(screen.getByTestId("guest-data-row-BO7H00")).getByText("Cancelled, Anonymised")
    ).toBeTruthy();
    expect(within(screen.getByTestId("guest-data-row-PL41N0")).queryByText(/Cancelled/)).toBeNull();
  });

  it("shows a dash for the fields a booking does not have", async () => {
    open();
    await unlock([
      guestBooking({ customerName: null, customerEmail: null, specialRequests: null }),
    ]);
    const row = screen.getByTestId("guest-data-row-AB12CD");
    // name, e-mail, requests and status
    expect(within(row).getAllByText("—")).toHaveLength(4);
  });

  it("says so when the restaurant has no booking", async () => {
    open();
    await unlock([]);
    expect(screen.getByTestId("guest-data-empty")).toBeTruthy();
    expect(screen.queryByTestId("guest-data-scroll")).toBeNull();
  });

  it("says how many bookings it shows out of how many there are, when the server cut the list", async () => {
    open();
    await unlock([guestBooking()], 205);

    expect(within(screen.getByTestId("guest-data-truncated")).getByText(/1.*205/)).toBeTruthy();
  });

  it("says nothing about a cut when every booking is shown", async () => {
    open();
    await unlock([guestBooking()], 1);

    expect(screen.queryByTestId("guest-data-truncated")).toBeNull();
  });

  it("writes nothing to storage, before or after the access", async () => {
    open();
    await unlock();
    expect(StorageService.setItem).not.toHaveBeenCalled();
  });
});

describe("GuestDataModal, closing", () => {
  it("drops the data from the tree, and the reason with it, then asks to be closed", async () => {
    const onClose = open();
    await unlock();
    expect(screen.getByText("Camille Dupont")).toBeTruthy();

    fireEvent.press(screen.getByText("Close and discard"));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Camille Dupont")).toBeNull();
    expect(screen.queryByText("camille@example.com")).toBeNull();
    expect(screen.queryByTestId("guest-data-banner")).toBeNull();
    expect(screen.getByLabelText("Reason for the access").props.value).toBe("");
  });

  it("drops the data when the dialog is dismissed by its backdrop too", async () => {
    const onClose = open();
    await unlock();

    // The backdrop is a sibling of the modal card, so the card's aria-modal hides it from queries.
    fireEvent.press(screen.getByLabelText("Close", { includeHiddenElements: true }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Camille Dupont")).toBeNull();
  });

  it("needs a new reason to open the data again", async () => {
    open();
    await unlock();
    fireEvent.press(screen.getByText("Close and discard"));

    access.mockClear();
    expect(submitButton()).toBeDisabled();
    fireEvent.press(submitButton());
    expect(access).not.toHaveBeenCalled();
  });
});
