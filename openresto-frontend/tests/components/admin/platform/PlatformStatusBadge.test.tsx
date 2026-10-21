import React from "react";
import { StyleSheet } from "react-native";
import { render, screen } from "@testing-library/react-native";
import { PlatformStatusBadge } from "@/components/admin/platform/PlatformStatusBadge";
import type { PlatformStatus } from "@/constants/platform";

let mockScheme = "light";
jest.mock("@/hooks/use-color-scheme", () => ({ useColorScheme: () => mockScheme }));
jest.mock("@/context/BrandContext", () => ({
  useBrand: () => ({ appName: "Open Resto", primaryColor: "#0a7ea4" }),
}));

beforeEach(() => {
  mockScheme = "light";
});

describe("PlatformStatusBadge", () => {
  it.each(["Draft", "Published", "Suspended"] as const)(
    "prints the name of the %s status, not a colour alone",
    (status) => {
      render(<PlatformStatusBadge status={status} />);
      expect(screen.getByText(status)).toBeTruthy();
    }
  );

  it("shows a status this build does not know as the server sent it", () => {
    render(<PlatformStatusBadge status={"Archived" as unknown as PlatformStatus} />);
    expect(screen.getByText("Archived")).toBeTruthy();
  });

  it("tints each status differently, in either theme", () => {
    const tint = (status: PlatformStatus) => {
      const { unmount } = render(<PlatformStatusBadge status={status} />);
      const style = StyleSheet.flatten(screen.getByTestId("platform-status-badge").props.style);
      unmount();
      return style.backgroundColor;
    };

    const light = (["Draft", "Published", "Suspended"] as const).map(tint);
    expect(new Set(light).size).toBe(3);

    mockScheme = "dark";
    const dark = (["Draft", "Published", "Suspended"] as const).map(tint);
    expect(new Set(dark).size).toBe(3);
    expect(dark).not.toEqual(light);
  });
});
