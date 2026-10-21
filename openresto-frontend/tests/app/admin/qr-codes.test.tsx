import React from "react";
import { render, screen } from "@testing-library/react-native";
import AdminQrCodesRoute from "@/app/admin/qr-codes/index";
import AdminQrPrintRoute from "@/app/admin/qr-codes/print";

jest.mock("@/components/admin/qr/QrCodesScreen", () => {
  const ReactLib = require("react");
  const { View } = require("react-native");
  return { QrCodesScreen: () => ReactLib.createElement(View, { testID: "qr-codes-screen" }) };
});

jest.mock("@/components/admin/qr/QrPrintScreen", () => {
  const ReactLib = require("react");
  const { View } = require("react-native");
  return { QrPrintScreen: () => ReactLib.createElement(View, { testID: "qr-print-screen" }) };
});

describe("admin QR code routes", () => {
  it("/admin/qr-codes shows the QR codes screen", () => {
    render(<AdminQrCodesRoute />);
    expect(screen.getByTestId("qr-codes-screen")).toBeTruthy();
    expect(screen.queryByTestId("qr-print-screen")).toBeNull();
  });

  it("/admin/qr-codes/print shows the print screen", () => {
    render(<AdminQrPrintRoute />);
    expect(screen.getByTestId("qr-print-screen")).toBeTruthy();
    expect(screen.queryByTestId("qr-codes-screen")).toBeNull();
  });
});
