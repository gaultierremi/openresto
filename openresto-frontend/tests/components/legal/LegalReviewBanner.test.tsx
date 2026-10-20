import React from "react";
import { render, screen } from "@testing-library/react-native";
import { LegalReviewBanner } from "@/components/legal/LegalReviewBanner";
import i18n from "@/i18n";

jest.mock("@/context/BrandContext", () => ({
  useBrand: () => ({ appName: "Open Resto", primaryColor: "#0a7ea4" }),
}));

afterEach(() => i18n.changeLanguage("en"));

describe("LegalReviewBanner", () => {
  it("warns, as an alert, that the text is a template to be validated by a lawyer", () => {
    render(<LegalReviewBanner />);
    expect(screen.getByTestId("legal-review-banner").props.role).toBe("alert");
    expect(
      screen.getByText("Template to be validated by a lawyer — do not use as is")
    ).toBeTruthy();
  });

  it("says it in French for a French visitor", async () => {
    await i18n.changeLanguage("fr");
    render(<LegalReviewBanner />);
    expect(
      screen.getByText("Modèle à faire valider par un juriste — ne pas utiliser en l’état")
    ).toBeTruthy();
  });
});
