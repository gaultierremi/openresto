import React from "react";
import { render, screen } from "@testing-library/react-native";
import MenuLayout from "@/app/menu/_layout";

const mockUseNoIndex = jest.fn();
jest.mock("@/hooks/use-noindex", () => ({
  useNoIndex: () => mockUseNoIndex(),
}));

jest.mock("expo-router", () => {
  const { View: RNView } = require("react-native");
  const ReactLib = require("react");
  return { Slot: () => ReactLib.createElement(RNView, { testID: "slot" }) };
});

describe("MenuLayout", () => {
  beforeEach(() => jest.clearAllMocks());

  it("keeps the routes under it out of search indexes", () => {
    render(<MenuLayout />);
    expect(mockUseNoIndex).toHaveBeenCalledTimes(1);
  });

  it("renders the matched route and nothing else around it", () => {
    const { toJSON } = render(<MenuLayout />);
    expect(screen.getByTestId("slot")).toBeTruthy();
    expect(toJSON()).toMatchObject({ props: { testID: "slot" } });
  });
});
