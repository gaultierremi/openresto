import React from "react";
import { render } from "@testing-library/react-native";
import RestaurantMenuRoute from "@/app/menu/r/[token]";
import TableMenuRoute from "@/app/menu/t/[token]";

const mockScreen = jest.fn();
jest.mock("@/components/menu/PublicMenuScreen", () => ({
  PublicMenuScreen: (props: { kind: string; token: string }) => {
    mockScreen(props);
    return null;
  },
}));

const mockParams = jest.fn();
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => mockParams(),
}));

describe("public menu routes", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockParams.mockReturnValue({ token: "abc123" });
  });

  it("opens the restaurant menu for /menu/r/<token>", () => {
    render(<RestaurantMenuRoute />);
    expect(mockScreen).toHaveBeenCalledWith({ kind: "r", token: "abc123" });
  });

  it("opens the table menu for /menu/t/<token>", () => {
    render(<TableMenuRoute />);
    expect(mockScreen).toHaveBeenCalledWith({ kind: "t", token: "abc123" });
  });
});
