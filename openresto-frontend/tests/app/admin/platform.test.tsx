import React from "react";
import { render, screen } from "@testing-library/react-native";
import AdminPlatformRoute from "@/app/admin/platform/index";
import { useAuth, useCan } from "@/context/AuthContext";

jest.mock("@/context/AuthContext", () => ({ useAuth: jest.fn(), useCan: jest.fn() }));
jest.mock("expo-router", () => {
  const { Text } = require("react-native");
  return { Redirect: ({ href }: { href: string }) => <Text testID="redirect">{href}</Text> };
});
jest.mock("@/components/common/PageLoader", () => {
  const { Text } = require("react-native");
  return { __esModule: true, default: () => <Text testID="loader">loading</Text> };
});
jest.mock("@/components/admin/platform/PlatformScreen", () => {
  const { Text } = require("react-native");
  return { PlatformScreen: () => <Text testID="platform-screen">platform</Text> };
});

const mockUseAuth = useAuth as jest.Mock;
const mockUseCan = useCan as jest.Mock;

describe("admin platform route", () => {
  it("waits for the session before deciding, so an Owner is not bounced on a cold load", () => {
    mockUseAuth.mockReturnValue({ status: "loading" });
    mockUseCan.mockReturnValue(false);
    render(<AdminPlatformRoute />);
    expect(screen.getByTestId("loader")).toBeTruthy();
    expect(screen.queryByTestId("redirect")).toBeNull();
    expect(screen.queryByTestId("platform-screen")).toBeNull();
  });

  it("renders the platform space for an Owner", () => {
    mockUseAuth.mockReturnValue({ status: "authenticated" });
    mockUseCan.mockReturnValue(true);
    render(<AdminPlatformRoute />);
    expect(mockUseCan).toHaveBeenCalledWith("manage:platform");
    expect(screen.getByTestId("platform-screen")).toBeTruthy();
    expect(screen.queryByTestId("redirect")).toBeNull();
  });

  it("sends a Manager to the dashboard and never mounts the screen", () => {
    mockUseAuth.mockReturnValue({ status: "authenticated" });
    mockUseCan.mockReturnValue(false);
    render(<AdminPlatformRoute />);
    expect(screen.getByTestId("redirect")).toHaveTextContent("/admin/dashboard");
    expect(screen.queryByTestId("platform-screen")).toBeNull();
  });
});
