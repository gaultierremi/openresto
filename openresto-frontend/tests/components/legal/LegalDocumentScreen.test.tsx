import React from "react";
import { Platform } from "react-native";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react-native";
import { LegalDocumentScreen } from "@/components/legal/LegalDocumentScreen";
import { fetchLegalDocument } from "@/api/legal";
import { legalDocument, ok, refused } from "@/tests/helpers/platformFixtures";

const mockScreenOptions = jest.fn();
jest.mock("expo-router", () => {
  const { View } = require("react-native");
  return {
    Link: ({ href, children }: { href: string; children: React.ReactNode }) => (
      <View testID={`link:${href}`}>{children}</View>
    ),
    Stack: {
      Screen: ({ options }: { options: unknown }) => {
        mockScreenOptions(options);
        return null;
      },
    },
  };
});
jest.mock("@/context/BrandContext", () => ({
  useBrand: () => ({ appName: "Open Resto", primaryColor: "#0a7ea4" }),
}));
jest.mock("@/components/layout/Footer", () => ({ __esModule: true, default: () => null }));
jest.mock("@/api/legal", () => ({ fetchLegalDocument: jest.fn() }));

const fetchDoc = fetchLegalDocument as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  fetchDoc.mockReset();
});

const open = async (key = "terms") => {
  render(<LegalDocumentScreen docKey={key} />);
  await waitFor(() => expect(screen.queryAllByTestId("legal-section").length).toBeGreaterThan(0));
};

describe("LegalDocumentScreen, a document that needs review", () => {
  beforeEach(() => fetchDoc.mockResolvedValue(ok(legalDocument({ needsLegalReview: true }))));

  it("fetches the document of its key", async () => {
    await open("terms");
    expect(fetchDoc).toHaveBeenCalledWith("terms");
  });

  it("carries the review banner, always on screen", async () => {
    await open();
    expect(screen.getByTestId("legal-review-banner")).toBeTruthy();
    expect(
      screen.getByText("Template to be validated by a lawyer — do not use as is")
    ).toBeTruthy();
  });

  it("shows the title as the page's heading, the version line and the language note", async () => {
    await open();
    expect(
      screen.getByRole("header", { name: "Conditions d’utilisation de l’offre gratuite" })
    ).toBeTruthy();
    expect(screen.getByTestId("legal-version")).toHaveTextContent(/^Version 2026-10-20 · updated /);
    expect(screen.getByTestId("legal-language-note")).toHaveTextContent(
      "These documents are written in French."
    );
  });

  it("shows every section with its heading and paragraphs", async () => {
    await open();
    const sections = screen.getAllByTestId("legal-section");
    expect(sections).toHaveLength(2);
    expect(within(sections[0]).getByText("1. Parties et objet")).toBeTruthy();
    expect(
      within(sections[0]).getByText(/Elles régissent l’usage de l’offre gratuite/)
    ).toBeTruthy();
    expect(within(sections[1]).getByText("Le service est fourni tel quel.")).toBeTruthy();
  });

  it("shows the bracketed fields as they are", async () => {
    await open();
    expect(screen.getByTestId("legal-placeholder").props.children).toBe(
      "[Dénomination de la société exploitante]"
    );
  });

  it("links the other three documents, and not the one being read", async () => {
    await open("terms");
    expect(screen.getByTestId("link:/legal/privacy")).toBeTruthy();
    expect(screen.getByTestId("link:/legal/dpa")).toBeTruthy();
    expect(screen.getByTestId("link:/legal/legal-notice")).toBeTruthy();
    expect(screen.queryByTestId("link:/legal/terms")).toBeNull();
    expect(screen.getByLabelText("Privacy policy")).toBeTruthy();
  });

  it("offers a way back to the list of documents", async () => {
    await open();
    expect(screen.getByTestId("link:/legal")).toBeTruthy();
    expect(screen.getByLabelText("Back to the legal documents")).toBeTruthy();
  });
});

describe("LegalDocumentScreen, a document that no longer needs review", () => {
  it("carries no banner", async () => {
    fetchDoc.mockResolvedValue(ok(legalDocument({ needsLegalReview: false })));
    await open();
    expect(screen.queryByTestId("legal-review-banner")).toBeNull();
    expect(screen.getByTestId("legal-version")).toBeTruthy();
  });
});

describe("LegalDocumentScreen, an unknown key", () => {
  it("shows the not-found state with the way back, and no document", async () => {
    fetchDoc.mockResolvedValue(refused("Document not found.", "legal.document_not_found"));
    render(<LegalDocumentScreen docKey="nope" />);

    await waitFor(() => expect(screen.getByTestId("legal-not-found")).toBeTruthy());
    expect(screen.getByText("Document not found")).toBeTruthy();
    expect(
      screen.getByText("This legal document does not exist. Pick one from the list.")
    ).toBeTruthy();
    expect(screen.getByTestId("link:/legal")).toBeTruthy();
    expect(screen.queryByTestId("legal-section")).toBeNull();
    expect(screen.queryByTestId("legal-review-banner")).toBeNull();
  });
});

describe("LegalDocumentScreen, a failed load", () => {
  it("is not the not-found state, and loads again on request", async () => {
    fetchDoc.mockResolvedValueOnce(refused("Network error."));
    render(<LegalDocumentScreen docKey="terms" />);

    await waitFor(() => expect(screen.getByText("The document could not be loaded.")).toBeTruthy());
    expect(screen.queryByTestId("legal-not-found")).toBeNull();

    fetchDoc.mockResolvedValueOnce(ok(legalDocument()));
    fireEvent.press(screen.getByText("Try again"));
    await waitFor(() => expect(screen.getAllByTestId("legal-section")).toHaveLength(2));
    expect(fetchDoc).toHaveBeenCalledTimes(2);
  });

  it("shows a spinner, not a state, while it loads", () => {
    fetchDoc.mockReturnValue(new Promise(() => {}));
    render(<LegalDocumentScreen docKey="terms" />);
    expect(screen.queryByTestId("legal-not-found")).toBeNull();
    expect(screen.queryByTestId("legal-section")).toBeNull();
    expect(screen.queryByText("The document could not be loaded.")).toBeNull();
  });
});

describe("LegalDocumentScreen, the native header", () => {
  const original = Platform.OS;
  afterEach(() => {
    Object.defineProperty(Platform, "OS", { value: original, configurable: true });
  });

  it("is titled with the document off web", async () => {
    fetchDoc.mockResolvedValue(ok(legalDocument()));
    await open();
    expect(mockScreenOptions).toHaveBeenCalledWith({
      title: "Conditions d’utilisation de l’offre gratuite",
    });
  });

  it("is left to the page on web", async () => {
    Object.defineProperty(Platform, "OS", { value: "web", configurable: true });
    fetchDoc.mockResolvedValue(ok(legalDocument()));
    await open();
    expect(mockScreenOptions).not.toHaveBeenCalled();
  });
});
