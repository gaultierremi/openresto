/**
 * @jest-environment jsdom
 */
import React from "react";
import { render, screen } from "@testing-library/react-native";
import AdminMenusRoute from "@/app/admin/menus/index";
import AdminMenuServiceRoute from "@/app/admin/menus/service";

jest.mock("@/components/admin/menus/MenusScreen", () => {
  const { Text } = require("react-native");
  return { MenusScreen: () => <Text testID="menus-screen">menus</Text> };
});
jest.mock("@/components/admin/menus/ServiceScreen", () => {
  const { Text } = require("react-native");
  return { ServiceScreen: () => <Text testID="service-screen">service</Text> };
});

describe("admin menu routes", () => {
  it("renders the menu editor at /admin/menus", () => {
    render(<AdminMenusRoute />);
    expect(screen.getByTestId("menus-screen")).toBeTruthy();
  });

  it("renders service mode at /admin/menus/service", () => {
    render(<AdminMenuServiceRoute />);
    expect(screen.getByTestId("service-screen")).toBeTruthy();
  });
});
