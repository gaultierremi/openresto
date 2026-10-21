import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { OnboardingLoginScreen } from "@/components/onboarding/OnboardingLoginScreen";
import { login } from "@/api/auth";
import { useOnboardingSession } from "@/context/OnboardingSessionContext";

jest.mock("@/context/BrandContext", () => ({
  useBrand: () => ({ appName: "Open Resto", primaryColor: "#0a7ea4" }),
}));
jest.mock("@/utils/haptics", () => ({
  haptics: { selection: jest.fn(), press: jest.fn(), outcome: jest.fn() },
}));
jest.mock("@/api/auth", () => ({ login: jest.fn() }));
jest.mock("@/context/OnboardingSessionContext", () => ({ useOnboardingSession: jest.fn() }));

const mockReplace = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ replace: mockReplace }) }));

const mockLogin = login as jest.Mock;
const mockSession = useOnboardingSession as jest.Mock;
const refresh = jest.fn();
const signOut = jest.fn();

const fill = (email = "paul@chezpaul.be", password = "s3cret-password") => {
  fireEvent.changeText(screen.getByTestId("onboarding-login-email"), email);
  fireEvent.changeText(screen.getByTestId("onboarding-login-password"), password);
};
const submit = async () => {
  await act(async () => {
    fireEvent.press(screen.getByTestId("onboarding-login-submit"));
  });
};

beforeEach(() => {
  jest.clearAllMocks();
  mockSession.mockReturnValue({ refresh, signOut });
  mockLogin.mockResolvedValue({ message: "ok" });
  refresh.mockResolvedValue("authenticated");
});

describe("OnboardingLoginScreen", () => {
  it("tells a restaurateur who forgot their password to ask the platform for a new invitation", () => {
    render(<OnboardingLoginScreen />);
    expect(screen.getByTestId("onboarding-login-hint")).toHaveTextContent(
      "Forgot your password? Ask the platform for a new invitation."
    );
  });

  describe("the button", () => {
    it("waits for an address that looks like one and a password", () => {
      render(<OnboardingLoginScreen />);
      const disabled = () =>
        screen.getByTestId("onboarding-login-submit").props.accessibilityState.disabled;
      expect(disabled()).toBe(true);

      fireEvent.changeText(screen.getByTestId("onboarding-login-email"), "paul");
      fireEvent.changeText(screen.getByTestId("onboarding-login-password"), "x");
      expect(disabled()).toBe(true);

      fireEvent.changeText(screen.getByTestId("onboarding-login-email"), "paul@chezpaul.be");
      expect(disabled()).toBe(false);

      fireEvent.changeText(screen.getByTestId("onboarding-login-password"), "");
      expect(disabled()).toBe(true);
    });

    it("signs in nothing while it is disabled", async () => {
      render(<OnboardingLoginScreen />);
      await submit();
      expect(mockLogin).not.toHaveBeenCalled();
    });
  });

  describe("a good sign-in", () => {
    it("signs in with the trimmed address, reads the restaurateur's session, then lands on /onboarding", async () => {
      render(<OnboardingLoginScreen />);
      fill("  paul@chezpaul.be ");

      await submit();

      expect(mockLogin).toHaveBeenCalledWith("paul@chezpaul.be", "s3cret-password");
      expect(refresh).toHaveBeenCalledTimes(1);
      expect(mockReplace).toHaveBeenCalledWith("/onboarding");
      expect(screen.queryByTestId("onboarding-login-error")).toBeNull();
    });

    it("signs in from the password field's own submit key when the form is complete", async () => {
      render(<OnboardingLoginScreen />);
      fill();
      await act(async () => {
        fireEvent(screen.getByTestId("onboarding-login-password"), "submitEditing");
      });
      expect(mockLogin).toHaveBeenCalledTimes(1);
    });

    it("does nothing from the submit key when the form is not complete", async () => {
      render(<OnboardingLoginScreen />);
      fireEvent.changeText(screen.getByTestId("onboarding-login-email"), "paul@chezpaul.be");
      await act(async () => {
        fireEvent(screen.getByTestId("onboarding-login-password"), "submitEditing");
      });
      expect(mockLogin).not.toHaveBeenCalled();
    });

    it("moves from the address field to the password on the submit key", () => {
      render(<OnboardingLoginScreen />);
      fireEvent(screen.getByTestId("onboarding-login-email"), "submitEditing");
      expect(mockLogin).not.toHaveBeenCalled();
    });
  });

  describe("a wrong password", () => {
    it("shows the one generic message, reads no session and goes nowhere", async () => {
      mockLogin.mockResolvedValue(null);
      render(<OnboardingLoginScreen />);
      fill();

      await submit();

      expect(screen.getByTestId("onboarding-login-error")).toHaveTextContent(
        "Wrong e-mail address or password."
      );
      expect(refresh).not.toHaveBeenCalled();
      expect(mockReplace).not.toHaveBeenCalled();
    });

    it("lets the next attempt start from a clean message", async () => {
      mockLogin.mockResolvedValueOnce(null).mockResolvedValueOnce({ message: "ok" });
      render(<OnboardingLoginScreen />);
      fill();
      await submit();
      expect(screen.getByTestId("onboarding-login-error")).toBeTruthy();

      await submit();

      expect(screen.queryByTestId("onboarding-login-error")).toBeNull();
      expect(mockReplace).toHaveBeenCalledWith("/onboarding");
    });
  });

  describe("an account that is not a restaurateur", () => {
    it("is told so, stays on the screen and is signed out of nothing", async () => {
      refresh.mockResolvedValue("forbidden");
      render(<OnboardingLoginScreen />);
      fill();

      await submit();

      expect(screen.getByTestId("onboarding-login-error")).toHaveTextContent(
        "This is not a restaurateur account. Use the e-mail address your invitation was sent to."
      );
      expect(mockReplace).not.toHaveBeenCalled();
      expect(signOut).not.toHaveBeenCalled();
    });
  });

  describe("a session that could not be opened", () => {
    it.each(["unauthenticated", "error"])("says so when the check answers %p", async (verdict) => {
      refresh.mockResolvedValue(verdict);
      render(<OnboardingLoginScreen />);
      fill();

      await submit();

      expect(screen.getByTestId("onboarding-login-error")).toHaveTextContent(
        "You are signed in, but your session could not be opened. Try again."
      );
      expect(mockReplace).not.toHaveBeenCalled();
    });
  });
});
