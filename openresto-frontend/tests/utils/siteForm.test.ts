import {
  formFromInput,
  formFromSite,
  inputFromForm,
  inputFromSite,
  isValidSocialUrl,
  nextFreeKind,
  siteFormProblem,
  type SiteForm,
} from "@/utils/siteForm";
import { MAX_SOCIAL_URL_LENGTH, SOCIAL_KINDS } from "@/constants/site";
import { site } from "@/tests/helpers/siteFixtures";

const form = (over: Partial<SiteForm> = {}): SiteForm => ({
  ...formFromSite(site()),
  ...over,
});

describe("inputFromForm", () => {
  it("trims, and sends a blank as null", () => {
    expect(
      inputFromForm(
        form({
          slug: " ma-brasserie ",
          tagline: "  ",
          legalName: " Senne SRL ",
          companyNumber: "",
          vatNumber: " BE 1 ",
          legalAddress: " ",
        })
      )
    ).toEqual({
      slug: "ma-brasserie",
      theme: "Brasserie",
      tagline: null,
      socialLinks: [],
      legal: { name: "Senne SRL", companyNumber: null, vatNumber: "BE 1", address: null },
    });
  });

  it("leaves out a link whose address is not typed yet, and orders the rest like the server", () => {
    const input = inputFromForm(
      form({
        socials: [
          { kind: "TripAdvisor", url: " https://tripadvisor.be/x " },
          { kind: "Facebook", url: "" },
          { kind: "Instagram", url: "https://instagram.com/x" },
        ],
      })
    );

    expect(input.socialLinks).toEqual([
      { kind: "Instagram", url: "https://instagram.com/x" },
      { kind: "TripAdvisor", url: "https://tripadvisor.be/x" },
    ]);
  });

  it("is what the server's own answer comes back to, so a round trip is not an edit", () => {
    const saved = site({
      tagline: "Cuisine",
      socialLinks: [{ kind: "Facebook", url: "https://facebook.com/x" }],
      legal: { name: "A", companyNumber: "1", vatNumber: "2", address: "3" },
    });

    expect(JSON.stringify(inputFromForm(formFromSite(saved)))).toBe(
      JSON.stringify(inputFromSite(saved))
    );
  });
});

describe("formFromInput", () => {
  it("puts a payload back into the fields, with a null as an empty input", () => {
    const back = formFromInput({
      slug: "x-y",
      theme: "Cafe",
      tagline: null,
      socialLinks: [{ kind: "X", url: "https://x.com/y" }],
      legal: { name: null, companyNumber: "9", vatNumber: null, address: null },
    });

    expect(back).toEqual({
      slug: "x-y",
      theme: "Cafe",
      tagline: "",
      socials: [{ kind: "X", url: "https://x.com/y" }],
      legalName: "",
      companyNumber: "9",
      vatNumber: "",
      legalAddress: "",
    });
  });
});

describe("isValidSocialUrl", () => {
  it("accepts an https address", () => {
    expect(isValidSocialUrl("https://instagram.com/senne")).toBe(true);
  });

  it.each([
    "http://instagram.com/x",
    "javascript:alert(1)",
    "instagram.com/x",
    "//x.com",
    "",
    "https://",
    "https:///x",
    "https://insta gram.com",
  ])("refuses %p", (url) => {
    expect(isValidSocialUrl(url)).toBe(false);
  });

  it("accepts an address at the cap and refuses one character over", () => {
    const head = "https://instagram.com/";
    expect(isValidSocialUrl(head + "a".repeat(MAX_SOCIAL_URL_LENGTH - head.length))).toBe(true);
    expect(isValidSocialUrl(head + "a".repeat(MAX_SOCIAL_URL_LENGTH - head.length + 1))).toBe(
      false
    );
  });
});

describe("siteFormProblem", () => {
  it("finds nothing wrong with a filled form", () => {
    expect(siteFormProblem(form(), true)).toBeNull();
  });

  it("holds back an address that is not a valid slug", () => {
    expect(siteFormProblem(form({ slug: "Ma Brasserie" }), false)).toBe("slug");
    expect(siteFormProblem(form({ slug: "ab" }), false)).toBe("slug");
    expect(siteFormProblem(form({ slug: "abc" }), false)).toBeNull();
  });

  it("holds back a filled link that is not https, but not one still empty", () => {
    expect(
      siteFormProblem(form({ socials: [{ kind: "Facebook", url: "http://fb.com/x" }] }), false)
    ).toBe("socialUrl");
    expect(siteFormProblem(form({ socials: [{ kind: "Facebook", url: "  " }] }), false)).toBeNull();
  });

  it("holds back a network listed twice, and accepts each once", () => {
    expect(
      siteFormProblem(
        form({
          socials: [
            { kind: "Facebook", url: "https://a.example" },
            { kind: "Facebook", url: "https://b.example" },
          ],
        }),
        false
      )
    ).toBe("socialDuplicate");
    expect(
      siteFormProblem(
        form({
          socials: SOCIAL_KINDS.map((kind) => ({ kind, url: `https://${kind}.example` })),
        }),
        false
      )
    ).toBeNull();
  });

  it.each(["0123.456.789", "BE 0123 456 789", "IE-6388047/V", ""])("accepts the number %p", (n) => {
    expect(siteFormProblem(form({ companyNumber: n }), false)).toBeNull();
    expect(siteFormProblem(form({ vatNumber: n }), false)).toBeNull();
  });

  it.each(["0123_456", "01<23>", "Ü123", "12;34"])("holds back the number %p", (n) => {
    expect(siteFormProblem(form({ companyNumber: n }), false)).toBe("identifier");
    expect(siteFormProblem(form({ vatNumber: n }), false)).toBe("identifier");
  });

  it("lets a draft empty its legal identity", () => {
    expect(siteFormProblem(form({ legalName: "", companyNumber: "" }), false)).toBeNull();
  });

  it("holds back emptying the legal name or the company number of a live site", () => {
    expect(siteFormProblem(form({ legalName: " " }), true)).toBe("legalRequired");
    expect(siteFormProblem(form({ companyNumber: "" }), true)).toBe("legalRequired");
    expect(siteFormProblem(form({ vatNumber: "", legalAddress: "" }), true)).toBeNull();
  });

  it("names the first reason in the order the card lists its fields", () => {
    expect(
      siteFormProblem(
        form({ slug: "x", socials: [{ kind: "X", url: "nope" }], companyNumber: "_" }),
        true
      )
    ).toBe("slug");
  });
});

describe("nextFreeKind", () => {
  it("offers the first network not yet listed", () => {
    expect(nextFreeKind([])).toBe("Facebook");
    expect(nextFreeKind([{ kind: "Facebook", url: "" }])).toBe("Instagram");
  });

  it("offers nothing once every network has a row", () => {
    expect(nextFreeKind(SOCIAL_KINDS.map((kind) => ({ kind, url: "" })))).toBeNull();
  });
});
