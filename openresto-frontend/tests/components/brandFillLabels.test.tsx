import React from "react";
import { render, screen } from "@testing-library/react-native";
import { StyleSheet, type TextStyle, type ViewStyle } from "react-native";
import PopularTimesPicker from "@/components/booking/PopularTimesPicker";
import ErrorScreen from "@/components/common/ErrorScreen";
import { AA_TEXT_CONTRAST } from "@/theme/brandColors";
import { contrastRatio } from "@/utils/contrast";

// What a brand-coloured fill carries on top of it is the theme's `onPrimary`, not a fixed white:
// on the dark theme the brand colour is lifted to read as text, and white would not hold on it.
// The demo's #059669 fails AA both ways round before the palette, so it is the colour to use.

let mockScheme: "light" | "dark" = "light";
jest.mock("@/hooks/use-color-scheme", () => ({ useColorScheme: () => mockScheme }));
jest.mock("@/context/BrandContext", () => {
  const brand = { primaryColor: "#059669" };
  return { useBrand: () => brand };
});
jest.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));
jest.mock("@/utils/haptics", () => ({
  haptics: { selection: jest.fn(), press: jest.fn(), outcome: jest.fn() },
}));

const style = (node: Parameters<typeof StyleSheet.flatten>[0]) =>
  StyleSheet.flatten(node) as ViewStyle & TextStyle;

describe.each(["light", "dark"] as const)("a brand fill's label on the %s theme", (scheme) => {
  beforeEach(() => {
    mockScheme = scheme;
  });

  it("reads at AA on the selected time chip", () => {
    render(
      <PopularTimesPicker
        slots={[{ time: "12:00", isAvailable: true, availableTableIds: [1], category: "Lunch" }]}
        selectedTime="12:00"
        onSelectTime={jest.fn()}
      />
    );
    const chip = screen.getByRole("radio", { name: "12:00" });
    const fill = style(chip.props.style).backgroundColor as string;
    const label = style(screen.getByText("12:00").props.style).color as string;
    expect(contrastRatio(fill, label)).toBeGreaterThanOrEqual(AA_TEXT_CONTRAST);
  });

  it("reads at AA on the active category tab", () => {
    render(
      <PopularTimesPicker
        slots={[{ time: "12:00", isAvailable: true, availableTableIds: [1], category: "Lunch" }]}
        selectedTime=""
        onSelectTime={jest.fn()}
      />
    );
    const tab = screen.getByRole("tab", { name: "Lunch" });
    const fill = style(tab.props.style).backgroundColor as string;
    const label = style(screen.getByText("Lunch").props.style).color as string;
    expect(contrastRatio(fill, label)).toBeGreaterThanOrEqual(AA_TEXT_CONTRAST);
  });

  it("reads at AA on the error screen's retry button", () => {
    render(<ErrorScreen retry={jest.fn()} />);
    const retry = screen.getByRole("button", { name: "Try again" });
    const fill = style(retry.props.style).backgroundColor as string;
    const label = style(screen.getByText("Try again").props.style).color as string;
    expect(contrastRatio(fill, label)).toBeGreaterThanOrEqual(AA_TEXT_CONTRAST);
  });
});
