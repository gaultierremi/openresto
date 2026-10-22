import React from "react";
import { render, screen, within } from "@testing-library/react-native";
import { BookingPageMock } from "@/components/onboarding/BookingPageMock";
import { preview } from "@/tests/helpers/onboardingFixtures";
import { BrandPaletteScope } from "@/context/BrandPaletteContext";
import { brandPalette } from "@/theme/brandColors";

jest.mock("@/context/BrandContext", () => ({
  useBrand: () => ({ appName: "Open Resto", primaryColor: "#0a7ea4" }),
}));
jest.mock("@/components/menu/MenuPhoto", () => {
  const { Text } = require("react-native");
  return { MenuPhoto: ({ uri }: { uri: string }) => <Text testID="mock-logo">{uri}</Text> };
});

describe("BookingPageMock", () => {
  it("says it is a preview and that the real page comes with publication", () => {
    render(<BookingPageMock preview={preview()} />);
    expect(screen.getByTestId("booking-mock-label")).toHaveTextContent(
      "Preview — the real page will be available once published"
    );
  });

  it("shows what a guest reads: name, tagline, address and phone", () => {
    render(<BookingPageMock preview={preview()} />);
    expect(screen.getByText("Chez Paul")).toBeTruthy();
    expect(screen.getByText("Cuisine belge")).toBeTruthy();
    expect(screen.getByText("Rue Haute 1, 1000 Bruxelles")).toBeTruthy();
    expect(screen.getByText("+32 2 123 45 67")).toBeTruthy();
  });

  it("leaves out what the restaurant has not given", () => {
    render(
      <BookingPageMock
        preview={preview({ tagline: null, address: null, phoneNumber: null, logoUrl: null })}
      />
    );
    expect(screen.queryByText("Cuisine belge")).toBeNull();
    expect(screen.queryByText("Rue Haute 1, 1000 Bruxelles")).toBeNull();
    expect(screen.queryByTestId("mock-logo")).toBeNull();
  });

  it("shows the logo when there is one", () => {
    render(<BookingPageMock preview={preview({ logoUrl: "/media/l.png" })} />);
    expect(screen.getByTestId("mock-logo")).toHaveTextContent("/media/l.png");
  });

  it("lists the week: the open days with their hours and the others as closed", () => {
    render(<BookingPageMock preview={preview()} />);
    expect(
      within(screen.getByTestId("booking-mock-hours-2")).getByText("12:00 – 22:00")
    ).toBeTruthy();
    expect(within(screen.getByTestId("booking-mock-hours-1")).getByText("Closed")).toBeTruthy();
    expect(within(screen.getByTestId("booking-mock-hours-7")).getByText("Closed")).toBeTruthy();
    expect(within(screen.getByTestId("booking-mock-hours-3")).getByText("Wednesday")).toBeTruthy();
  });

  it("offers party sizes up to the largest table", () => {
    render(<BookingPageMock preview={preview({ largestParty: 4 })} />);
    for (const n of ["1", "2", "3", "4"]) expect(screen.getAllByText(n).length).toBeGreaterThan(0);
    expect(screen.queryByText("5")).toBeNull();
  });

  it("caps the party sizes at eight, however large the largest table", () => {
    render(<BookingPageMock preview={preview({ largestParty: 30 })} />);
    expect(screen.getAllByText("8").length).toBeGreaterThan(0);
    expect(screen.queryByText("9")).toBeNull();
  });

  it("offers no party size when there is no table yet", () => {
    render(<BookingPageMock preview={preview({ largestParty: 0 })} />);
    expect(screen.queryByText("1")).toBeNull();
  });

  it("lists the sample slots", () => {
    render(<BookingPageMock preview={preview()} />);
    expect(screen.getByText("18:00")).toBeTruthy();
    expect(screen.getByText("18:30")).toBeTruthy();
    expect(screen.getByText("19:00")).toBeTruthy();
    expect(screen.queryByTestId("booking-mock-no-slots")).toBeNull();
  });

  it("says there is no slot to show when the server found none", () => {
    render(<BookingPageMock preview={preview({ sampleSlots: [] })} />);
    expect(screen.getByTestId("booking-mock-no-slots")).toHaveTextContent(
      "No slot to show: check your opening hours."
    );
  });

  it("states the figures behind the grid", () => {
    render(<BookingPageMock preview={preview()} />);
    expect(
      screen.getByText("Tables: 5 · Table duration: 90 min · A slot every 30 min")
    ).toBeTruthy();
  });

  it("paints with the restaurant's colour, or the platform's when it has none", () => {
    // The onboarding is the restaurateur's space, which shows the colour as chosen.
    const inOnboarding = (p: ReturnType<typeof preview>) => (
      <BrandPaletteScope mode="chosen">
        <BookingPageMock preview={p} />
      </BrandPaletteScope>
    );
    const { rerender } = render(inOnboarding(preview({ primaryColor: "#b45309" })));
    expect(screen.getByText("Chez Paul")).toHaveStyle({ color: "#b45309" });
    rerender(inOnboarding(preview({ primaryColor: null })));
    expect(screen.getByText("Chez Paul")).toHaveStyle({ color: "#0a7ea4" });
  });

  it("falls back to the platform's colour made readable where no scope says otherwise", () => {
    render(<BookingPageMock preview={preview({ primaryColor: null })} />);
    expect(screen.getByText("Chez Paul")).toHaveStyle({
      color: brandPalette("#0a7ea4", false).primary,
    });
  });
});
