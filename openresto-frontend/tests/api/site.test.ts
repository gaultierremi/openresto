import * as siteApi from "@/api/site";
import type { SaveSiteInput } from "@/api/site";
import { site } from "@/tests/helpers/siteFixtures";

const mockFetch = jest.fn();
global.fetch = mockFetch;

const ok = (body: unknown) =>
  mockFetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => body });
const refuse = (body: unknown, status = 400) =>
  mockFetch.mockResolvedValueOnce({ ok: false, status, json: async () => body });

const lastCall = () => {
  const [url, init] = mockFetch.mock.calls[mockFetch.mock.calls.length - 1];
  return { url: String(url), init: init as RequestInit };
};

const INPUT: SaveSiteInput = {
  slug: "ma-brasserie",
  theme: "Cafe",
  tagline: null,
  socialLinks: [],
  legal: { name: "SRL", companyNumber: "1", vatNumber: null, address: null },
};

beforeEach(() => mockFetch.mockReset());

describe("request plumbing", () => {
  it("returns the parsed site on success, with the session cookie", async () => {
    ok(site());
    expect(await siteApi.adminGetSite(3)).toEqual({ ok: true, value: site() });
    expect(lastCall().url).toContain("/api/admin/restaurants/3/site");
    expect(lastCall().init.method).toBe("GET");
    expect(lastCall().init.credentials).toBe("include");
  });

  it("returns the refusal in the viewer's language, by its code", async () => {
    refuse({ message: "Another website already uses this address.", code: "site.slug_taken" });
    expect(await siteApi.adminSaveSite(3, INPUT)).toEqual({
      ok: false,
      message: "Another website already uses this address.",
    });
  });

  it("interpolates the values the server names into the translated refusal", async () => {
    refuse({ message: "x", code: "site.photos_full", args: { max: 6 } });
    expect(await siteApi.adminAddSitePhoto(3, new File(["x"], "a.jpg"), "alt")).toEqual({
      ok: false,
      message: "A gallery holds at most 6 photos.",
    });
  });

  it("falls back to a generic message when the refusal has no body", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => {
        throw new Error("not json");
      },
    });
    expect(await siteApi.adminGetSite(3)).toEqual({ ok: false, message: "Request failed." });
  });

  it("returns a network error message when the request throws", async () => {
    mockFetch.mockRejectedValueOnce(new Error("offline"));
    expect(await siteApi.adminGetSite(3)).toEqual({ ok: false, message: "Network error." });
  });
});

describe("settings and publication", () => {
  it("saves the whole payload with a PUT", async () => {
    ok(site());
    await siteApi.adminSaveSite(3, INPUT);
    expect(lastCall().url).toContain("/api/admin/restaurants/3/site");
    expect(lastCall().init.method).toBe("PUT");
    expect(JSON.parse(lastCall().init.body as string)).toEqual(INPUT);
  });

  it("publishes and unpublishes through their own endpoints", async () => {
    ok(site());
    await siteApi.adminSetSitePublished(3, true);
    expect(lastCall().url).toMatch(/\/site\/publish$/);
    expect(lastCall().init.method).toBe("POST");

    ok(site());
    await siteApi.adminSetSitePublished(3, false);
    expect(lastCall().url).toMatch(/\/site\/unpublish$/);
  });
});

describe("preview", () => {
  it("asks for HTML and returns it as text", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200, text: async () => "<html></html>" });
    expect(await siteApi.adminFetchSitePreview(3)).toEqual({ ok: true, value: "<html></html>" });
    expect(lastCall().url).toMatch(/\/site\/preview$/);
    expect((lastCall().init.headers as Record<string, string>).Accept).toBe("text/html");
  });

  it("previews another theme by name, without saving it", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200, text: async () => "x" });
    await siteApi.adminFetchSitePreview(3, "Gastronomique");
    expect(lastCall().url).toMatch(/\/site\/preview\?theme=Gastronomique$/);
    expect(lastCall().init.method).toBe("GET");
  });

  it("reports a refused preview", async () => {
    refuse({ message: "That theme doesn't exist.", code: "site.theme_invalid" });
    expect((await siteApi.adminFetchSitePreview(3, "Cafe")).ok).toBe(false);
  });
});

describe("pictures", () => {
  it("sends a logo or cover as multipart, leaving the boundary to the browser", async () => {
    ok(site());
    const file = new File(["x"], "logo.png", { type: "image/png" });
    await siteApi.adminUploadSiteImage(3, "logo", file);

    expect(lastCall().url).toMatch(/\/site\/logo$/);
    expect(lastCall().init.method).toBe("POST");
    expect(lastCall().init.credentials).toBe("include");
    const body = lastCall().init.body as FormData;
    expect(body.get("file")).toBeInstanceOf(File);
    expect(lastCall().init.headers).toBeUndefined();

    ok(site());
    await siteApi.adminUploadSiteImage(3, "cover", file);
    expect(lastCall().url).toMatch(/\/site\/cover$/);
  });

  it("sends a gallery photo with its description", async () => {
    ok(site());
    await siteApi.adminAddSitePhoto(3, new File(["x"], "p.jpg"), "La salle");

    expect(lastCall().url).toMatch(/\/site\/photos$/);
    const body = lastCall().init.body as FormData;
    expect(body.get("alt")).toBe("La salle");
    expect(body.get("file")).toBeInstanceOf(File);
  });

  it("deletes a logo or a cover", async () => {
    ok(site());
    await siteApi.adminDeleteSiteImage(3, "cover");
    expect(lastCall().url).toMatch(/\/site\/cover$/);
    expect(lastCall().init.method).toBe("DELETE");
  });

  it("edits, reorders and deletes photos by their token", async () => {
    ok(site());
    await siteApi.adminUpdateSitePhotoAlt(3, "a/b", "Nouvelle");
    expect(lastCall().url).toMatch(/\/site\/photos\/a%2Fb$/);
    expect(lastCall().init.method).toBe("PUT");
    expect(JSON.parse(lastCall().init.body as string)).toEqual({ alt: "Nouvelle" });

    ok(site());
    await siteApi.adminReorderSitePhotos(3, ["b", "a"]);
    expect(lastCall().url).toMatch(/\/site\/photos\/reorder$/);
    expect(lastCall().init.method).toBe("PATCH");
    expect(JSON.parse(lastCall().init.body as string)).toEqual({ ids: ["b", "a"] });

    ok(site());
    await siteApi.adminDeleteSitePhoto(3, "abc");
    expect(lastCall().url).toMatch(/\/site\/photos\/abc$/);
    expect(lastCall().init.method).toBe("DELETE");
  });
});
