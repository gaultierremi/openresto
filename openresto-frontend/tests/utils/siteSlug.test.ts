import { isValidSlug, SLUG_MAX_LENGTH, SLUG_MIN_LENGTH, typedSlug } from "@/utils/siteSlug";

describe("isValidSlug", () => {
  it("accepts the shortest and the longest slug", () => {
    expect(isValidSlug("a".repeat(SLUG_MIN_LENGTH))).toBe(true);
    expect(isValidSlug("a".repeat(SLUG_MAX_LENGTH))).toBe(true);
  });

  it("refuses one character too short and one too long", () => {
    expect(isValidSlug("a".repeat(SLUG_MIN_LENGTH - 1))).toBe(false);
    expect(isValidSlug("a".repeat(SLUG_MAX_LENGTH + 1))).toBe(false);
  });

  it("accepts words and digits joined by single hyphens", () => {
    expect(isValidSlug("brasserie-de-la-senne-doree")).toBe(true);
    expect(isValidSlug("a1b")).toBe(true);
    expect(isValidSlug("pub-42")).toBe(true);
  });

  it.each(["-abc", "abc-", "ab--cd", "Abc", "ab_cd", "ab cd", "é-ab", "a/b", ""])(
    "refuses %p",
    (slug) => {
      expect(isValidSlug(slug)).toBe(false);
    }
  );
});

describe("typedSlug", () => {
  it("folds to lower case", () => {
    expect(typedSlug("Ma-Brasserie")).toBe("ma-brasserie");
  });

  it("turns each space into the hyphen it would have to become", () => {
    expect(typedSlug("ma brasserie")).toBe("ma-brasserie");
  });

  it("leaves other characters in place for the validity check to report", () => {
    expect(typedSlug("Café_1")).toBe("café_1");
    expect(isValidSlug(typedSlug("Café_1"))).toBe(false);
  });
});
