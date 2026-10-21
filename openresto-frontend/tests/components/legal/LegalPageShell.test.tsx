import React from "react";
import { Text } from "react-native";
import { render, screen } from "@testing-library/react-native";
import { LegalPageShell } from "@/components/legal/LegalPageShell";

jest.mock("@/context/BrandContext", () => ({
  useBrand: () => ({ appName: "Open Resto", primaryColor: "#0a7ea4" }),
}));
jest.mock("@/components/layout/Footer", () => {
  const { Text: T } = require("react-native");
  return { __esModule: true, default: () => <T testID="footer">footer</T> };
});

describe("LegalPageShell", () => {
  it("shows the review banner above the page when the text needs review", () => {
    render(
      <LegalPageShell reviewPending>
        <Text>body</Text>
      </LegalPageShell>
    );
    expect(screen.getByTestId("legal-review-banner")).toBeTruthy();
    expect(screen.getByText("body")).toBeTruthy();
  });

  it("shows no banner when nothing is pending", () => {
    render(
      <LegalPageShell reviewPending={false}>
        <Text>body</Text>
      </LegalPageShell>
    );
    expect(screen.queryByTestId("legal-review-banner")).toBeNull();
  });

  it("ends on the guest footer", () => {
    render(
      <LegalPageShell reviewPending={false}>
        <Text>body</Text>
      </LegalPageShell>
    );
    expect(screen.getByTestId("footer")).toBeTruthy();
  });
});
