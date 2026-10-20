import React from "react";
import { StyleSheet } from "react-native";
import { fireEvent, render, screen, within } from "@testing-library/react-native";
import { PlatformRestaurantRow } from "@/components/admin/platform/PlatformRestaurantRow";
import { restaurant } from "@/tests/helpers/platformFixtures";

let mockScheme = "light";
jest.mock("@/hooks/use-color-scheme", () => ({ useColorScheme: () => mockScheme }));
jest.mock("@/context/BrandContext", () => ({
  useBrand: () => ({ appName: "Open Resto", primaryColor: "#0a7ea4" }),
}));

beforeEach(() => {
  mockScheme = "light";
});

const renderRow = (row = restaurant(), onAction = jest.fn()) => {
  render(<PlatformRestaurantRow restaurant={row} onAction={onAction} />);
  return onAction;
};

describe("PlatformRestaurantRow", () => {
  it("shows the name and the status in words", () => {
    renderRow(restaurant({ name: "Chez Léa", status: "Draft" }));
    expect(screen.getByText("Chez Léa")).toBeTruthy();
    expect(within(screen.getByTestId("platform-status-badge")).getByText("Draft")).toBeTruthy();
  });

  it("shows the owner's e-mail once an account exists, and not the invitation", () => {
    renderRow(
      restaurant({
        ownerEmail: "lea@example.com",
        invitation: {
          email: "other@example.com",
          state: "Accepted",
          createdAt: "2026-10-01T00:00:00Z",
          expiresAt: "2026-10-15T00:00:00Z",
        },
      })
    );
    expect(screen.getByText("Account: lea@example.com")).toBeTruthy();
    expect(screen.queryByText(/other@example.com/)).toBeNull();
  });

  it.each([
    ["Pending", "Pending"],
    ["Expired", "Expired"],
    ["Revoked", "Revoked"],
    ["Accepted", "Accepted"],
  ] as const)(
    "before an account exists, shows the invitation %s with its expiry",
    (state, label) => {
      renderRow(
        restaurant({
          ownerEmail: null,
          invitation: {
            email: "wait@example.com",
            state,
            createdAt: "2026-10-01T00:00:00Z",
            expiresAt: "2026-10-15T12:00:00Z",
          },
        })
      );
      expect(screen.getByText(`Invitation: ${label} · wait@example.com`)).toBeTruthy();
      expect(screen.getByText(/^Expires /)).toBeTruthy();
    }
  );

  it("says no invitation was sent when there is neither an account nor an invitation", () => {
    renderRow(restaurant({ ownerEmail: null, invitation: null }));
    expect(screen.getByText("No invitation sent yet")).toBeTruthy();
  });

  it("prints 'never' for a restaurant nobody signed in to, a date otherwise", () => {
    renderRow(restaurant({ lastLoginAt: null }));
    expect(screen.getByText("Last sign-in: never")).toBeTruthy();
  });

  it("prints the last sign-in as a date", () => {
    renderRow(restaurant({ lastLoginAt: "2026-10-18T08:30:00Z" }));
    expect(screen.queryByText("Last sign-in: never")).toBeNull();
    expect(screen.getByText(/^Last sign-in: .*18/)).toBeTruthy();
  });

  it("shows booking counts only", () => {
    renderRow(restaurant({ totalBookings: 42, upcomingBookings: 7 }));
    expect(screen.getByText("Bookings: 42 in total, 7 upcoming")).toBeTruthy();
  });

  it("shows the setup progress and the next step by name", () => {
    renderRow(restaurant({ stepsDone: 2, stepsTotal: 5, nextStep: "layout" }));
    expect(screen.getByText("Setup: 2/5 steps · Next step: Rooms and tables")).toBeTruthy();
  });

  it("says the setup is complete when no step is left", () => {
    renderRow(restaurant({ stepsDone: 5, stepsTotal: 5, nextStep: null }));
    expect(screen.getByText("Setup: 5/5 steps · Setup complete")).toBeTruthy();
  });

  it("shows when and why a suspended restaurant was suspended", () => {
    renderRow(
      restaurant({
        status: "Suspended",
        suspendedAt: "2026-10-19T09:00:00Z",
        suspensionReason: "Unpaid invoice",
      })
    );
    expect(screen.getByText(/^Suspended since /)).toBeTruthy();
    expect(screen.getByText("Reason shown to the restaurateur: Unpaid invoice")).toBeTruthy();
  });

  it("shows neither suspension line for a suspended restaurant that carries neither", () => {
    renderRow(restaurant({ status: "Suspended", suspendedAt: null, suspensionReason: null }));
    expect(screen.queryByText(/^Suspended since /)).toBeNull();
    expect(screen.queryByText(/Reason shown/)).toBeNull();
  });

  it("shows no suspension line for a restaurant that is not suspended, even if the fields are set", () => {
    renderRow(
      restaurant({
        status: "Published",
        suspendedAt: "2026-10-19T09:00:00Z",
        suspensionReason: "x",
      })
    );
    expect(screen.queryByText(/^Suspended since /)).toBeNull();
    expect(screen.queryByText(/Reason shown/)).toBeNull();
  });

  it("offers Suspend, not Reactivate, for a restaurant that is not suspended", () => {
    const onAction = renderRow(restaurant({ status: "Published" }));
    expect(screen.queryByText("Reactivate")).toBeNull();
    fireEvent.press(screen.getByText("Suspend"));
    expect(onAction).toHaveBeenCalledWith("suspend", expect.objectContaining({ id: 1 }));
  });

  it("offers Reactivate, not Suspend, for a suspended restaurant", () => {
    const onAction = renderRow(restaurant({ status: "Suspended" }));
    expect(screen.queryByText("Suspend")).toBeNull();
    fireEvent.press(screen.getByText("Reactivate"));
    expect(onAction).toHaveBeenCalledWith("reactivate", expect.objectContaining({ id: 1 }));
  });

  it("offers Reactivate on a dark card too, in a lighter green than the light card's", () => {
    const colorOf = () => {
      const { unmount } = render(
        <PlatformRestaurantRow
          restaurant={restaurant({ status: "Suspended" })}
          onAction={jest.fn()}
        />
      );
      const style = StyleSheet.flatten(
        screen.getByText("Reactivate").parent?.parent?.props.style ??
          screen.getByText("Reactivate").props.style
      );
      unmount();
      return style.color ?? style.borderColor;
    };
    const light = colorOf();
    mockScheme = "dark";
    expect(colorOf()).not.toBe(light);
  });

  it("offers Invite before any invitation exists and Resend afterwards", () => {
    const { unmount } = render(
      <PlatformRestaurantRow
        restaurant={restaurant({ ownerEmail: null, invitation: null })}
        onAction={jest.fn()}
      />
    );
    expect(screen.getByText("Invite")).toBeTruthy();
    expect(screen.queryByText("Resend the invitation")).toBeNull();
    unmount();

    renderRow(restaurant({ ownerEmail: "lea@example.com", invitation: null }));
    expect(screen.getByText("Resend the invitation")).toBeTruthy();
    expect(screen.queryByText("Invite")).toBeNull();
  });

  it("routes the invitation, consents and guest-data actions with the row", () => {
    const onAction = renderRow();
    fireEvent.press(screen.getByText("Resend the invitation"));
    fireEvent.press(screen.getByText("Consents"));
    fireEvent.press(screen.getByText("Guest data…"));
    expect(onAction.mock.calls.map(([kind]) => kind)).toEqual(["invite", "consents", "guestData"]);
  });

  // The list is counts and dates by contract. This pins that the row reads named fields only,
  // so a guest field that rode along on the object could not reach the screen.
  it("never draws a guest field, even if the object it was given carried one", () => {
    const withGuests = {
      ...restaurant(),
      customerName: "Camille Dupont",
      customerEmail: "camille@example.com",
      specialRequests: "Allergie aux noix",
      guests: [{ customerName: "Camille Dupont" }],
    };
    renderRow(withGuests);
    const row = screen.getByTestId("platform-row-1");
    expect(within(row).queryByText(/Camille/)).toBeNull();
    expect(within(row).queryByText(/camille@example.com/)).toBeNull();
    expect(within(row).queryByText(/noix/)).toBeNull();
  });
});
