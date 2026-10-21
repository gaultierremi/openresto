import { qrMatrix, QUIET_ZONE } from "@/utils/qrCode";

/** Pixels the PNG should reach at least: sharp on a printed A4 sheet, small as a file. */
const PNG_MIN_SIZE = 1024;

/**
 * Draws the code onto a canvas at a whole number of pixels per module, so every edge lands on
 * a pixel boundary: a scaled-down bitmap blurs, and a blurred code scans worse.
 */
export function drawQr(canvas: HTMLCanvasElement, text: string): boolean {
  const matrix = qrMatrix(text);
  const modules = matrix.length + QUIET_ZONE * 2;
  const scale = Math.ceil(PNG_MIN_SIZE / modules);
  const context = canvas.getContext("2d");
  if (!context) return false;

  canvas.width = canvas.height = modules * scale;
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#000000";
  matrix.forEach((row, y) =>
    row.forEach((dark, x) => {
      if (dark) context.fillRect((x + QUIET_ZONE) * scale, (y + QUIET_ZONE) * scale, scale, scale);
    })
  );
  return true;
}

function save(filename: string, blob: Blob): void {
  const href = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = href;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(href);
}

export function downloadQrSvg(filename: string, svg: string): void {
  save(filename, new Blob([svg], { type: "image/svg+xml" }));
}

/** Resolves false when the browser cannot draw or encode the image. */
export function downloadQrPng(filename: string, text: string): Promise<boolean> {
  const canvas = document.createElement("canvas");
  if (!drawQr(canvas, text)) return Promise.resolve(false);
  return new Promise((resolve) =>
    canvas.toBlob((blob) => {
      if (!blob) return resolve(false);
      save(filename, blob);
      resolve(true);
    }, "image/png")
  );
}

/** `Chez Paul - Table 4` → `chez-paul-table-4`: a filename that survives every file system. */
export function fileSlug(...parts: (string | null | undefined)[]): string {
  const slug = parts
    .filter(Boolean)
    .join(" ")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "qr";
}
