/**
 * @jest-environment jsdom
 */
import { Platform } from "react-native";
import { renderHook } from "@testing-library/react-native";
import { useNoIndex } from "@/hooks/use-noindex";

const robotsTags = () => document.head.querySelectorAll('meta[name="robots"]');

describe("useNoIndex", () => {
  const originalOS = Platform.OS;

  afterEach(() => {
    Object.defineProperty(Platform, "OS", { value: originalOS, configurable: true });
    document.head.innerHTML = "";
  });

  it("adds a robots noindex tag to the head on web", () => {
    Object.defineProperty(Platform, "OS", { value: "web", configurable: true });
    renderHook(() => useNoIndex());

    const tags = robotsTags();
    expect(tags).toHaveLength(1);
    expect(tags[0].getAttribute("content")).toBe("noindex");
  });

  it("removes the tag again on unmount, so other routes stay indexable", () => {
    Object.defineProperty(Platform, "OS", { value: "web", configurable: true });
    const { unmount } = renderHook(() => useNoIndex());
    expect(robotsTags()).toHaveLength(1);

    unmount();

    expect(robotsTags()).toHaveLength(0);
  });

  it("adds one tag per mount, not one per render", () => {
    Object.defineProperty(Platform, "OS", { value: "web", configurable: true });
    const { rerender } = renderHook(() => useNoIndex());
    rerender({});
    rerender({});

    expect(robotsTags()).toHaveLength(1);
  });

  it.each(["ios", "android"])("leaves the head alone on %s", (os) => {
    Object.defineProperty(Platform, "OS", { value: os, configurable: true });
    renderHook(() => useNoIndex());

    expect(robotsTags()).toHaveLength(0);
  });
});
