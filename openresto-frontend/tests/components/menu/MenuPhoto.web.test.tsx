/**
 * @jest-environment jsdom
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import MenuPhotoDefault, { MenuPhoto } from "@/components/menu/MenuPhoto.web";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("MenuPhoto (web)", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  const mount = (uri: string, size: number) =>
    act(() => {
      root.render(<MenuPhoto uri={uri} size={size} />);
    });

  it("is a plain img the browser loads lazily, so a long menu fetches only what scrolls in", () => {
    mount("/media/menu-item-3.jpg", 76);
    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    expect(img?.getAttribute("src")).toBe("/media/menu-item-3.jpg");
    expect(img?.getAttribute("loading")).toBe("lazy");
    expect(img?.getAttribute("decoding")).toBe("async");
  });

  it("has an empty alt, the dish's name being printed beside it", () => {
    mount("/media/a.jpg", 76);
    expect(container.querySelector("img")?.getAttribute("alt")).toBe("");
  });

  it("reserves a square of the requested size so the row does not jump when it loads", () => {
    mount("/media/a.jpg", 120);
    const img = container.querySelector("img") as HTMLImageElement;
    expect(img.getAttribute("width")).toBe("120");
    expect(img.getAttribute("height")).toBe("120");
    expect(img.style.width).toBe("120px");
    expect(img.style.height).toBe("120px");
    expect(img.style.objectFit).toBe("cover");
  });

  it("is also the module's default export", () => {
    expect(MenuPhotoDefault).toBe(MenuPhoto);
  });
});
