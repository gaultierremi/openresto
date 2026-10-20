import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react-native";
import { PlatformScreen } from "@/components/admin/platform/PlatformScreen";
import {
  accessPlatformGuestData,
  createPlatformRestaurant,
  fetchPlatformConsents,
  fetchPlatformRestaurants,
  reactivatePlatformRestaurant,
  sendPlatformInvitation,
  suspendPlatformRestaurant,
} from "@/api/platform";
import {
  acceptance,
  guestData,
  invitationResult,
  ok,
  refused,
  restaurant,
} from "@/tests/helpers/platformFixtures";

jest.mock("expo-router", () => ({ Stack: { Screen: () => null } }));
jest.mock("@/context/BrandContext", () => ({
  useBrand: () => ({ appName: "Open Resto", primaryColor: "#0a7ea4" }),
}));
jest.mock("@/utils/haptics", () => ({
  haptics: { selection: jest.fn(), press: jest.fn(), outcome: jest.fn() },
}));
jest.mock("@/components/admin/settings/clipboard", () => ({
  ...jest.requireActual("@/components/admin/settings/clipboard"),
  copyToClipboard: jest.fn().mockResolvedValue(true),
}));
jest.mock("@/api/platform", () => ({
  fetchPlatformRestaurants: jest.fn(),
  createPlatformRestaurant: jest.fn(),
  sendPlatformInvitation: jest.fn(),
  suspendPlatformRestaurant: jest.fn(),
  reactivatePlatformRestaurant: jest.fn(),
  accessPlatformGuestData: jest.fn(),
  fetchPlatformConsents: jest.fn(),
}));

const list = fetchPlatformRestaurants as jest.Mock;
const create = createPlatformRestaurant as jest.Mock;
const invite = sendPlatformInvitation as jest.Mock;
const suspend = suspendPlatformRestaurant as jest.Mock;
const reactivate = reactivatePlatformRestaurant as jest.Mock;
const guests = accessPlatformGuestData as jest.Mock;
const consents = fetchPlatformConsents as jest.Mock;

const LEA = restaurant({ id: 1, name: "Chez Léa", status: "Published" });
const OTTO = restaurant({
  id: 2,
  name: "Chez Otto",
  status: "Suspended",
  suspendedAt: "2026-10-19T09:00:00Z",
  suspensionReason: "Unpaid invoice",
});

beforeEach(() => {
  jest.clearAllMocks();
  [list, create, invite, suspend, reactivate, guests, consents].forEach((m) => m.mockReset());
});

const open = async (rows = [LEA, OTTO]) => {
  list.mockResolvedValue(ok(rows));
  render(<PlatformScreen />);
  await waitFor(() => expect(screen.queryByTestId("platform-list")).toBeTruthy());
};

const row = (id: number) => screen.getByTestId(`platform-row-${id}`);

describe("PlatformScreen, the list", () => {
  it("lists every restaurant with its name and status", async () => {
    await open();
    expect(within(row(1)).getByText("Chez Léa")).toBeTruthy();
    expect(within(row(1)).getByText("Published")).toBeTruthy();
    expect(within(row(2)).getByText("Chez Otto")).toBeTruthy();
    expect(within(row(2)).getByText("Suspended")).toBeTruthy();
    expect(screen.getByText("Platform")).toBeTruthy();
  });

  it("says so when there is no restaurant yet, and still offers to add one", async () => {
    list.mockResolvedValue(ok([]));
    render(<PlatformScreen />);
    await waitFor(() => expect(screen.getByTestId("platform-empty")).toBeTruthy());
    expect(screen.getByText("Add a restaurant")).toBeTruthy();
  });

  it("shows a failed load and loads again on request", async () => {
    list.mockResolvedValueOnce(refused("Request failed."));
    render(<PlatformScreen />);
    await waitFor(() =>
      expect(screen.getByText("The restaurants could not be loaded.")).toBeTruthy()
    );
    expect(screen.queryByTestId("platform-list")).toBeNull();

    list.mockResolvedValueOnce(ok([LEA]));
    fireEvent.press(screen.getByText("Try again"));
    await waitFor(() => expect(screen.getByTestId("platform-list")).toBeTruthy());
    expect(list).toHaveBeenCalledTimes(2);
  });
});

describe("PlatformScreen, adding a restaurant", () => {
  it("appends the new row from the answer and shows the link once", async () => {
    await open([LEA]);
    const added = restaurant({ id: 7, name: "Le Nouveau", ownerEmail: null, status: "Draft" });
    create.mockResolvedValue(ok(invitationResult({ restaurant: added })));

    fireEvent.press(screen.getByText("Add a restaurant"));
    fireEvent.changeText(screen.getByLabelText("Restaurant name"), "Le Nouveau");
    fireEvent.changeText(screen.getByLabelText("Owner’s e-mail address"), "new@example.com");
    fireEvent.press(screen.getByText("Create and invite"));

    await waitFor(() => expect(screen.getByTestId("invitation-link")).toBeTruthy());
    expect(within(row(7)).getByText("Le Nouveau")).toBeTruthy();
    expect(within(row(7)).getByText("Draft")).toBeTruthy();
    expect(list).toHaveBeenCalledTimes(1);

    fireEvent.press(screen.getByText("Close"));
    expect(screen.queryByTestId("invitation-link")).toBeNull();
    expect(screen.queryByTestId("invitation-modal")).toBeNull();
  });

  it("adds nothing to the list when the server refuses", async () => {
    await open([LEA]);
    create.mockResolvedValue(
      refused("A restaurant name is required.", "platform.restaurant_name_required")
    );

    fireEvent.press(screen.getByText("Add a restaurant"));
    fireEvent.changeText(screen.getByLabelText("Restaurant name"), "X");
    fireEvent.changeText(screen.getByLabelText("Owner’s e-mail address"), "new@example.com");
    fireEvent.press(screen.getByText("Create and invite"));

    await waitFor(() => expect(screen.getByTestId("invitation-error")).toBeTruthy());
    expect(screen.queryByTestId("platform-row-7")).toBeNull();
    expect(screen.getAllByTestId(/^platform-row-/)).toHaveLength(1);
  });

  it("appends to a list that had failed to load nothing", async () => {
    list.mockResolvedValue(refused("Request failed."));
    create.mockResolvedValue(ok(invitationResult({ restaurant: restaurant({ id: 7 }) })));
    render(<PlatformScreen />);
    await waitFor(() =>
      expect(screen.getByText("The restaurants could not be loaded.")).toBeTruthy()
    );

    fireEvent.press(screen.getByText("Add a restaurant"));
    fireEvent.changeText(screen.getByLabelText("Restaurant name"), "Le Nouveau");
    fireEvent.changeText(screen.getByLabelText("Owner’s e-mail address"), "new@example.com");
    fireEvent.press(screen.getByText("Create and invite"));

    await waitFor(() => expect(screen.getByTestId("invitation-link")).toBeTruthy());
    expect(screen.queryByTestId("platform-list")).toBeNull();
  });
});

describe("PlatformScreen, inviting", () => {
  it("replaces the row with the one the invitation answered with", async () => {
    await open([LEA]);
    const updated = restaurant({
      id: 1,
      ownerEmail: null,
      invitation: {
        email: "lea@example.com",
        state: "Pending",
        createdAt: "2026-10-20T00:00:00Z",
        expiresAt: "2026-11-03T00:00:00Z",
      },
    });
    invite.mockResolvedValue(ok(invitationResult({ restaurant: updated })));

    fireEvent.press(within(row(1)).getByText("Resend the invitation"));
    fireEvent.press(screen.getByText("Send the invitation"));

    await waitFor(() => expect(screen.getByTestId("invitation-link")).toBeTruthy());
    expect(invite).toHaveBeenCalledWith(1, { email: "lea@example.com", locale: "fr" });
    expect(within(row(1)).getByText("Invitation: Pending · lea@example.com")).toBeTruthy();
  });
});

describe("PlatformScreen, suspending", () => {
  it("calls nothing before the confirmation, then shows the row as suspended", async () => {
    await open();
    suspend.mockResolvedValue(
      ok({ ...LEA, status: "Suspended", suspendedAt: "2026-10-20T09:00:00Z" })
    );

    fireEvent.press(within(row(1)).getByText("Suspend"));
    fireEvent.changeText(screen.getByLabelText("Reason (optional)"), "Unpaid invoice");
    fireEvent.press(screen.getByText("Continue"));
    expect(suspend).not.toHaveBeenCalled();

    fireEvent.press(screen.getByText("Yes, suspend"));
    await waitFor(() => expect(suspend).toHaveBeenCalledWith(1, "Unpaid invoice"));
    await waitFor(() => expect(within(row(1)).getByText("Suspended")).toBeTruthy());
    expect(within(row(1)).getByText("Reactivate")).toBeTruthy();
    expect(screen.queryByTestId("suspend-modal")).toBeNull();
  });

  it("leaves the row as it was when the server refuses", async () => {
    await open();
    suspend.mockResolvedValue(
      refused("This restaurant is already suspended.", "platform.already_suspended")
    );

    fireEvent.press(within(row(1)).getByText("Suspend"));
    fireEvent.press(screen.getByText("Continue"));
    fireEvent.press(screen.getByText("Yes, suspend"));

    await waitFor(() => expect(screen.getByTestId("suspend-error")).toBeTruthy());
    expect(within(row(1)).getByText("Published")).toBeTruthy();
  });
});

describe("PlatformScreen, reactivating", () => {
  it("asks first, and calls nothing if the admin cancels", async () => {
    await open();
    fireEvent.press(within(row(2)).getByText("Reactivate"));
    expect(screen.getByText("Reactivate Chez Otto?")).toBeTruthy();

    fireEvent.press(screen.getByText("Cancel"));
    expect(reactivate).not.toHaveBeenCalled();
    expect(screen.queryByText("Reactivate Chez Otto?")).toBeNull();
    expect(within(row(2)).getByText("Suspended")).toBeTruthy();
  });

  it("reactivates once confirmed and shows the row the server answered with", async () => {
    await open();
    reactivate.mockResolvedValue(
      ok({ ...OTTO, status: "Published", suspendedAt: null, suspensionReason: null })
    );

    fireEvent.press(within(row(2)).getByText("Reactivate"));
    fireEvent.press(screen.getAllByText("Reactivate").slice(-1)[0]);

    await waitFor(() => expect(within(row(2)).getByText("Published")).toBeTruthy());
    expect(reactivate).toHaveBeenCalledWith(2);
    expect(within(row(2)).getByText("Suspend")).toBeTruthy();
    expect(screen.queryByTestId("platform-notice")).toBeNull();
  });

  it("shows the refusal and leaves the row suspended when the server refuses", async () => {
    await open();
    reactivate.mockResolvedValue(
      refused("This restaurant is not suspended.", "platform.not_suspended")
    );

    fireEvent.press(within(row(2)).getByText("Reactivate"));
    fireEvent.press(screen.getAllByText("Reactivate").slice(-1)[0]);

    await waitFor(() => expect(screen.getByTestId("platform-notice")).toBeTruthy());
    expect(screen.getByTestId("platform-notice")).toHaveTextContent(
      "This restaurant is not suspended."
    );
    expect(within(row(2)).getByText("Suspended")).toBeTruthy();
  });

  it("clears an earlier refusal when a later reactivation succeeds", async () => {
    await open();
    reactivate.mockResolvedValueOnce(
      refused("This restaurant is not suspended.", "platform.not_suspended")
    );
    fireEvent.press(within(row(2)).getByText("Reactivate"));
    fireEvent.press(screen.getAllByText("Reactivate").slice(-1)[0]);
    await waitFor(() => expect(screen.getByTestId("platform-notice")).toBeTruthy());

    reactivate.mockResolvedValueOnce(ok({ ...OTTO, status: "Published" }));
    fireEvent.press(within(row(2)).getByText("Reactivate"));
    fireEvent.press(screen.getAllByText("Reactivate").slice(-1)[0]);
    await waitFor(() => expect(reactivate).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByTestId("platform-notice")).toBeNull());
  });

  it("takes no second confirmation while the first call is in flight", async () => {
    await open();
    let finish: (value: unknown) => void = () => {};
    reactivate.mockReturnValue(new Promise((resolve) => (finish = resolve)));

    fireEvent.press(within(row(2)).getByText("Reactivate"));
    const confirm = screen.getAllByText("Reactivate").slice(-1)[0];
    fireEvent.press(confirm);
    fireEvent.press(confirm);
    expect(reactivate).toHaveBeenCalledTimes(1);
    finish(ok({ ...OTTO, status: "Published" }));
    await waitFor(() => expect(within(row(2)).getByText("Published")).toBeTruthy());
  });
});

describe("PlatformScreen, consents", () => {
  it("opens the consents of the chosen restaurant", async () => {
    await open();
    consents.mockResolvedValue(ok([acceptance()]));

    fireEvent.press(within(row(2)).getByText("Consents"));

    await waitFor(() => expect(screen.getByTestId("consent-row")).toBeTruthy());
    expect(consents).toHaveBeenCalledWith(2);

    fireEvent.press(screen.getByText("Close"));
    expect(screen.queryByTestId("consents-modal")).toBeNull();
  });
});

describe("PlatformScreen, the guest-data door", () => {
  it("fetches no guest data on its own, whatever the list shows", async () => {
    await open();
    expect(guests).not.toHaveBeenCalled();
    expect(screen.queryByText(/Camille/)).toBeNull();
  });

  it("opens only on a reason, and leaves no guest data in the tree once closed", async () => {
    await open();
    guests.mockResolvedValue(ok(guestData({ restaurantId: 1 })));

    fireEvent.press(within(row(1)).getByText("Guest data…"));
    expect(guests).not.toHaveBeenCalled();
    expect(screen.getByTestId("guest-data-warning")).toBeTruthy();

    fireEvent.changeText(
      screen.getByLabelText("Reason for the access"),
      "Ticket 4821: booking confirmation never arrived"
    );
    fireEvent.press(screen.getByRole("button", { name: "Open the guest data" }));
    await waitFor(() => expect(screen.getByText("Camille Dupont")).toBeTruthy());
    expect(guests).toHaveBeenCalledWith(1, "Ticket 4821: booking confirmation never arrived");

    fireEvent.press(screen.getByText("Close and discard"));

    expect(screen.queryByTestId("guest-data-modal")).toBeNull();
    expect(screen.queryByText("Camille Dupont")).toBeNull();
    expect(screen.queryByText("camille@example.com")).toBeNull();
    // And the list behind it never held any of it.
    expect(screen.getByTestId("platform-list")).toBeTruthy();
  });

  it("does not call the server for a reason that is too short", async () => {
    await open();
    fireEvent.press(within(row(1)).getByText("Guest data…"));
    fireEvent.changeText(screen.getByLabelText("Reason for the access"), "too short");
    fireEvent.press(screen.getByRole("button", { name: "Open the guest data" }));
    expect(guests).not.toHaveBeenCalled();
  });
});
