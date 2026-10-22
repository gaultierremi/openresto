import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

describe("service worker privacy", () => {
  function worker() {
    const listeners: Record<string, (event: unknown) => void> = {};
    const put = jest.fn();
    const fetch = jest
      .fn()
      .mockResolvedValue({ status: 200, headers: new Map(), clone: () => ({}) });
    const context = vm.createContext({
      self: {
        addEventListener: (type: string, callback: (event: unknown) => void) => {
          listeners[type] = callback;
        },
      },
      URL,
      fetch,
      caches: { open: jest.fn().mockResolvedValue({ put }), match: jest.fn() },
    });
    vm.runInContext(fs.readFileSync(path.join(__dirname, "../public/sw.js"), "utf8"), context);
    const request = async (pathname: string, method = "GET") => {
      const promises: Promise<unknown>[] = [];
      const respondWith = jest.fn((promise: Promise<unknown>) => {
        promises.push(promise);
      });
      listeners.fetch({ request: { url: `https://example.test${pathname}`, method }, respondWith });
      await Promise.all(promises);
      return respondWith;
    };
    return { fetch, put, request };
  }

  it.each([
    "/onboarding/invitation/credential",
    "/inscription",
    "/admin/dashboard",
    "/api/bookings",
  ])("never caches %s", async (url) => {
    const w = worker();
    expect(await w.request(url)).not.toHaveBeenCalled();
    expect(w.fetch).not.toHaveBeenCalled();
    expect(w.put).not.toHaveBeenCalled();
  });

  it("caches a public document but respects no-store and ignores writes", async () => {
    const w = worker();
    await w.request("/decouvrir");
    expect(w.put).toHaveBeenCalledTimes(1);
    w.fetch.mockResolvedValueOnce({
      status: 200,
      headers: new Map([["cache-control", "private, no-store"]]),
      clone: () => ({}),
    });
    await w.request("/private-document");
    expect(w.put).toHaveBeenCalledTimes(1);
    expect(await w.request("/anything", "POST")).not.toHaveBeenCalled();
  });
});
