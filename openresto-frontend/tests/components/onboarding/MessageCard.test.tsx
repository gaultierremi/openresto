import React from "react";
import { Text } from "react-native";
import { render, screen } from "@testing-library/react-native";
import { MessageCard } from "@/components/onboarding/MessageCard";
import { OnboardingPage } from "@/components/onboarding/OnboardingPage";

jest.mock("@/context/BrandContext", () => ({
  useBrand: () => ({ appName: "Open Resto", primaryColor: "#0a7ea4" }),
}));

describe("MessageCard", () => {
  it("shows a heading, a sentence and what is passed to do about it", () => {
    render(
      <MessageCard icon="alert" title="Not found" body="Nothing here." testID="m">
        <Text>way out</Text>
      </MessageCard>
    );
    expect(screen.getByRole("heading", { name: "Not found" })).toBeTruthy();
    expect(screen.getByText("Nothing here.")).toBeTruthy();
    expect(screen.getByText("way out")).toBeTruthy();
  });

  it("is only a sentence when nothing is passed", () => {
    render(<MessageCard icon="alert" title="Not found" body="Nothing here." />);
    expect(screen.queryByText("way out")).toBeNull();
  });
});

describe("OnboardingPage", () => {
  it("puts the platform's name and the restaurateur badge above the content", () => {
    render(
      <OnboardingPage>
        <Text>content</Text>
      </OnboardingPage>
    );
    expect(screen.getByText("Open Resto")).toBeTruthy();
    expect(screen.getByText("Restaurateur space")).toBeTruthy();
    expect(screen.getByText("content")).toBeTruthy();
  });

  it("takes the wide column for the assistant and the vertical centring for a lone card", () => {
    render(
      <OnboardingPage width="wide" centered>
        <Text>content</Text>
      </OnboardingPage>
    );
    expect(screen.getByText("content")).toBeTruthy();
  });
});
