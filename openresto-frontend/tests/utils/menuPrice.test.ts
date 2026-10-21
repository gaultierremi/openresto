import { currencyDigits, formatPrice, parsePrice, priceToInput } from "@/utils/menuPrice";
import { MAX_PRICE_MINOR } from "@/constants/menu";
import { setActiveLocale } from "@/utils/locale";

afterEach(() => setActiveLocale(undefined));

describe("currencyDigits", () => {
  it("reads the minor unit from the currency", () => {
    expect(currencyDigits("EUR")).toBe(2);
    expect(currencyDigits("JPY")).toBe(0);
    expect(currencyDigits("KWD")).toBe(3);
  });

  it("falls back to cents for a code Intl rejects", () => {
    expect(currencyDigits("not-a-currency")).toBe(2);
  });
});

describe("formatPrice", () => {
  it("formats in the active locale", () => {
    setActiveLocale("fr");
    expect(formatPrice(1250, "EUR").replace(/\s/g, " ")).toBe("12,50 €");
    setActiveLocale("en");
    expect(formatPrice(1250, "EUR")).toBe("€12.50");
  });

  it("prints euros the Belgian way in French: 9,00 € and 1 234,50 €", () => {
    setActiveLocale("fr");
    const belgian = new Intl.NumberFormat("fr-BE", { style: "currency", currency: "EUR" });
    expect(formatPrice(900, "EUR")).toBe(belgian.format(9));
    expect(formatPrice(900, "EUR").replace(/\s/g, " ")).toBe("9,00 €");
    expect(formatPrice(123450, "EUR")).toBe(belgian.format(1234.5));
  });

  it("honours a currency with no decimals", () => {
    setActiveLocale("en");
    expect(formatPrice(1250, "JPY")).toBe("¥1,250");
  });

  it("falls back to the plain amount and code for an unknown currency", () => {
    expect(formatPrice(1250, "not-a-currency")).toBe("12.50 not-a-currency");
  });
});

describe("parsePrice", () => {
  it("accepts a dot or a comma as the separator", () => {
    expect(parsePrice("12.50", "EUR")).toBe(1250);
    expect(parsePrice("12,50", "EUR")).toBe(1250);
  });

  it("pads a short fraction and accepts a whole number", () => {
    expect(parsePrice("12.5", "EUR")).toBe(1250);
    expect(parsePrice("12", "EUR")).toBe(1200);
    expect(parsePrice("0", "EUR")).toBe(0);
    expect(parsePrice("12.", "EUR")).toBe(1200);
  });

  it("ignores spaces around and inside the amount", () => {
    expect(parsePrice("  1 250,00 ", "EUR")).toBe(125000);
  });

  it("refuses more decimals than the currency has rather than rounding them", () => {
    expect(parsePrice("12.505", "EUR")).toBeNull();
    expect(parsePrice("12.5", "JPY")).toBeNull();
    expect(parsePrice("1250", "JPY")).toBe(1250);
    expect(parsePrice("1.234", "KWD")).toBe(1234);
  });

  it("refuses text, negatives and an empty field", () => {
    expect(parsePrice("", "EUR")).toBeNull();
    expect(parsePrice("abc", "EUR")).toBeNull();
    expect(parsePrice("-3", "EUR")).toBeNull();
    expect(parsePrice("1.2.3", "EUR")).toBeNull();
  });

  it("accepts the server's ceiling and refuses one minor unit above it", () => {
    expect(parsePrice(String(MAX_PRICE_MINOR / 100), "EUR")).toBe(MAX_PRICE_MINOR);
    expect(parsePrice(`${MAX_PRICE_MINOR / 100}.01`, "EUR")).toBeNull();
  });
});

describe("priceToInput", () => {
  it("writes minor units back as a plain decimal", () => {
    expect(priceToInput(1250, "EUR")).toBe("12.50");
    expect(priceToInput(0, "EUR")).toBe("0.00");
    expect(priceToInput(1250, "JPY")).toBe("1250");
  });

  it("round-trips through parsePrice", () => {
    expect(parsePrice(priceToInput(1999, "EUR"), "EUR")).toBe(1999);
  });
});
