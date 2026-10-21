import { dishPriceText, parseDishPrice } from "@/utils/onboardingPrice";
import { setActiveLocale } from "@/utils/locale";
import { MAX_PRICE_MINOR } from "@/constants/menu";

afterEach(() => setActiveLocale(undefined));

describe("parseDishPrice", () => {
  it("reads euros typed with a comma or a dot as cents", () => {
    expect(parseDishPrice("12,50")).toEqual({ ok: true, priceMinor: 1250 });
    expect(parseDishPrice("12.5")).toEqual({ ok: true, priceMinor: 1250 });
    expect(parseDishPrice(" 9 ")).toEqual({ ok: true, priceMinor: 900 });
    expect(parseDishPrice("0")).toEqual({ ok: true, priceMinor: 0 });
  });

  it("takes an empty field as a dish with no price shown", () => {
    expect(parseDishPrice("")).toEqual({ ok: true, priceMinor: null });
    expect(parseDishPrice("   ")).toEqual({ ok: true, priceMinor: null });
  });

  it("refuses a negative amount rather than reading it as zero", () => {
    expect(parseDishPrice("-3")).toEqual({ ok: false });
    expect(parseDishPrice("-0,50")).toEqual({ ok: false });
  });

  it("refuses a third decimal rather than rounding it", () => {
    expect(parseDishPrice("12,505")).toEqual({ ok: false });
    expect(parseDishPrice("12,50")).toEqual({ ok: true, priceMinor: 1250 });
  });

  it("refuses text and a number with two separators", () => {
    expect(parseDishPrice("douze")).toEqual({ ok: false });
    expect(parseDishPrice("12€")).toEqual({ ok: false });
    expect(parseDishPrice("1,2,3")).toEqual({ ok: false });
  });

  it("refuses an amount over the server's ceiling and takes the one at it", () => {
    expect(parseDishPrice(String(MAX_PRICE_MINOR / 100))).toEqual({
      ok: true,
      priceMinor: MAX_PRICE_MINOR,
    });
    expect(parseDishPrice(String(MAX_PRICE_MINOR / 100 + 1))).toEqual({ ok: false });
  });
});

describe("dishPriceText", () => {
  it("writes cents back with the separator of the active language", () => {
    setActiveLocale("fr");
    expect(dishPriceText(1250)).toBe("12,50");
    setActiveLocale("en");
    expect(dishPriceText(1250)).toBe("12.50");
  });

  it("writes no grouping, so a thousand reads back as typed", () => {
    setActiveLocale("en");
    expect(dishPriceText(123456)).toBe("1234.56");
  });

  it("writes nothing for a dish on request", () => {
    expect(dishPriceText(null)).toBe("");
  });

  it("round-trips through the parser in both languages", () => {
    for (const locale of ["fr", "en"]) {
      setActiveLocale(locale);
      expect(parseDishPrice(dishPriceText(1999))).toEqual({ ok: true, priceMinor: 1999 });
    }
  });
});
