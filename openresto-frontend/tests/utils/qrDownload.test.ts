/**
 * @jest-environment jsdom
 */
import { downloadQrPng, downloadQrSvg, drawQr, fileSlug } from "@/utils/qrDownload";
import { qrMatrix, QUIET_ZONE } from "@/utils/qrCode";

const URL_T = "https://resto.example/menu/t/abc";

function fakeContext() {
  return { fillStyle: "", fillRect: jest.fn() };
}

describe("fileSlug", () => {
  it("makes a filename of lower-case words joined by dashes", () => {
    expect(fileSlug("Chez Paul", "Table 4")).toBe("chez-paul-table-4");
  });

  it("drops accents and punctuation", () => {
    expect(fileSlug("Café de l'Étoile !")).toBe("cafe-de-l-etoile");
  });

  it("skips empty parts and falls back when nothing is left", () => {
    expect(fileSlug(null, "T1", undefined)).toBe("t1");
    expect(fileSlug("***")).toBe("qr");
  });
});

describe("drawQr", () => {
  it("paints a white page and one black square per dark module, quiet zone included", () => {
    const canvas = document.createElement("canvas");
    const context = fakeContext();
    jest
      .spyOn(canvas, "getContext")
      .mockReturnValue(context as unknown as CanvasRenderingContext2D);

    expect(drawQr(canvas, URL_T)).toBe(true);

    const matrix = qrMatrix(URL_T);
    const darkModules = matrix.flat().filter(Boolean).length;
    const scale = canvas.width / (matrix.length + QUIET_ZONE * 2);

    expect(Number.isInteger(scale)).toBe(true);
    expect(canvas.width).toBeGreaterThanOrEqual(1024);
    expect(canvas.height).toBe(canvas.width);
    // One call for the white page, then one per dark module.
    expect(context.fillRect).toHaveBeenCalledTimes(1 + darkModules);
    expect(context.fillRect).toHaveBeenNthCalledWith(1, 0, 0, canvas.width, canvas.height);
    expect(context.fillStyle).toBe("#000000");
  });

  it("reports a canvas that cannot draw", () => {
    const canvas = document.createElement("canvas");
    jest.spyOn(canvas, "getContext").mockReturnValue(null);
    expect(drawQr(canvas, URL_T)).toBe(false);
  });
});

describe("downloads", () => {
  let click: jest.Mock;
  let created: Blob[];

  beforeEach(() => {
    created = [];
    click = jest.fn();
    // Expo's `URL` polyfill resolves lazily and cannot load under jsdom, so the two methods the
    // download uses are stood in for on a plain object.
    Object.defineProperty(globalThis, "URL", {
      configurable: true,
      value: {
        createObjectURL: jest.fn((blob: Blob) => {
          created.push(blob);
          return "blob:qr";
        }),
        revokeObjectURL: jest.fn(),
      },
    });
    jest.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(click);
  });

  afterEach(() => jest.restoreAllMocks());

  it("saves the SVG under the given name", () => {
    downloadQrSvg("table-4.svg", "<svg/>");
    expect(created[0].type).toBe("image/svg+xml");
    expect(click).toHaveBeenCalledTimes(1);
    expect(globalThis.URL.revokeObjectURL).toHaveBeenCalledWith("blob:qr");
  });

  it("saves the PNG once the canvas has encoded it", async () => {
    jest
      .spyOn(HTMLCanvasElement.prototype, "getContext")
      .mockReturnValue(fakeContext() as unknown as CanvasRenderingContext2D);
    jest
      .spyOn(HTMLCanvasElement.prototype, "toBlob")
      .mockImplementation((callback) => callback(new Blob(["png"], { type: "image/png" })));

    await expect(downloadQrPng("table-4.png", URL_T)).resolves.toBe(true);
    expect(click).toHaveBeenCalledTimes(1);
  });

  it("resolves false, saving nothing, when the browser cannot draw", async () => {
    jest.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    await expect(downloadQrPng("table-4.png", URL_T)).resolves.toBe(false);
    expect(click).not.toHaveBeenCalled();
  });

  it("resolves false, saving nothing, when the canvas cannot encode", async () => {
    jest
      .spyOn(HTMLCanvasElement.prototype, "getContext")
      .mockReturnValue(fakeContext() as unknown as CanvasRenderingContext2D);
    jest
      .spyOn(HTMLCanvasElement.prototype, "toBlob")
      .mockImplementation((callback) => callback(null));

    await expect(downloadQrPng("table-4.png", URL_T)).resolves.toBe(false);
    expect(click).not.toHaveBeenCalled();
  });
});
