/**
 * @jest-environment jsdom
 */
import { pickFile } from "@/utils/pickFile";

describe("pickFile", () => {
  let input: HTMLInputElement;

  beforeEach(() => {
    input = document.createElement("input");
    jest.spyOn(input, "click").mockImplementation(() => {});
    jest.spyOn(document, "createElement").mockReturnValue(input);
  });

  afterEach(() => jest.restoreAllMocks());

  it("opens a file chooser limited to the accepted types", () => {
    void pickFile("image/png,image/jpeg");
    expect(input.type).toBe("file");
    expect(input.accept).toBe("image/png,image/jpeg");
    expect(input.click).toHaveBeenCalled();
  });

  it("resolves the chosen file", async () => {
    const file = new File(["x"], "dish.png", { type: "image/png" });
    const promise = pickFile("image/png");
    Object.defineProperty(input, "files", { value: [file] });
    input.onchange?.(new Event("change"));
    await expect(promise).resolves.toBe(file);
  });

  it("resolves null when the change carries no file", async () => {
    const promise = pickFile("image/png");
    Object.defineProperty(input, "files", { value: [] });
    input.onchange?.(new Event("change"));
    await expect(promise).resolves.toBeNull();
  });

  it("resolves null when the chooser is dismissed instead of hanging", async () => {
    const promise = pickFile("image/png");
    input.oncancel?.(new Event("cancel"));
    await expect(promise).resolves.toBeNull();
  });
});
