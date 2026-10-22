import React from "react";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { OnboardingHome } from "@/components/onboarding/OnboardingHome";
import { OnboardingNotFound } from "@/components/onboarding/OnboardingNotFound";
import { useOnboardingSession } from "@/context/OnboardingSessionContext";
import { me } from "@/tests/helpers/onboardingFixtures";

jest.mock("@/context/BrandContext", () => ({
  useBrand: () => ({ appName: "Open Resto", primaryColor: "#0a7ea4" }),
}));
jest.mock("@/utils/haptics", () => ({
  haptics: { selection: jest.fn(), press: jest.fn(), outcome: jest.fn() },
}));
jest.mock("@/context/OnboardingSessionContext", () => ({ useOnboardingSession: jest.fn() }));

const mockReplace = jest.fn();
const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ replace: mockReplace, push: mockPush }),
}));

const mockSession = useOnboardingSession as jest.Mock;
const signOut = jest.fn();

beforeEach(() => jest.clearAllMocks());

describe("OnboardingHome", () => {
  it("goes straight to the assistant of the only restaurant", () => {
    mockSession.mockReturnValue({ me: me(), signOut });
    render(<OnboardingHome />);
    expect(mockReplace).toHaveBeenCalledWith("/onboarding/restaurant/7");
    expect(screen.getByTestId("onboarding-home-loading")).toBeTruthy();
    expect(screen.queryByTestId("onboarding-home")).toBeNull();
  });

  it("waits, without going anywhere, until the session names the account", () => {
    mockSession.mockReturnValue({ me: null, signOut });
    render(<OnboardingHome />);
    expect(screen.getByTestId("onboarding-home-loading")).toBeTruthy();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("explains an account with no restaurant, and goes nowhere", () => {
    mockSession.mockReturnValue({ me: me({ restaurants: [] }), signOut });
    render(<OnboardingHome />);
    expect(screen.getByText("No restaurant yet")).toBeTruthy();
    expect(screen.getByText(/appears here once the platform invites you/)).toBeTruthy();
    expect(screen.queryByTestId("onboarding-home-restaurant-7")).toBeNull();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("lists the restaurants of an account that runs several, and goes nowhere by itself", () => {
    mockSession.mockReturnValue({
      me: me({
        restaurants: [
          { id: 7, name: "Chez Paul", status: "Draft" },
          { id: 9, name: "Chez Marie", status: "Published" },
        ],
      }),
      signOut,
    });
    render(<OnboardingHome />);
    expect(screen.getByText("Choose a restaurant")).toBeTruthy();
    expect(mockReplace).not.toHaveBeenCalled();

    fireEvent.press(screen.getByTestId("onboarding-home-restaurant-9"));
    expect(mockPush).toHaveBeenCalledWith("/onboarding/dashboard/9");
  });

  it("signs out from the empty state", () => {
    mockSession.mockReturnValue({ me: me({ restaurants: [] }), signOut });
    render(<OnboardingHome />);
    fireEvent.press(screen.getByTestId("onboarding-home-sign-out"));
    expect(signOut).toHaveBeenCalledTimes(1);
  });
});

describe("OnboardingNotFound", () => {
  it("says the restaurant was not found, and leads back to the list", () => {
    render(<OnboardingNotFound />);
    expect(screen.getByText("Restaurant not found")).toBeTruthy();
    expect(
      screen.getByText("This restaurant does not exist, or it is not linked to your account.")
    ).toBeTruthy();
    fireEvent.press(screen.getByTestId("wizard-not-found-back"));
    expect(mockReplace).toHaveBeenCalledWith("/onboarding");
  });
});
