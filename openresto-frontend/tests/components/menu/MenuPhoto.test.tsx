import React from "react";
import { render } from "@testing-library/react-native";
import { MenuPhoto } from "@/components/menu/MenuPhoto";

const mockImage = jest.fn();
jest.mock("expo-image", () => ({
  Image: (props: Record<string, unknown>) => {
    mockImage(props);
    return null;
  },
}));

const imageProps = () => mockImage.mock.calls.at(-1)?.[0] as Record<string, unknown>;

jest.mock("@/utils/serverUrl", () => ({
  resolveServerUrl: (url: string) => (url.startsWith("/") ? `https://resto.test${url}` : url),
}));

describe("MenuPhoto (native)", () => {
  beforeEach(() => mockImage.mockClear());

  it("loads the server-resolved address of a relative upload", () => {
    render(<MenuPhoto uri="/media/menu-item-3.jpg" size={76} />);
    expect(imageProps().source).toEqual({
      uri: "https://resto.test/media/menu-item-3.jpg",
    });
  });

  it("leaves an absolute address as it is", () => {
    render(<MenuPhoto uri="https://cdn.test/dish.jpg" size={76} />);
    expect(imageProps().source).toEqual({
      uri: "https://cdn.test/dish.jpg",
    });
  });

  it("draws a square of the requested size, cropped to fill", () => {
    render(<MenuPhoto uri="/media/a.jpg" size={120} />);
    const image = { props: imageProps() };
    expect(image.props.contentFit).toBe("cover");
    expect(image.props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ width: 120, height: 120 })])
    );
  });

  it("is hidden from screen readers, the dish's name being printed beside it", () => {
    render(<MenuPhoto uri="/media/a.jpg" size={76} />);
    const image = { props: imageProps() };
    expect(image.props.accessible).toBe(false);
    expect(image.props.accessibilityElementsHidden).toBe(true);
    expect(image.props.importantForAccessibility).toBe("no-hide-descendants");
  });
});
