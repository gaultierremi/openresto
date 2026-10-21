import React from "react";
import { render, screen } from "@testing-library/react-native";
import OnboardingIndexRoute from "@/app/onboarding/index";
import OnboardingLoginRoute from "@/app/onboarding/login";
import OnboardingInvitationRoute from "@/app/onboarding/invitation/[token]";
import OnboardingRestaurantRoute from "@/app/onboarding/restaurant/[id]";
import { useLocalSearchParams } from "expo-router";

jest.mock("expo-router", () => ({ useLocalSearchParams: jest.fn() }));
jest.mock("@/components/onboarding/OnboardingHome", () => {
  const { Text } = require("react-native");
  return { OnboardingHome: () => <Text testID="home">home</Text> };
});
jest.mock("@/components/onboarding/OnboardingLoginScreen", () => {
  const { Text } = require("react-native");
  return { OnboardingLoginScreen: () => <Text testID="login">login</Text> };
});
jest.mock("@/components/onboarding/InvitationScreen", () => {
  const { Text } = require("react-native");
  return {
    InvitationScreen: ({ token }: { token: string }) => <Text testID="invitation">{token}</Text>,
  };
});
jest.mock("@/components/onboarding/OnboardingWizard", () => {
  const { Text } = require("react-native");
  return {
    OnboardingWizard: ({ restaurantId }: { restaurantId: number }) => (
      <Text testID="wizard">{`${typeof restaurantId}:${restaurantId}`}</Text>
    ),
  };
});
jest.mock("@/components/onboarding/OnboardingNotFound", () => {
  const { Text } = require("react-native");
  return { OnboardingNotFound: () => <Text testID="not-found">not found</Text> };
});

const mockParams = useLocalSearchParams as jest.Mock;

describe("the onboarding routes", () => {
  it("resolve the index to the home screen and the login to the sign-in", () => {
    render(<OnboardingIndexRoute />);
    expect(screen.getByTestId("home")).toBeTruthy();
    render(<OnboardingLoginRoute />);
    expect(screen.getByTestId("login")).toBeTruthy();
  });

  it("hands the invitation screen the token of the address", () => {
    mockParams.mockReturnValue({ token: "abc-123" });
    render(<OnboardingInvitationRoute />);
    expect(screen.getByTestId("invitation")).toHaveTextContent("abc-123");
  });

  describe("the restaurant route", () => {
    it("hands the wizard the id as a number", () => {
      mockParams.mockReturnValue({ id: "42" });
      render(<OnboardingRestaurantRoute />);
      expect(screen.getByTestId("wizard")).toHaveTextContent("number:42");
    });

    it.each(["abc", "0", "-1", "1.5", "07", "1e3", "", "7 "])(
      "answers %p as a restaurant that does not exist, without asking the server",
      (id) => {
        mockParams.mockReturnValue({ id });
        render(<OnboardingRestaurantRoute />);
        expect(screen.getByTestId("not-found")).toBeTruthy();
        expect(screen.queryByTestId("wizard")).toBeNull();
      }
    );

    it("answers a missing id the same way", () => {
      mockParams.mockReturnValue({});
      render(<OnboardingRestaurantRoute />);
      expect(screen.getByTestId("not-found")).toBeTruthy();
    });
  });
});
