import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { ConsentsModal } from "@/components/admin/platform/ConsentsModal";
import { fetchPlatformConsents } from "@/api/platform";
import { acceptance, ok, refused, restaurant } from "@/tests/helpers/platformFixtures";

jest.mock("@/context/BrandContext", () => ({
  useBrand: () => ({ appName: "Open Resto", primaryColor: "#0a7ea4" }),
}));
jest.mock("@/api/platform", () => ({ fetchPlatformConsents: jest.fn() }));

const fetchConsents = fetchPlatformConsents as jest.Mock;
beforeEach(() => fetchConsents.mockReset());

const open = (onClose = jest.fn()) => {
  render(<ConsentsModal restaurant={restaurant({ id: 6 })} onClose={onClose} />);
  return onClose;
};

describe("ConsentsModal", () => {
  it("lists document, version, e-mail, date and a short fingerprint of each consent", async () => {
    fetchConsents.mockResolvedValue(
      ok([
        acceptance({ documentKey: "terms" }),
        acceptance({ documentKey: "dpa", version: "2026-09-01", email: "other@example.com" }),
      ])
    );
    open();

    await waitFor(() => expect(screen.getAllByTestId("consent-row")).toHaveLength(2));
    expect(fetchConsents).toHaveBeenCalledWith(6);
    expect(screen.getByText("Terms of use")).toBeTruthy();
    expect(screen.getByText("Data processing agreement")).toBeTruthy();
    expect(screen.getByText("Version 2026-09-01")).toBeTruthy();
    expect(screen.getByText("E-mail: other@example.com")).toBeTruthy();
    expect(screen.getAllByText(/^Date: /)).toHaveLength(2);
    expect(screen.getAllByText("Fingerprint: 0123456789ab")).toHaveLength(2);
    // The whole hash is the server's: only the short form is drawn.
    expect(screen.queryByText(/0123456789abcdef0123/)).toBeNull();
  });

  it("prints a document key it does not know as it came", async () => {
    fetchConsents.mockResolvedValue(ok([acceptance({ documentKey: "cookies" })]));
    open();
    await waitFor(() => expect(screen.getByText("cookies")).toBeTruthy());
  });

  it("says so when nothing was consented to yet", async () => {
    fetchConsents.mockResolvedValue(ok([]));
    open();
    await waitFor(() => expect(screen.getByTestId("consents-empty")).toBeTruthy());
    expect(screen.queryByTestId("consent-row")).toBeNull();
  });

  it("shows the refusal instead of an empty list", async () => {
    fetchConsents.mockResolvedValue(refused("Restaurant not found.", "platform.not_found"));
    open();
    await waitFor(() => expect(screen.getByText(/The consents could not be loaded/)).toBeTruthy());
    expect(screen.getByText(/Restaurant not found\./)).toBeTruthy();
    expect(screen.queryByTestId("consents-empty")).toBeNull();
  });

  it("closes", async () => {
    fetchConsents.mockResolvedValue(ok([]));
    const onClose = open();
    await waitFor(() => expect(screen.getByTestId("consents-empty")).toBeTruthy());
    fireEvent.press(screen.getByText("Close"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not write to state after it was closed before the answer came", async () => {
    let resolve: (value: unknown) => void = () => {};
    fetchConsents.mockReturnValue(new Promise((r) => (resolve = r)));
    const view = render(<ConsentsModal restaurant={restaurant({ id: 6 })} onClose={jest.fn()} />);
    view.unmount();
    await act(async () => {
      resolve(ok([acceptance()]));
    });
    expect(fetchConsents).toHaveBeenCalledTimes(1);
  });
});
