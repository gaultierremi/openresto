export type QrSheetFormat = "a4" | "a6";

export interface QrSheetCell {
  key: string;
  /** The code as an SVG string; drawn through a data URI so it stays vector on paper. */
  svg: string;
  label: string;
  caption?: string;
}

export interface QrSheetLabels {
  scan: string;
  noApp: string;
  print: string;
  back: string;
  hint: string;
}

export interface QrSheetProps {
  restaurantName: string;
  format: QrSheetFormat;
  cells: QrSheetCell[];
  labels: QrSheetLabels;
  onBack: () => void;
}

/**
 * The printable QR sheets are a web-only surface (`QrSheet.web.tsx`): paper sizes, `@page` and
 * print media are CSS, and the admin never runs off web. This stub keeps the native bundle
 * resolving the same import.
 */
export function QrSheet(_props: QrSheetProps) {
  return null;
}

export default QrSheet;
