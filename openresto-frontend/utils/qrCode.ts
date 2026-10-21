import { encode } from "uqr";

/** The spec asks for four modules of white around the code; scanners lose it below that. */
export const QUIET_ZONE = 4;

/**
 * Printed QR codes get wiped down and scuffed, so they carry the second-highest correction
 * level rather than the default: the URL is short enough that the code stays small either way.
 */
const ERROR_CORRECTION = "Q";

export function qrMatrix(text: string): boolean[][] {
  return encode(text, { ecc: ERROR_CORRECTION, border: 0 }).data;
}

/**
 * The code as an SVG string: black on white whatever the brand colour is, because a scanner
 * reads contrast and a pale brand would turn a printed sheet into a code nobody can read.
 * Each horizontal run of dark modules is one rectangle in a single path, which keeps the markup
 * small and leaves no hairline seams between neighbouring modules.
 *
 * @see [qrCode.test.ts](../tests/utils/qrCode.test.ts) — pins the quiet zone, that the dark
 * modules in the markup are the encoder's, and that the colours stay fixed.
 */
export function qrToSvg(text: string): string {
  const matrix = qrMatrix(text);
  const total = matrix.length + QUIET_ZONE * 2;
  const runs: string[] = [];

  matrix.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      if (!row[x]) {
        x += 1;
        continue;
      }
      const start = x;
      while (x < row.length && row[x]) x += 1;
      runs.push(`M${start + QUIET_ZONE},${y + QUIET_ZONE}h${x - start}v1h-${x - start}z`);
    }
  });

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" shape-rendering="crispEdges">` +
    `<rect width="${total}" height="${total}" fill="#ffffff"/>` +
    `<path fill="#000000" d="${runs.join("")}"/></svg>`
  );
}

/** For an `<img src>` or an RN `Image` uri, which is how the screens draw the code. */
export function svgToDataUri(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** The public address a QR opens: `<base>/menu/r/<token>` or `<base>/menu/t/<token>`. */
export function menuUrl(base: string, kind: "r" | "t", token: string): string {
  return `${base.replace(/\/+$/, "")}/menu/${kind}/${encodeURIComponent(token)}`;
}

/**
 * Where printed codes should point. The instance's public website address when the owner set
 * one, since that is the address a guest's phone can reach; otherwise the origin the admin is
 * open on. Anything that is not an http(s) URL is ignored, as the backend does for the same
 * field.
 *
 * @see [qrCode.test.ts](../tests/utils/qrCode.test.ts) — pins that a configured address wins,
 * that a junk one falls through to the origin, and that a trailing slash never doubles.
 */
export function qrBaseUrl(websiteUrl: string | null | undefined, origin: string): string {
  const candidate = websiteUrl?.trim();
  if (candidate && /^https?:\/\//i.test(candidate)) return candidate.replace(/\/+$/, "");
  return origin.replace(/\/+$/, "");
}
