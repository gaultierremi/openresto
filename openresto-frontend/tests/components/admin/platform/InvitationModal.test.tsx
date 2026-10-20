import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { InvitationModal } from "@/components/admin/platform/InvitationModal";
import { createPlatformRestaurant, sendPlatformInvitation } from "@/api/platform";
import { invitationResult, ok, refused, restaurant } from "@/tests/helpers/platformFixtures";

jest.mock("@/context/BrandContext", () => ({
  useBrand: () => ({ appName: "Open Resto", primaryColor: "#0a7ea4" }),
}));
jest.mock("@/components/admin/settings/clipboard", () => ({
  ...jest.requireActual("@/components/admin/settings/clipboard"),
  copyToClipboard: jest.fn().mockResolvedValue(true),
}));
jest.mock("@/api/platform", () => ({
  createPlatformRestaurant: jest.fn(),
  sendPlatformInvitation: jest.fn(),
}));

const create = createPlatformRestaurant as jest.Mock;
const send = sendPlatformInvitation as jest.Mock;

beforeEach(() => {
  create.mockReset();
  send.mockReset();
});

const open = (props: Partial<React.ComponentProps<typeof InvitationModal>> = {}) => {
  const onSaved = jest.fn();
  const onClose = jest.fn();
  render(<InvitationModal onSaved={onSaved} onClose={onClose} {...props} />);
  return { onSaved, onClose };
};

describe("InvitationModal, adding a restaurant", () => {
  it("creates the restaurant and invites its owner in the chosen language, then shows the link", async () => {
    create.mockResolvedValue(ok(invitationResult({ restaurant: restaurant({ id: 9 }) })));
    const { onSaved } = open();

    fireEvent.changeText(screen.getByLabelText("Restaurant name"), "  Chez Léa ");
    fireEvent.changeText(screen.getByLabelText("Owner’s e-mail address"), " lea@example.com ");
    fireEvent.press(screen.getByText("Nederlands"));
    fireEvent.press(screen.getByText("Create and invite"));

    await waitFor(() => expect(screen.getByTestId("invitation-link")).toBeTruthy());
    expect(create).toHaveBeenCalledWith({
      name: "Chez Léa",
      ownerEmail: "lea@example.com",
      locale: "nl",
    });
    expect(screen.getByTestId("invitation-link").props.value).toBe(
      "https://resto.example/onboarding/accept?token=abcdef123456"
    );
    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ id: 9 }));
  });

  it("defaults the invitation to French", async () => {
    create.mockResolvedValue(ok(invitationResult()));
    open();
    fireEvent.changeText(screen.getByLabelText("Restaurant name"), "Chez Léa");
    fireEvent.changeText(screen.getByLabelText("Owner’s e-mail address"), "lea@example.com");
    fireEvent.press(screen.getByText("Create and invite"));
    await waitFor(() => expect(create).toHaveBeenCalled());
    expect(create.mock.calls[0][0].locale).toBe("fr");
  });

  it("refuses a blank name without calling the server", () => {
    open();
    fireEvent.changeText(screen.getByLabelText("Owner’s e-mail address"), "lea@example.com");
    fireEvent.press(screen.getByText("Create and invite"));
    expect(screen.getByTestId("invitation-error")).toHaveTextContent(
      "Enter the restaurant’s name."
    );
    expect(create).not.toHaveBeenCalled();
  });

  it("refuses an address that is not one without calling the server", () => {
    open();
    fireEvent.changeText(screen.getByLabelText("Restaurant name"), "Chez Léa");
    fireEvent.changeText(screen.getByLabelText("Owner’s e-mail address"), "not-an-address");
    fireEvent.press(screen.getByText("Create and invite"));
    expect(screen.getByTestId("invitation-error")).toHaveTextContent(
      "Enter a valid e-mail address."
    );
    expect(create).not.toHaveBeenCalled();
  });

  it("shows the server's refusal, keeps the form as typed, hands nothing up and shows no link", async () => {
    create.mockResolvedValue(
      refused("An account with that email address already exists.", "user.email_already_exists")
    );
    const { onSaved } = open();
    fireEvent.changeText(screen.getByLabelText("Restaurant name"), "Chez Léa");
    fireEvent.changeText(screen.getByLabelText("Owner’s e-mail address"), "lea@example.com");
    fireEvent.press(screen.getByText("Create and invite"));

    await waitFor(() => expect(screen.getByTestId("invitation-error")).toBeTruthy());
    expect(screen.getByTestId("invitation-error")).toHaveTextContent(
      "An account with that email address already exists."
    );
    expect(screen.getByLabelText("Restaurant name").props.value).toBe("Chez Léa");
    expect(onSaved).not.toHaveBeenCalled();
    expect(screen.queryByTestId("invitation-link")).toBeNull();
  });

  it("takes no second press while the first call is in flight", async () => {
    let finish: (value: unknown) => void = () => {};
    create.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    open();
    fireEvent.changeText(screen.getByLabelText("Restaurant name"), "Chez Léa");
    fireEvent.changeText(screen.getByLabelText("Owner’s e-mail address"), "lea@example.com");
    fireEvent.press(screen.getByText("Create and invite"));
    fireEvent.press(screen.getByText("Create and invite"));
    expect(create).toHaveBeenCalledTimes(1);
    finish(ok(invitationResult()));
    await waitFor(() => expect(screen.getByTestId("invitation-link")).toBeTruthy());
  });

  it("cancels without calling anything", () => {
    const { onClose } = open();
    fireEvent.press(screen.getByText("Cancel"));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(create).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });
});

describe("InvitationModal, inviting the owner of an existing restaurant", () => {
  it("prefills the address of the last invitation, in preference to the account's", () => {
    open({
      restaurant: restaurant({
        ownerEmail: "account@example.com",
        invitation: {
          email: "invited@example.com",
          state: "Expired",
          createdAt: "2026-10-01T00:00:00Z",
          expiresAt: "2026-10-15T00:00:00Z",
        },
      }),
    });
    expect(screen.getByLabelText("Owner’s e-mail address").props.value).toBe("invited@example.com");
    expect(screen.getByText("Resend the invitation for Chez Léa")).toBeTruthy();
  });

  it("falls back to the account's address when no invitation is known", () => {
    open({ restaurant: restaurant({ ownerEmail: "account@example.com", invitation: null }) });
    expect(screen.getByLabelText("Owner’s e-mail address").props.value).toBe("account@example.com");
  });

  it("starts blank, and titled as a first invitation, for a restaurant with neither", () => {
    open({ restaurant: restaurant({ ownerEmail: null, invitation: null }) });
    expect(screen.getByLabelText("Owner’s e-mail address").props.value).toBe("");
    expect(screen.getByText("Invite the owner of Chez Léa")).toBeTruthy();
  });

  it("sends the invitation and shows the link, said to have gone by e-mail", async () => {
    send.mockResolvedValue(ok(invitationResult({ restaurant: restaurant({ id: 3 }) })));
    const { onSaved } = open({
      restaurant: restaurant({ id: 3, ownerEmail: "lea@example.com", invitation: null }),
    });

    fireEvent.press(screen.getByText("English"));
    fireEvent.press(screen.getByText("Send the invitation"));

    await waitFor(() => expect(screen.getByTestId("invitation-link")).toBeTruthy());
    expect(send).toHaveBeenCalledWith(3, { email: "lea@example.com", locale: "en" });
    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ id: 3 }));
    expect(screen.getByTestId("invitation-email-status")).toHaveTextContent(
      "The invitation e-mail was sent to lea@example.com."
    );
  });

  it("says when no e-mail went out", async () => {
    send.mockResolvedValue(ok(invitationResult({ emailSent: false })));
    open({ restaurant: restaurant({ ownerEmail: "lea@example.com" }) });
    fireEvent.press(screen.getByText("Send the invitation"));
    await waitFor(() => expect(screen.getByTestId("invitation-must-copy")).toBeTruthy());
  });

  it("refuses a cleared address without calling the server", () => {
    open({ restaurant: restaurant({ ownerEmail: "lea@example.com" }) });
    fireEvent.changeText(screen.getByLabelText("Owner’s e-mail address"), "   ");
    fireEvent.press(screen.getByText("Send the invitation"));
    expect(screen.getByTestId("invitation-error")).toHaveTextContent(
      "Enter a valid e-mail address."
    );
    expect(send).not.toHaveBeenCalled();
  });

  it("shows the server's refusal and nothing else", async () => {
    send.mockResolvedValue(refused("Restaurant not found.", "platform.not_found"));
    const { onSaved } = open({ restaurant: restaurant({ ownerEmail: "lea@example.com" }) });
    fireEvent.press(screen.getByText("Send the invitation"));
    await waitFor(() => expect(screen.getByTestId("invitation-error")).toBeTruthy());
    expect(screen.getByTestId("invitation-error")).toHaveTextContent("Restaurant not found.");
    expect(onSaved).not.toHaveBeenCalled();
    expect(screen.queryByTestId("invitation-link")).toBeNull();
  });
});

describe("InvitationModal, the link is shown once", () => {
  it("is gone once the dialog is closed and opened again", async () => {
    send.mockResolvedValue(ok(invitationResult()));
    const target = restaurant({ ownerEmail: "lea@example.com" });
    const onClose = jest.fn();
    const first = render(
      <InvitationModal restaurant={target} onSaved={jest.fn()} onClose={onClose} />
    );

    fireEvent.press(screen.getByText("Send the invitation"));
    await waitFor(() => expect(screen.getByTestId("invitation-link")).toBeTruthy());

    fireEvent.press(screen.getByText("Close"));
    expect(onClose).toHaveBeenCalledTimes(1);
    // Closed without unmounting (as a test double does): the link is already dropped.
    expect(screen.queryByTestId("invitation-link")).toBeNull();
    first.unmount();

    render(<InvitationModal restaurant={target} onSaved={jest.fn()} onClose={jest.fn()} />);
    expect(screen.queryByTestId("invitation-link")).toBeNull();
    expect(screen.getByText("Send the invitation")).toBeTruthy();
  });
});
