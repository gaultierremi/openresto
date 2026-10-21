import { hexToRgb, type RgbColor } from "@/utils/hex";

// Not in `utils/colors.ts`: a good many component tests replace that module with the two
// functions they need, and the brand palette runs inside every `useAppTheme()`.

const toHex = ({ r, g, b }: RgbColor): string =>
  `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;

/** WCAG 2.x relative luminance, 0 (black) to 1 (white). */
export function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG 2.x contrast ratio between two colours, 1 (identical) to 21 (black on white). */
export function contrastRatio(a: string, b: string): number {
  const [la, lb] = [relativeLuminance(a), relativeLuminance(b)];
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** `over` blended onto `base` at `alpha` (0 is all `base`), as an opaque hex. */
export function blend(over: string, base: string, alpha: number): string {
  const [o, b] = [hexToRgb(over), hexToRgb(base)];
  return toHex({
    r: o.r * alpha + b.r * (1 - alpha),
    g: o.g * alpha + b.g * (1 - alpha),
    b: o.b * alpha + b.b * (1 - alpha),
  });
}

function rgbToHsl({ r, g, b }: RgbColor): { h: number; s: number; l: number } {
  const [rn, gn, bn] = [r / 255, g / 255, b / 255];
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h =
    max === rn
      ? (gn - bn) / d + (gn < bn ? 6 : 0)
      : max === gn
        ? (bn - rn) / d + 2
        : (rn - gn) / d + 4;
  return { h: h * 60, s, l };
}

function hslToRgb(h: number, s: number, l: number): RgbColor {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return { r: f(0) * 255, g: f(8) * 255, b: f(4) * 255 };
}

/** One percent of lightness per try: fine enough that the result is the nearest passing shade. */
const LIGHTNESS_STEP = 0.01;

/** A surface lighter than this on average is one the colour must get darker to read on. */
const LIGHT_SURFACE_LUMINANCE = 0.18;

/**
 * The colour itself when it already reaches a contrast of `min` against every surface, otherwise
 * the nearest colour of the same hue and saturation that does: darker over light surfaces,
 * lighter over dark ones. `surfacesFor` takes the candidate because a tint of the brand colour is
 * one of the surfaces it has to read on, and moves with it. Falls back to black or white when no
 * lightness of that hue can.
 *
 * @see [contrast.test.ts](../tests/utils/contrast.test.ts) — pins that a passing colour is
 * returned as given, a failing one moves no further than it must, and the direction follows the
 * surfaces.
 */
export function ensureContrast(
  color: string,
  surfacesFor: (candidate: string) => string[],
  min = 4.5
): string {
  const passes = (candidate: string) =>
    surfacesFor(candidate).every((surface) => contrastRatio(candidate, surface) >= min);
  if (passes(color)) return color;

  const surfaces = surfacesFor(color);
  const onLight =
    surfaces.reduce((sum, surface) => sum + relativeLuminance(surface), 0) / surfaces.length >
    LIGHT_SURFACE_LUMINANCE;
  const { h, s, l } = rgbToHsl(hexToRgb(color));
  const direction = onLight ? -1 : 1;
  for (let step = 1; step <= 1 / LIGHTNESS_STEP; step++) {
    const lightness = Math.min(1, Math.max(0, l + direction * step * LIGHTNESS_STEP));
    const candidate = toHex(hslToRgb(h, s, lightness));
    if (passes(candidate)) return candidate;
  }
  return onLight ? "#000000" : "#ffffff";
}
