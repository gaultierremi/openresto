import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { InvitationLinkPanel } from "@/components/admin/platform/InvitationLinkPanel";
import { copyToClipboard } from "@/components/admin/settings/clipboard";

jest.mock("@/context/BrandContext", () => ({
  useBrand: () => ({ appName: "Open Resto", primaryColor: "#0a7ea4" }),
}));
jest.mock("@/components/admin/settings/clipboard", () => ({
  ...jest.requireActual("@/components/admin/settings/clipboard"),
  copyToClipboard: jest.fn(),
}));

const copy = copyToClipboard as jest.Mock;
const URL_ = "https://resto.example/onboarding/accept?token=abcdef123456";

const panel = (emailSent: boolean) =>
  render(<InvitationLinkPanel url={URL_} emailSent={emailSent} email="lea@example.com" />);

beforeEach(() => copy.mockReset());

describe("InvitationLinkPanel", () => {
  it("shows the link in a read-only field, and says it is shown only once", () => {
    panel(true);
    const field = screen.getByTestId("invitation-link");
    expect(field.props.value).toBe(URL_);
    expect(field.props.editable).toBe(false);
    expect(screen.getByText(/shown only once and is not stored/)).toBeTruthy();
  });

  it("says the e-mail went out, to whom, and does not push the admin to pass the link on", () => {
    panel(true);
    expect(screen.getByTestId("invitation-email-status")).toHaveTextContent(
      "The invitation e-mail was sent to lea@example.com."
    );
    expect(screen.queryByTestId("invitation-must-copy")).toBeNull();
  });

  it("says no e-mail went out and that the link has to be copied now", () => {
    panel(false);
    expect(screen.getByTestId("invitation-email-status")).toHaveTextContent(/No e-mail went out/);
    expect(screen.getByTestId("invitation-must-copy")).toHaveTextContent(/copy the link now/);
    expect(screen.queryByText(/was sent to/)).toBeNull();
  });

  it("copies the link and confirms only once the write landed", async () => {
    copy.mockResolvedValue(true);
    panel(true);
    fireEvent.press(screen.getByText("Copy"));
    expect(copy).toHaveBeenCalledWith(URL_);
    await waitFor(() => expect(screen.getByText("Copied")).toBeTruthy());
    expect(screen.queryByTestId("invitation-copy-failed")).toBeNull();
  });

  it("returns to the resting label after the confirmation window", async () => {
    copy.mockResolvedValue(true);
    panel(true);
    fireEvent.press(screen.getByText("Copy"));
    await waitFor(() => expect(screen.getByText("Copied")).toBeTruthy());
    await waitFor(() => expect(screen.getByText("Copy")).toBeTruthy(), { timeout: 3000 });
  });

  it("restarts the confirmation window on a second copy", async () => {
    copy.mockResolvedValue(true);
    panel(true);
    fireEvent.press(screen.getByText("Copy"));
    await waitFor(() => expect(screen.getByText("Copied")).toBeTruthy());
    fireEvent.press(screen.getByText("Copied"));
    await waitFor(() => expect(copy).toHaveBeenCalledTimes(2));
    expect(screen.getByText("Copied")).toBeTruthy();
  });

  it("does not confirm a copy the clipboard refused, and says to copy by hand", async () => {
    copy.mockResolvedValue(false);
    panel(true);
    fireEvent.press(screen.getByText("Copy"));
    await waitFor(() => expect(screen.getByTestId("invitation-copy-failed")).toBeTruthy());
    expect(screen.queryByText("Copied")).toBeNull();
    expect(screen.getByText("Copy")).toBeTruthy();
  });
});
