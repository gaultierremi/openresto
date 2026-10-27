import * as api from "@/api/onboarding";
import { state } from "@/tests/helpers/onboardingFixtures";

const mockFetch = jest.fn();
global.fetch = mockFetch;

const ok = (body: unknown) =>
  mockFetch.mockResolvedValueOnce({
    ok: true,
    status: 200,
    headers: new Headers(),
    json: async () => body,
  });
const refuse = (body: unknown, status = 400) =>
  mockFetch.mockResolvedValueOnce({ ok: false, status, json: async () => body });

const lastCall = () => {
  const [url, init] = mockFetch.mock.calls[mockFetch.mock.calls.length - 1];
  return { url: String(url), init: init as RequestInit };
};

beforeEach(() => mockFetch.mockReset());

it("passes the private inbox validator and handles an unchanged response without parsing a body", async () => {
  const body = { timezone: "Europe/Brussels", bookings: [] };
  mockFetch.mockResolvedValueOnce({
    ok: true,
    status: 200,
    headers: new Headers({ ETag: '"example-version"' }),
    json: async () => body,
  });
  expect(await api.getInbox(7)).toEqual({
    ok: true,
    value: { ...body, etag: '"example-version"' },
  });
  const json = jest.fn();
  mockFetch.mockResolvedValueOnce({ ok: false, status: 304, json });
  expect(await api.getInbox(7, '"example-version"')).toEqual({ ok: true, value: null });
  expect(lastCall().init.headers).toMatchObject({ "If-None-Match": '"example-version"' });
  expect(json).not.toHaveBeenCalled();
});

it("imports source text without saving it and reads only the selected restaurant inbox", async () => {
  const proposal = { name: "Carte", categories: [] };
  ok(proposal);
  expect(await api.importMenuText(7, "Soupe 8,50", "fr")).toEqual({ ok: true, value: proposal });
  expect(lastCall().url).toContain("/onboarding/restaurants/7/menu/import");
  expect(JSON.parse(lastCall().init.body as string)).toEqual({
    text: "Soupe 8,50",
    language: "fr",
  });
  const inbox = { timezone: "Europe/Brussels", bookings: [] };
  ok(inbox);
  expect(await api.getInbox(7)).toEqual({ ok: true, value: inbox });
  expect(lastCall().url).toContain("/onboarding/restaurants/7/inbox");
  expect(lastCall().init.credentials).toBe("include");
});

it("sends a source photo and its language as multipart with the session cookie", async () => {
  ok({ name: "Menu", categories: [] });
  await api.importMenuPhoto(7, new File(["example"], "menu.png", { type: "image/png" }), "nl");
  expect(lastCall().url).toContain("/onboarding/restaurants/7/menu/import/photo");
  expect(lastCall().init.method).toBe("POST");
  expect(lastCall().init.credentials).toBe("include");
  expect((lastCall().init.body as FormData).get("language")).toBe("nl");
  expect((lastCall().init.body as FormData).get("file")).toBeInstanceOf(File);
});

it("uploads a dish photo through its existing route", async () => {
  ok({ imageUrl: "/media/example.png" });
  await api.uploadMenuPhoto(7, 9, new File(["example"], "dish.png", { type: "image/png" }));
  expect(lastCall().url).toContain("/onboarding/restaurants/7/menu/items/9/photo");
  expect(lastCall().init.credentials).toBe("include");
  expect((lastCall().init.body as FormData).get("file")).toBeInstanceOf(File);
});

it("uses restaurant-scoped service routes for tokens, availability and photo removal", async () => {
  ok({ restaurantToken: "general", tables: [] });
  await api.getMenuTokens(7);
  expect(lastCall().url).toContain("/onboarding/restaurants/7/menu/tokens");
  ok({ availability: "SoldOut" });
  await api.setMenuAvailability(7, 9, "SoldOut");
  expect(lastCall().url).toContain("/onboarding/restaurants/7/menu/items/9/availability");
  expect(JSON.parse(lastCall().init.body as string)).toEqual({ availability: "SoldOut" });
  ok({ imageUrl: null });
  await api.deleteMenuPhoto(7, 9);
  expect(lastCall().init.method).toBe("DELETE");
  expect(lastCall().url).toContain("/onboarding/restaurants/7/menu/items/9/photo");
});

describe("request plumbing", () => {
  it("returns the parsed value on success, with the session cookie", async () => {
    ok(state());
    expect(await api.getState(7)).toEqual({ ok: true, value: state() });
    expect(lastCall().url).toContain("/api/onboarding/restaurants/7");
    expect(lastCall().init.method).toBe("GET");
    expect(lastCall().init.credentials).toBe("include");
  });

  it("returns the refusal in the viewer's language, with its code and status", async () => {
    refuse({ message: "x", code: "onboarding.company_number_invalid" });
    expect(await api.saveInfo(7, {} as api.SaveInfoInput)).toEqual({
      ok: false,
      status: 400,
      code: "onboarding.company_number_invalid",
      message: "This enterprise number is not valid. Check it (format 0123.456.749).",
    });
  });

  it("interpolates the values the server names into the translated refusal", async () => {
    refuse({ message: "x", code: "onboarding.retention_invalid", args: { min: 1, max: 60 } });
    const result = await api.saveInfo(7, {} as api.SaveInfoInput);
    expect(!result.ok && result.message).toBe(
      "The retention period must be between 1 and 60 months."
    );
  });

  it("keeps the status of a 401, which is how a screen learns the session ended", async () => {
    refuse({}, 401);
    const result = await api.getMe();
    expect(result.ok).toBe(false);
    expect(!result.ok && result.status).toBe(401);
    expect(!result.ok && result.code).toBeUndefined();
  });

  it("falls back to a generic message when the refusal has no body", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => {
        throw new Error("not json");
      },
    });
    expect(await api.getMe()).toEqual({
      ok: false,
      status: 500,
      message: "The request failed. Try again in a moment.",
    });
  });

  it("ignores a code that is not a string", async () => {
    refuse({ message: "boom", code: 42 });
    const result = await api.getMe();
    expect(!result.ok && result.code).toBeUndefined();
  });

  it("reports a network failure with status 0", async () => {
    mockFetch.mockRejectedValueOnce(new Error("offline"));
    expect(await api.getMe()).toEqual({
      ok: false,
      status: 0,
      message: "The server could not be reached. Check your connection and try again.",
    });
  });
});

describe("the invitation", () => {
  it("reads it anonymously, with the token encoded", async () => {
    ok({});
    await api.getInvitation("a/b c");
    expect(lastCall().url).toContain("/api/onboarding/invitations/a%2Fb%20c");
    expect(lastCall().init.credentials).toBe("omit");
  });

  it("accepts it with a POST of the whole request", async () => {
    ok({ restaurantId: 7 });
    const input = {
      password: "abcdefghij",
      displayName: null,
      acceptedDocuments: [{ key: "terms", version: "1" }],
    };
    expect(await api.acceptInvitation("tok", input)).toEqual({
      ok: true,
      value: { restaurantId: 7 },
    });
    expect(lastCall().url).toMatch(/\/onboarding\/invitations\/tok\/accept$/);
    expect(lastCall().init.method).toBe("POST");
    expect(JSON.parse(lastCall().init.body as string)).toEqual(input);
  });
});

describe("reading", () => {
  it("asks for the session, the preview and the site preview", async () => {
    ok({});
    await api.getMe();
    expect(lastCall().url).toMatch(/\/onboarding\/me$/);

    ok({});
    await api.getPreview(7);
    expect(lastCall().url).toMatch(/\/onboarding\/restaurants\/7\/preview$/);

    mockFetch.mockResolvedValueOnce({ ok: true, status: 200, text: async () => "<html></html>" });
    expect(await api.fetchSitePreview(7)).toEqual({ ok: true, value: "<html></html>" });
    expect(lastCall().url).toMatch(/\/onboarding\/restaurants\/7\/preview\/site$/);
    expect((lastCall().init.headers as Record<string, string>).Accept).toBe("text/html");
  });
});

describe("the five steps", () => {
  const WRITERS: [string, (id: number, input: never) => Promise<unknown>][] = [
    ["info", api.saveInfo],
    ["hours", api.saveHours],
    ["layout", api.saveLayout],
    ["menu", api.saveMenu],
    ["branding", api.saveBranding],
  ];

  it.each(WRITERS)(
    "the %s step PUTs its own payload to its own endpoint",
    async (segment, write) => {
      ok(state());
      const payload = { sample: segment };
      await (write as (id: number, input: unknown) => Promise<unknown>)(7, payload);
      expect(lastCall().url).toMatch(new RegExp(`/onboarding/restaurants/7/${segment}$`));
      expect(lastCall().init.method).toBe("PUT");
      expect(JSON.parse(lastCall().init.body as string)).toEqual(payload);
    }
  );

  it("skips a step by its key", async () => {
    ok(state());
    await api.skipStep(7, "menu");
    expect(lastCall().url).toMatch(/\/onboarding\/restaurants\/7\/steps\/menu\/skip$/);
    expect(lastCall().init.method).toBe("POST");
  });
});

describe("the logo", () => {
  it("sends the file as multipart, leaving the boundary to the browser", async () => {
    ok(state());
    await api.uploadLogo(7, new File(["x"], "logo.png", { type: "image/png" }));
    expect(lastCall().url).toMatch(/\/onboarding\/restaurants\/7\/logo$/);
    expect(lastCall().init.method).toBe("POST");
    expect(lastCall().init.credentials).toBe("include");
    expect((lastCall().init.body as FormData).get("file")).toBeInstanceOf(File);
    expect(lastCall().init.headers).toBeUndefined();
  });

  it("reports the server's refusal of a picture by its code", async () => {
    refuse({ message: "x", code: "media.unsupported_image_type" });
    const result = await api.uploadLogo(7, new File(["x"], "logo.gif", { type: "image/gif" }));
    expect(!result.ok && result.message).toBe("Only JPEG, PNG, and WebP images are accepted.");
  });

  it("removes it with a DELETE", async () => {
    ok(state());
    await api.deleteLogo(7);
    expect(lastCall().url).toMatch(/\/onboarding\/restaurants\/7\/logo$/);
    expect(lastCall().init.method).toBe("DELETE");
  });
});

describe("going live", () => {
  it("publishes and unpublishes through their own endpoints", async () => {
    ok(state());
    await api.publish(7);
    expect(lastCall().url).toMatch(/\/onboarding\/restaurants\/7\/publish$/);
    expect(lastCall().init.method).toBe("POST");

    ok(state());
    await api.unpublish(7);
    expect(lastCall().url).toMatch(/\/onboarding\/restaurants\/7\/unpublish$/);
  });
});
