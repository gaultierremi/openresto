import { fetchLegalDocument, fetchLegalDocuments } from "@/api/legal";

const mockFetch = jest.fn();
global.fetch = mockFetch;

beforeEach(() => mockFetch.mockReset());

describe("legal api", () => {
  it("lists the documents", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [{ key: "terms", version: "2026-10-20" }],
    });
    expect(await fetchLegalDocuments()).toEqual({
      ok: true,
      value: [{ key: "terms", version: "2026-10-20" }],
    });
    expect(String(mockFetch.mock.calls[0][0])).toContain("/api/legal");
  });

  it("reads one document by its key, encoded", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ key: "legal-notice" }) });
    await fetchLegalDocument("legal-notice");
    expect(String(mockFetch.mock.calls[0][0])).toContain("/api/legal/legal-notice");

    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    await fetchLegalDocument("a/b");
    expect(String(mockFetch.mock.calls[1][0])).toContain("/api/legal/a%2Fb");
  });

  it("surfaces the not-found code of an unknown document", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: async () => ({ message: "Document not found.", code: "legal.document_not_found" }),
    });
    expect(await fetchLegalDocument("nope")).toEqual({
      ok: false,
      message: "Document not found.",
      code: "legal.document_not_found",
    });
  });
});
