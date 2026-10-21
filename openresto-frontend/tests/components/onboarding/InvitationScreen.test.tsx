import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { InvitationScreen } from "@/components/onboarding/InvitationScreen";
import { acceptInvitation, getInvitation } from "@/api/onboarding";
import { useOnboardingSession } from "@/context/OnboardingSessionContext";
import { openExternal } from "@/utils/openExternal";
import { invitation, ok, refused } from "@/tests/helpers/onboardingFixtures";

jest.mock("@/context/BrandContext", () => ({
  useBrand: () => ({ appName: "Open Resto", primaryColor: "#0a7ea4" }),
}));
jest.mock("@/utils/haptics", () => ({
  haptics: { selection: jest.fn(), press: jest.fn(), outcome: jest.fn() },
}));
jest.mock("@/utils/openExternal", () => ({ openExternal: jest.fn() }));
jest.mock("@/api/onboarding", () => ({ getInvitation: jest.fn(), acceptInvitation: jest.fn() }));
jest.mock("@/context/OnboardingSessionContext", () => ({ useOnboardingSession: jest.fn() }));

const mockReplace = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ replace: mockReplace }) }));

const mockGet = getInvitation as jest.Mock;
const mockAccept = acceptInvitation as jest.Mock;
const mockSession = useOnboardingSession as jest.Mock;
const mockOpen = openExternal as jest.Mock;
const refresh = jest.fn();

const TEN = "abcdefghij";
const DOCS = ["terms", "privacy", "dpa"] as const;

const renderScreen = async () => {
  render(<InvitationScreen token="tok-123" />);
  await act(async () => {});
};

const type = (testID: string, text: string) =>
  fireEvent.changeText(screen.getByTestId(testID), text);
const password = (value: string, confirmation = value) => {
  type("invitation-password", value);
  type("invitation-confirm", confirmation);
};
const tick = (...keys: string[]) =>
  keys.forEach((key) => fireEvent.press(screen.getByTestId(`invitation-consent-${key}`)));
const disabled = () => screen.getByTestId("invitation-submit").props.accessibilityState.disabled;
const submit = async () => {
  await act(async () => {
    fireEvent.press(screen.getByTestId("invitation-submit"));
  });
};

beforeEach(() => {
  jest.clearAllMocks();
  mockSession.mockReturnValue({ refresh });
  refresh.mockResolvedValue("authenticated");
  mockGet.mockResolvedValue(ok(invitation()));
  mockAccept.mockResolvedValue(ok({ restaurantId: 7 }));
});

describe("InvitationScreen", () => {
  it("loads the invitation of its token", async () => {
    await renderScreen();
    expect(mockGet).toHaveBeenCalledWith("tok-123");
  });

  it("says it is loading until the preview arrives", () => {
    mockGet.mockReturnValue(new Promise(() => {}));
    render(<InvitationScreen token="tok-123" />);
    expect(screen.getByTestId("invitation-loading")).toBeTruthy();
    expect(screen.queryByTestId("invitation-submit")).toBeNull();
  });

  describe("what the account will be", () => {
    it("shows the restaurant and the address the account will use, as text and not as fields", async () => {
      await renderScreen();
      expect(screen.getByText("Chez Paul")).toBeTruthy();
      expect(screen.getByText("paul@chezpaul.be")).toBeTruthy();
      expect(screen.queryByDisplayValue("paul@chezpaul.be")).toBeNull();
      expect(screen.queryByDisplayValue("Chez Paul")).toBeNull();
    });

    it("offers an optional display name", async () => {
      await renderScreen();
      expect(screen.getByText("Your name (optional)")).toBeTruthy();
      expect(screen.getByTestId("invitation-display-name")).toBeTruthy();
    });

    it("states the password rule", async () => {
      await renderScreen();
      expect(screen.getByTestId("invitation-rule")).toHaveTextContent("At least 10 characters.");
    });
  });

  describe("the three consents", () => {
    it("shows one separate, unchecked checkbox per document of the preview, each with its link", async () => {
      await renderScreen();
      expect(screen.getAllByRole("checkbox")).toHaveLength(3);
      for (const key of DOCS) {
        expect(
          screen.getByTestId(`invitation-consent-${key}`).props.accessibilityState.checked
        ).toBe(false);
        expect(screen.getByTestId(`invitation-consent-${key}-link`)).toBeTruthy();
      }
      expect(
        screen.getByRole("checkbox", { name: "I have read and accept the terms of use" })
      ).toBeTruthy();
      expect(
        screen.getByRole("checkbox", { name: "I have read and accept the privacy policy" })
      ).toBeTruthy();
      expect(
        screen.getByRole("checkbox", {
          name: "I have read and accept the data processing agreement (DPA)",
        })
      ).toBeTruthy();
    });

    it("follows the documents the server names, not a fixed list", async () => {
      mockGet.mockResolvedValue(
        ok(
          invitation({
            documents: [
              { key: "terms", version: "1" },
              { key: "charter", version: "3" },
            ],
          })
        )
      );
      await renderScreen();
      expect(screen.getAllByRole("checkbox")).toHaveLength(2);
      expect(screen.getByRole("checkbox", { name: "I have read and accept charter" })).toBeTruthy();
    });

    it("opens each document in a new tab from its own link, without ticking it", async () => {
      await renderScreen();
      fireEvent.press(screen.getByTestId("invitation-consent-terms-link"));
      fireEvent.press(screen.getByTestId("invitation-consent-privacy-link"));
      fireEvent.press(screen.getByTestId("invitation-consent-dpa-link"));
      expect(mockOpen.mock.calls.map((c) => c[0])).toEqual([
        "/legal/terms",
        "/legal/privacy",
        "/legal/dpa",
      ]);
      expect(screen.getByTestId("invitation-consent-terms").props.accessibilityState.checked).toBe(
        false
      );
    });

    it("ticks and unticks one document without touching the others", async () => {
      await renderScreen();
      tick("privacy");
      expect(
        screen.getByTestId("invitation-consent-privacy").props.accessibilityState.checked
      ).toBe(true);
      expect(screen.getByTestId("invitation-consent-terms").props.accessibilityState.checked).toBe(
        false
      );
      tick("privacy");
      expect(
        screen.getByTestId("invitation-consent-privacy").props.accessibilityState.checked
      ).toBe(false);
    });
  });

  describe("the button", () => {
    it("stays disabled until all three documents are ticked", async () => {
      await renderScreen();
      password(TEN);
      expect(disabled()).toBe(true);
      tick("terms");
      expect(disabled()).toBe(true);
      tick("privacy");
      expect(disabled()).toBe(true);
      tick("dpa");
      expect(disabled()).toBe(false);
    });

    it("goes back to disabled when one document is unticked", async () => {
      await renderScreen();
      password(TEN);
      tick(...DOCS);
      expect(disabled()).toBe(false);
      tick("dpa");
      expect(disabled()).toBe(true);
    });

    it("stays disabled for nine characters and enables at ten, with every document ticked", async () => {
      await renderScreen();
      tick(...DOCS);
      password(TEN.slice(0, 9));
      expect(disabled()).toBe(true);
      password(TEN);
      expect(disabled()).toBe(false);
    });

    it("stays disabled while the confirmation differs, and says so", async () => {
      await renderScreen();
      tick(...DOCS);
      password(TEN, `${TEN}x`);
      expect(disabled()).toBe(true);
      expect(screen.getByTestId("invitation-confirm-field-error")).toHaveTextContent(
        "The two passwords do not match."
      );
      type("invitation-confirm", TEN);
      expect(disabled()).toBe(false);
      expect(screen.queryByTestId("invitation-confirm-field-error")).toBeNull();
    });

    it("does not nag about a confirmation that is still empty", async () => {
      await renderScreen();
      type("invitation-password", TEN);
      expect(screen.queryByTestId("invitation-confirm-field-error")).toBeNull();
    });

    it("sends nothing when pressed while disabled", async () => {
      await renderScreen();
      password(TEN);
      tick("terms", "privacy");
      await submit();
      expect(mockAccept).not.toHaveBeenCalled();
    });
  });

  describe("the password field", () => {
    it("is hidden by default and shown or hidden again from its button, both fields together", async () => {
      await renderScreen();
      expect(screen.getByTestId("invitation-password").props.secureTextEntry).toBe(true);
      expect(screen.getByTestId("invitation-confirm").props.secureTextEntry).toBe(true);

      fireEvent.press(screen.getByRole("button", { name: "Show the password" }));
      expect(screen.getByTestId("invitation-password").props.secureTextEntry).toBe(false);
      expect(screen.getByTestId("invitation-confirm").props.secureTextEntry).toBe(false);

      fireEvent.press(screen.getByRole("button", { name: "Hide the password" }));
      expect(screen.getByTestId("invitation-password").props.secureTextEntry).toBe(true);
    });

    it("turns the rule red once something shorter than ten is typed", async () => {
      await renderScreen();
      const rule = () => screen.getByTestId("invitation-rule");
      const before = rule().props.style;
      type("invitation-password", "short");
      expect(JSON.stringify(rule().props.style)).not.toBe(JSON.stringify(before));
    });
  });

  describe("creating the account", () => {
    it("posts the password, the name and exactly the key and version pairs the preview returned", async () => {
      mockGet.mockResolvedValue(
        ok(
          invitation({
            documents: [
              { key: "terms", version: "2026-10" },
              { key: "privacy", version: "2026-09" },
              { key: "dpa", version: "2026-10" },
            ],
          })
        )
      );
      await renderScreen();
      type("invitation-display-name", "  Paul Dupont ");
      password(TEN);
      tick(...DOCS);

      await submit();

      expect(mockAccept).toHaveBeenCalledTimes(1);
      expect(mockAccept).toHaveBeenCalledWith("tok-123", {
        password: TEN,
        displayName: "Paul Dupont",
        acceptedDocuments: [
          { key: "terms", version: "2026-10" },
          { key: "privacy", version: "2026-09" },
          { key: "dpa", version: "2026-10" },
        ],
      });
    });

    it("sends a blank display name as none", async () => {
      await renderScreen();
      type("invitation-display-name", "   ");
      password(TEN);
      tick(...DOCS);
      await submit();
      expect(mockAccept.mock.calls[0][1].displayName).toBeNull();
    });

    it("reads the new session before landing on the restaurant, so the layout does not send it to sign in", async () => {
      const order: string[] = [];
      refresh.mockImplementation(async () => {
        order.push("refresh");
        return "authenticated";
      });
      mockReplace.mockImplementation(() => order.push("replace"));
      await renderScreen();
      password(TEN);
      tick(...DOCS);

      await submit();

      expect(order).toEqual(["refresh", "replace"]);
      expect(mockReplace).toHaveBeenCalledWith("/onboarding/restaurant/7");
    });

    it("lands on the restaurant the server names", async () => {
      mockAccept.mockResolvedValue(ok({ restaurantId: 42 }));
      await renderScreen();
      password(TEN);
      tick(...DOCS);
      await submit();
      expect(mockReplace).toHaveBeenCalledWith("/onboarding/restaurant/42");
    });
  });

  describe("a refusal by the server", () => {
    it("shows a short password in the viewer's language and goes nowhere", async () => {
      mockAccept.mockResolvedValue(
        refused("Password must be at least 10 characters.", 400, "user.password_too_short")
      );
      await renderScreen();
      password(TEN);
      tick(...DOCS);

      await submit();

      expect(screen.getByTestId("invitation-error-banner")).toHaveTextContent(
        "Password must be at least 10 characters."
      );
      expect(refresh).not.toHaveBeenCalled();
      expect(mockReplace).not.toHaveBeenCalled();
    });

    it("keeps what was typed and ticked after a refusal", async () => {
      mockAccept.mockResolvedValue(refused("Nope.", 400, "user.password_too_short"));
      await renderScreen();
      type("invitation-display-name", "Paul");
      password(TEN);
      tick(...DOCS);
      await submit();
      expect(screen.getByTestId("invitation-display-name").props.value).toBe("Paul");
      expect(screen.getByTestId("invitation-password").props.value).toBe(TEN);
      expect(screen.getByTestId("invitation-consent-dpa").props.accessibilityState.checked).toBe(
        true
      );
    });

    it("clears the message when the next attempt starts", async () => {
      mockAccept
        .mockResolvedValueOnce(refused("Nope.", 400, "user.password_too_short"))
        .mockResolvedValueOnce(ok({ restaurantId: 7 }));
      await renderScreen();
      password(TEN);
      tick(...DOCS);
      await submit();
      expect(screen.getByTestId("invitation-error-banner")).toBeTruthy();

      await submit();

      expect(screen.queryByTestId("invitation-error-banner")).toBeNull();
      expect(mockReplace).toHaveBeenCalledWith("/onboarding/restaurant/7");
    });

    it("reloads the documents when they changed, clears every box and asks again", async () => {
      mockGet.mockResolvedValueOnce(ok(invitation())).mockResolvedValueOnce(
        ok(
          invitation({
            documents: [
              { key: "terms", version: "2026-11" },
              { key: "privacy", version: "2026-10" },
              { key: "dpa", version: "2026-10" },
            ],
          })
        )
      );
      mockAccept.mockResolvedValueOnce(
        refused(
          "The documents have been updated since they were shown. Read them again, then tick the boxes again.",
          400,
          "onboarding.consent_outdated"
        )
      );
      await renderScreen();
      password(TEN);
      tick(...DOCS);

      await submit();

      expect(mockGet).toHaveBeenCalledTimes(2);
      expect(screen.getByTestId("invitation-error-banner")).toHaveTextContent(
        /The documents have been updated since they were shown/
      );
      for (const key of DOCS) {
        expect(
          screen.getByTestId(`invitation-consent-${key}`).props.accessibilityState.checked
        ).toBe(false);
      }
      expect(disabled()).toBe(true);
      expect(mockReplace).not.toHaveBeenCalled();

      // Ticked again, the new version is the one sent.
      tick(...DOCS);
      await submit();
      expect(mockAccept.mock.calls[1][1].acceptedDocuments[0]).toEqual({
        key: "terms",
        version: "2026-11",
      });
    });

    it("still clears the boxes and shows the message when the documents cannot be reloaded", async () => {
      mockGet.mockResolvedValueOnce(ok(invitation())).mockResolvedValueOnce(refused("down", 500));
      mockAccept.mockResolvedValueOnce(refused("Outdated.", 400, "onboarding.consent_outdated"));
      await renderScreen();
      password(TEN);
      tick(...DOCS);

      await submit();

      expect(screen.getByTestId("invitation-error-banner")).toHaveTextContent("Outdated.");
      expect(screen.getByTestId("invitation-consent-terms").props.accessibilityState.checked).toBe(
        false
      );
      expect(screen.getByTestId("invitation-submit")).toBeTruthy();
    });

    it("shows the invalid screen, with no form, when the link stops being valid while the form is open", async () => {
      mockAccept.mockResolvedValue(refused("gone", 404, "platform.invitation_invalid"));
      await renderScreen();
      password(TEN);
      tick(...DOCS);

      await submit();

      expect(screen.getByTestId("invitation-invalid")).toBeTruthy();
      expect(screen.queryByTestId("invitation-submit")).toBeNull();
      expect(mockReplace).not.toHaveBeenCalled();
    });
  });

  describe("an invalid, expired or used link", () => {
    beforeEach(() =>
      mockGet.mockResolvedValue(refused("gone", 404, "platform.invitation_invalid"))
    );

    it("shows a clear message and no form at all", async () => {
      await renderScreen();
      expect(screen.getByText("Invalid or expired invitation")).toBeTruthy();
      expect(screen.getByText(/no longer valid: it may have expired/)).toBeTruthy();
      expect(screen.queryByTestId("invitation-submit")).toBeNull();
      expect(screen.queryByTestId("invitation-password")).toBeNull();
      expect(screen.queryByTestId("invitation-display-name")).toBeNull();
      expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
      expect(screen.queryByText("paul@chezpaul.be")).toBeNull();
    });

    it("leads to sign-in", async () => {
      await renderScreen();
      fireEvent.press(screen.getByTestId("invitation-invalid-login"));
      expect(mockReplace).toHaveBeenCalledWith("/onboarding/login");
    });
  });

  describe("a preview that could not be loaded", () => {
    it("is not taken for an invalid link: it says so and offers to try again", async () => {
      mockGet.mockResolvedValueOnce(refused("The server could not be reached.", 0));
      await renderScreen();
      expect(screen.getByTestId("invitation-error")).toBeTruthy();
      expect(screen.getByText("The server could not be reached.")).toBeTruthy();
      expect(screen.queryByTestId("invitation-invalid")).toBeNull();
      expect(screen.queryByTestId("invitation-submit")).toBeNull();
    });

    it("loads again on retry and then shows the form", async () => {
      mockGet.mockResolvedValueOnce(refused("down", 500)).mockResolvedValueOnce(ok(invitation()));
      await renderScreen();

      await act(async () => {
        fireEvent.press(screen.getByTestId("invitation-retry"));
      });

      await waitFor(() => expect(screen.getByTestId("invitation-submit")).toBeTruthy());
      expect(mockGet).toHaveBeenCalledTimes(2);
    });
  });

  it("ignores a preview that arrives after the screen was closed", async () => {
    let resolve: (value: unknown) => void = () => {};
    mockGet.mockReturnValue(new Promise((r) => (resolve = r)));
    const view = render(<InvitationScreen token="tok-123" />);
    view.unmount();
    await act(async () => resolve(ok(invitation())));
    expect(mockAccept).not.toHaveBeenCalled();
  });
});
