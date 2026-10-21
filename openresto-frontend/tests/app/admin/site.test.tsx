import React from "react";
import { render, screen } from "@testing-library/react-native";
import AdminSiteRoute from "@/app/admin/site/index";
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
jest.mock("@/components/admin/site/SiteScreen", () => {
  const { Text } = require("react-native");
  return { SiteScreen: () => <Text testID="site-screen">site</Text> };
});

const mockUseAuth = useAuth as jest.Mock;
const mockUseCan = useCan as jest.Mock;

describe("admin site route", () => {
  it("waits for the session before deciding, so an admin is not bounced on a cold load", () => {
    mockUseAuth.mockReturnValue({ status: "loading" });
    mockUseCan.mockReturnValue(false);
    render(<AdminSiteRoute />);
    expect(screen.getByTestId("loader")).toBeTruthy();
    expect(screen.queryByTestId("redirect")).toBeNull();
    expect(screen.queryByTestId("site-screen")).toBeNull();
  });

  it("renders the website screen for someone who may manage it", () => {
    mockUseAuth.mockReturnValue({ status: "authenticated" });
    mockUseCan.mockReturnValue(true);
    render(<AdminSiteRoute />);
    expect(mockUseCan).toHaveBeenCalledWith("manage:site");
    expect(screen.getByTestId("site-screen")).toBeTruthy();
  });

  it("sends anyone else to the dashboard", () => {
    mockUseAuth.mockReturnValue({ status: "authenticated" });
    mockUseCan.mockReturnValue(false);
    render(<AdminSiteRoute />);
    expect(screen.getByTestId("redirect")).toHaveTextContent("/admin/dashboard");
    expect(screen.queryByTestId("site-screen")).toBeNull();
  });
});
