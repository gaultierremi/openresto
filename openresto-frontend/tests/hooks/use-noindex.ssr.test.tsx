/**
 * @jest-environment node
 */
import { Platform } from "react-native";
import { renderHook } from "@testing-library/react-native";
import { useNoIndex } from "@/hooks/use-noindex";

describe("useNoIndex without a document", () => {
  const originalOS = Platform.OS;

  afterEach(() => {
    Object.defineProperty(Platform, "OS", { value: originalOS, configurable: true });
  });

  it("does nothing on web when there is no document to write to", () => {
    Object.defineProperty(Platform, "OS", { value: "web", configurable: true });
    expect(typeof document).toBe("undefined");

    expect(() => renderHook(() => useNoIndex())).not.toThrow();
  });
});
