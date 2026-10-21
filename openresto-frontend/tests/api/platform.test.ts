import * as platformApi from "@/api/platform";

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
const sentBody = () => JSON.parse(String(lastCall().init.body));

beforeEach(() => mockFetch.mockReset());

describe("request plumbing", () => {
  it("returns the parsed value on success, with the session cookie", async () => {
    ok([]);
    expect(await platformApi.fetchPlatformRestaurants()).toEqual({ ok: true, value: [] });
    expect(lastCall().url).toContain("/api/platform/restaurants");
    expect(lastCall().init.method).toBe("GET");
    expect(lastCall().init.credentials).toBe("include");
  });

  it("returns the refusal in the viewer's language, with its code", async () => {
    refuse({ message: "Restaurant not found.", code: "platform.not_found" }, 404);
    expect(await platformApi.reactivatePlatformRestaurant(9)).toEqual({
      ok: false,
      message: "Restaurant not found.",
      code: "platform.not_found",
    });
  });

  it("interpolates the limits the server names into the translated refusal", async () => {
    refuse({ message: "x", code: "platform.access_reason_required", args: { min: 10, max: 300 } });
    const result = await platformApi.accessPlatformGuestData(3, "short");
    expect(result).toEqual({
      ok: false,
      message: "State why the guests’ data is needed, in 10 to 300 characters.",
      code: "platform.access_reason_required",
    });
  });

  it("keeps the server's wording, and no code, for a refusal that carries none", async () => {
    refuse({ message: "Something odd." }, 500);
    expect(await platformApi.fetchPlatformRestaurants()).toEqual({
      ok: false,
      message: "Something odd.",
      code: undefined,
    });
  });

  it("falls back to a generic message when the refusal has no readable body", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 502,
      json: async () => {
        throw new Error("not json");
      },
    });
    expect(await platformApi.fetchPlatformRestaurants()).toEqual({
      ok: false,
      message: "Request failed.",
      code: undefined,
    });
  });

  it("copes with a refusal whose body is JSON null", async () => {
    refuse(null, 500);
    expect(await platformApi.fetchPlatformRestaurants()).toEqual({
      ok: false,
      message: "Request failed.",
      code: undefined,
    });
  });

  it("reports a request that never got an answer", async () => {
    mockFetch.mockRejectedValueOnce(new Error("offline"));
    expect(await platformApi.fetchPlatformRestaurants()).toEqual({
      ok: false,
      message: "Network error.",
    });
  });
});

describe("endpoints", () => {
  it("creates a restaurant with its owner's address and the invitation language", async () => {
    ok({ restaurant: { id: 4 }, invitationUrl: "https://x/i/abc", emailSent: true });
    const result = await platformApi.createPlatformRestaurant({
      name: "Chez Léa",
      ownerEmail: "lea@example.com",
      locale: "nl",
    });
    expect(result.ok).toBe(true);
    expect(lastCall().url).toContain("/api/platform/restaurants");
    expect(lastCall().init.method).toBe("POST");
    expect(sentBody()).toEqual({ name: "Chez Léa", ownerEmail: "lea@example.com", locale: "nl" });
  });

  it("sends an invitation to a restaurant, naming the address only when given", async () => {
    ok({ restaurant: { id: 4 }, invitationUrl: "https://x/i/abc", emailSent: false });
    await platformApi.sendPlatformInvitation(4, { email: "a@b.be", locale: "fr" });
    expect(lastCall().url).toContain("/api/platform/restaurants/4/invitations");
    expect(sentBody()).toEqual({ email: "a@b.be", locale: "fr" });

    ok({ restaurant: { id: 4 }, invitationUrl: "https://x/i/abc", emailSent: false });
    await platformApi.sendPlatformInvitation(4, { locale: "en" });
    expect(sentBody()).toEqual({ locale: "en" });
  });

  it("suspends with a reason, or with none", async () => {
    ok({ id: 4, status: "Suspended" });
    await platformApi.suspendPlatformRestaurant(4, "Invoice unpaid");
    expect(lastCall().url).toContain("/api/platform/restaurants/4/suspend");
    expect(sentBody()).toEqual({ reason: "Invoice unpaid" });

    ok({ id: 4, status: "Suspended" });
    await platformApi.suspendPlatformRestaurant(4, null);
    expect(sentBody()).toEqual({ reason: null });
  });

  it("reactivates without a body", async () => {
    ok({ id: 4, status: "Published" });
    await platformApi.reactivatePlatformRestaurant(4);
    expect(lastCall().url).toContain("/api/platform/restaurants/4/reactivate");
    expect(lastCall().init.method).toBe("POST");
    expect(lastCall().init.body).toBeUndefined();
  });

  it("sets the retention with a PUT carrying the months, or null for no erasure", async () => {
    ok({ id: 4, bookingRetentionMonths: 6 });
    const result = await platformApi.setPlatformRetention(4, 6);
    expect(result).toEqual({ ok: true, value: { id: 4, bookingRetentionMonths: 6 } });
    expect(lastCall().url).toContain("/api/platform/restaurants/4/retention");
    expect(lastCall().init.method).toBe("PUT");
    expect(sentBody()).toEqual({ months: 6 });

    ok({ id: 4, bookingRetentionMonths: null });
    await platformApi.setPlatformRetention(4, null);
    expect(sentBody()).toEqual({ months: null });
  });

  it("returns a refused retention with its code", async () => {
    refuse({
      message: "The retention period must be between 1 and 60 months.",
      code: "platform.retention_invalid",
    });
    expect(await platformApi.setPlatformRetention(4, 99)).toEqual({
      ok: false,
      message: "The retention period must be between 1 and 60 months.",
      code: "platform.retention_invalid",
    });
  });

  it("opens the guest data as a POST carrying the reason", async () => {
    ok({
      restaurantId: 4,
      restaurantName: "X",
      grantedAt: "2026-10-20T10:00:00Z",
      totalBookings: 0,
      bookings: [],
    });
    await platformApi.accessPlatformGuestData(4, "Support ticket 123, booking not received");
    expect(lastCall().url).toContain("/api/platform/restaurants/4/guest-data-access");
    expect(lastCall().init.method).toBe("POST");
    expect(sentBody()).toEqual({ reason: "Support ticket 123, booking not received" });
  });

  it("reads the consents of a restaurant", async () => {
    ok([]);
    await platformApi.fetchPlatformConsents(4);
    expect(lastCall().url).toContain("/api/platform/restaurants/4/consents");
    expect(lastCall().init.method).toBe("GET");
  });
});
