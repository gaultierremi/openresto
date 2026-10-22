import { blend, contrastRatio, ensureContrast, labelOn, relativeLuminance } from "@/utils/contrast";
import { hexToRgb } from "@/utils/hex";

describe("contrast - ratios", () => {
  it("rates black on white 21 and a colour on itself 1", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#059669", "#059669")).toBeCloseTo(1, 5);
  });

  it("agrees with the published ratios of the two greys either side of AA on white", () => {
    expect(contrastRatio("#767676", "#ffffff")).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio("#777777", "#ffffff")).toBeLessThan(4.5);
  });

  it("puts white above black in luminance", () => {
    expect(relativeLuminance("#ffffff")).toBeCloseTo(1, 5);
    expect(relativeLuminance("#000000")).toBe(0);
  });

  it("puts a white label on a dark fill and a black one on a pale fill", () => {
    expect(labelOn("#1f2937")).toBe("#ffffff");
    expect(labelOn("#facc15")).toBe("#000000");
  });

  it("keeps white up to the greys that still read AA against it, and not past them", () => {
    expect(labelOn("#767676")).toBe("#ffffff");
    expect(labelOn("#777777")).toBe("#000000");
  });

  it("blends a colour onto a base at the given strength", () => {
    expect(blend("#000000", "#ffffff", 0)).toBe("#ffffff");
    expect(blend("#000000", "#ffffff", 1)).toBe("#000000");
    expect(blend("#000000", "#ffffff", 0.5)).toBe("#808080");
  });
});

describe("contrast - ensureContrast", () => {
  const onWhite = () => ["#ffffff"];

  it("leaves a colour that already reaches the ratio exactly as given", () => {
    expect(ensureContrast("#767676", onWhite)).toBe("#767676");
  });

  it("moves a colour just under the ratio until it reaches it, darker on a light surface", () => {
    const moved = ensureContrast("#777777", onWhite);
    expect(moved).not.toBe("#777777");
    expect(contrastRatio(moved, "#ffffff")).toBeGreaterThanOrEqual(4.5);
    expect(relativeLuminance(moved)).toBeLessThan(relativeLuminance("#777777"));
  });

  it("moves it no further than it has to", () => {
    const moved = ensureContrast("#777777", onWhite);
    // One step (1% of lightness, 2 or 3 of 255 on a grey) lighter than the answer is back under.
    const { r } = hexToRgb(moved);
    const grey = (v: number) =>
      `#${[v, v, v].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
    expect(contrastRatio(grey(r + 3), "#ffffff")).toBeLessThan(4.5);
  });

  it("moves a colour lighter on a dark surface", () => {
    const moved = ensureContrast("#555555", () => ["#111111"]);
    expect(contrastRatio(moved, "#111111")).toBeGreaterThanOrEqual(4.5);
    expect(relativeLuminance(moved)).toBeGreaterThan(relativeLuminance("#555555"));
  });

  it("keeps the hue and reaches the ratio on the worst of several surfaces", () => {
    const surfaces = ["#ffffff", "#f2f3f5", "#e1f2ed"];
    const moved = ensureContrast("#059669", () => surfaces);
    for (const surface of surfaces) {
      expect(contrastRatio(moved, surface)).toBeGreaterThanOrEqual(4.5);
    }
    const { r, g, b } = hexToRgb(moved);
    expect(g).toBeGreaterThan(r);
    expect(g).toBeGreaterThan(b);
  });

  it.each([
    ["red", "#ff6b6b", 0],
    ["green", "#5cd68a", 1],
    ["blue", "#6b8cff", 2],
  ])("keeps a %s colour the dominant channel it was when it moves", (_name, colour, channel) => {
    const moved = ensureContrast(colour, () => ["#ffffff"]);
    expect(moved).not.toBe(colour);
    const { r, g, b } = hexToRgb(moved);
    const channels = [r, g, b];
    expect(channels[channel]).toBe(Math.max(...channels));
  });

  it("re-checks a surface that is itself derived from the candidate", () => {
    const moved = ensureContrast("#059669", (candidate) => [
      "#ffffff",
      blend(candidate, "#ffffff", 0.18),
    ]);
    expect(contrastRatio(moved, blend(moved, "#ffffff", 0.18))).toBeGreaterThanOrEqual(4.5);
  });

  it("falls back to black on light surfaces and white on dark ones when no shade can", () => {
    expect(ensureContrast("#888888", () => ["#ffffff"], 22)).toBe("#000000");
    expect(ensureContrast("#888888", () => ["#000000"], 22)).toBe("#ffffff");
  });
});
