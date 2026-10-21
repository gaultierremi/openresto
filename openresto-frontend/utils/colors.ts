import { hexToRgb } from "@/utils/hex";

export type { RgbColor } from "@/utils/hex";
export { hexToRgb };

export function hexToRgba(hex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}
