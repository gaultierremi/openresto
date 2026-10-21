import React from "react";
import { Platform } from "react-native";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react-native";
import { LegalIndexScreen } from "@/components/legal/LegalIndexScreen";
import { fetchLegalDocument, fetchLegalDocuments } from "@/api/legal";
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
jest.mock("@/api/legal", () => ({ fetchLegalDocuments: jest.fn(), fetchLegalDocument: jest.fn() }));

const list = fetchLegalDocuments as jest.Mock;
const fetchDoc = fetchLegalDocument as jest.Mock;

const SUMMARIES = [
  { key: "terms", version: "2026-10-20" },
  { key: "privacy", version: "2026-10-20" },
  { key: "dpa", version: "2026-10-20" },
  { key: "legal-notice", version: "2026-10-20" },
];
const TITLES: Record<string, string> = {
  terms: "Conditions d’utilisation",
  privacy: "Politique de confidentialité",
  dpa: "Accord de sous-traitance",
  "legal-notice": "Mentions légales",
};

beforeEach(() => {
  jest.clearAllMocks();
  list.mockReset();
  fetchDoc.mockReset();
  list.mockResolvedValue(ok(SUMMARIES));
  fetchDoc.mockImplementation(async (key: string) =>
    ok(legalDocument({ key, title: TITLES[key], needsLegalReview: true }))
  );
});

const open = async () => {
  render(<LegalIndexScreen />);
  await waitFor(() => expect(screen.queryByTestId("legal-entry-terms")).toBeTruthy());
};

describe("LegalIndexScreen", () => {
  it("lists the four documents with their real titles and versions, each linked by its key", async () => {
    await open();
    for (const { key } of SUMMARIES) {
      const entry = screen.getByTestId(`legal-entry-${key}`);
      expect(within(entry).getByText(TITLES[key])).toBeTruthy();
      expect(within(entry).getByText(/^Version 2026-10-20 · updated /)).toBeTruthy();
      expect(screen.getByTestId(`link:/legal/${key}`)).toBeTruthy();
    }
  });

  it("says the documents are in French and offers the way home", async () => {
    await open();
    expect(screen.getByTestId("legal-language-note")).toHaveTextContent(
      "These documents are written in French."
    );
    expect(screen.getByTestId("link:/")).toBeTruthy();
  });

  it("carries the review banner while the texts need review", async () => {
    await open();
    expect(screen.getByTestId("legal-review-banner")).toBeTruthy();
  });

  it("carries no banner once every text has been validated", async () => {
    fetchDoc.mockImplementation(async (key: string) =>
      ok(legalDocument({ key, title: TITLES[key], needsLegalReview: false }))
    );
    await open();
    expect(screen.queryByTestId("legal-review-banner")).toBeNull();
  });

  it("warns anyway when one document could not be read, and still links it by its generic name", async () => {
    fetchDoc.mockImplementation(async (key: string) =>
      key === "dpa"
        ? refused("Network error.")
        : ok(legalDocument({ key, title: TITLES[key], needsLegalReview: false }))
    );
    await open();

    expect(screen.getByTestId("legal-review-banner")).toBeTruthy();
    const entry = screen.getByTestId("legal-entry-dpa");
    expect(within(entry).getByText("Data processing agreement")).toBeTruthy();
    expect(within(entry).queryByText(/^Version /)).toBeNull();
    expect(screen.getByTestId("link:/legal/dpa")).toBeTruthy();
  });

  it("shows no banner while loading, since nothing is known yet", () => {
    list.mockReturnValue(new Promise(() => {}));
    render(<LegalIndexScreen />);
    expect(screen.queryByTestId("legal-review-banner")).toBeNull();
    expect(screen.queryByTestId("legal-entry-terms")).toBeNull();
  });

  it("shows a failed list, and loads again on request", async () => {
    list.mockResolvedValueOnce(refused("Network error."));
    render(<LegalIndexScreen />);
    await waitFor(() => expect(screen.getByText("The document could not be loaded.")).toBeTruthy());
    expect(screen.queryByTestId("legal-entry-terms")).toBeNull();
    expect(fetchDoc).not.toHaveBeenCalled();

    fireEvent.press(screen.getByText("Try again"));
    await waitFor(() => expect(screen.getByTestId("legal-entry-terms")).toBeTruthy());
    expect(list).toHaveBeenCalledTimes(2);
  });
});

describe("LegalIndexScreen, the native header", () => {
  const original = Platform.OS;
  afterEach(() => {
    Object.defineProperty(Platform, "OS", { value: original, configurable: true });
  });

  it("is titled off web", async () => {
    await open();
    expect(mockScreenOptions).toHaveBeenCalledWith({ title: "Legal documents" });
  });

  it("is left to the page on web", async () => {
    Object.defineProperty(Platform, "OS", { value: "web", configurable: true });
    await open();
    expect(mockScreenOptions).not.toHaveBeenCalled();
  });
});
