import React from "react";
import { render, screen } from "@testing-library/react-native";
import LegalIndexRoute from "@/app/legal/index";
import LegalDocumentRoute from "@/app/legal/[key]";
import { useLocalSearchParams } from "expo-router";

jest.mock("expo-router", () => ({ useLocalSearchParams: jest.fn() }));
jest.mock("@/components/legal/LegalIndexScreen", () => {
  const { Text } = require("react-native");
  return { LegalIndexScreen: () => <Text testID="legal-index">index</Text> };
});
jest.mock("@/components/legal/LegalDocumentScreen", () => {
  const { Text } = require("react-native");
  return {
    LegalDocumentScreen: ({ docKey }: { docKey: string }) => (
      <Text testID="legal-document">{`doc:${docKey}`}</Text>
    ),
  };
});

const params = useLocalSearchParams as jest.Mock;

describe("legal routes", () => {
  it("/legal is the index", () => {
    render(<LegalIndexRoute />);
    expect(screen.getByTestId("legal-index")).toBeTruthy();
  });

  it.each(["terms", "privacy", "dpa", "legal-notice"])(
    "/legal/%s asks for that document",
    (key) => {
      params.mockReturnValue({ key });
      render(<LegalDocumentRoute />);
      expect(screen.getByTestId("legal-document")).toHaveTextContent(`doc:${key}`);
    }
  );

  it("takes the first segment when the router hands over several", () => {
    params.mockReturnValue({ key: ["terms", "extra"] });
    render(<LegalDocumentRoute />);
    expect(screen.getByTestId("legal-document")).toHaveTextContent("doc:terms");
  });

  it.each([[{}], [{ key: [] }]])(
    "asks for an empty key, which the server answers as not found, when there is none (%j)",
    (value) => {
      params.mockReturnValue(value);
      render(<LegalDocumentRoute />);
      expect(screen.getByTestId("legal-document").props.children).toBe("doc:");
    }
  );
});
