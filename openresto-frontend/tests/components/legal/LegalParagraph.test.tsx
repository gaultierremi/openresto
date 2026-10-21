import React from "react";
import { render, screen } from "@testing-library/react-native";
import { LegalParagraph, splitPlaceholders } from "@/components/legal/LegalParagraph";

jest.mock("@/context/BrandContext", () => ({
  useBrand: () => ({ appName: "Open Resto", primaryColor: "#0a7ea4" }),
}));

describe("splitPlaceholders", () => {
  it("sets the bracketed fields apart and keeps the brackets", () => {
    expect(splitPlaceholders("Lie [Société] et [adresse du siège], à Bruxelles.")).toEqual([
      { text: "Lie ", placeholder: false },
      { text: "[Société]", placeholder: true },
      { text: " et ", placeholder: false },
      { text: "[adresse du siège]", placeholder: true },
      { text: ", à Bruxelles.", placeholder: false },
    ]);
  });

  it("returns one plain run for a paragraph with no field, and none for an empty one", () => {
    expect(splitPlaceholders("Rien à compléter.")).toEqual([
      { text: "Rien à compléter.", placeholder: false },
    ]);
    expect(splitPlaceholders("")).toEqual([]);
  });

  it("does not treat an unclosed bracket as a field", () => {
    expect(splitPlaceholders("Voir [annexe")).toEqual([
      { text: "Voir [annexe", placeholder: false },
    ]);
  });
});

describe("LegalParagraph", () => {
  it("draws every bracketed field as it is, and visibly set apart", () => {
    render(<LegalParagraph text="Entre [Société] et le restaurateur, au [numéro d’entreprise]." />);
    const fields = screen.getAllByTestId("legal-placeholder");
    expect(fields.map((f) => f.props.children)).toEqual(["[Société]", "[numéro d’entreprise]"]);
    expect(screen.getByText(/Entre/)).toBeTruthy();
  });

  it("draws a paragraph without a field as plain text", () => {
    render(<LegalParagraph text="Le service est fourni tel quel." />);
    expect(screen.getByText("Le service est fourni tel quel.")).toBeTruthy();
    expect(screen.queryByTestId("legal-placeholder")).toBeNull();
  });
});
