import * as api from "@/api/operations";
import i18n from "@/i18n";

const mockFetch = jest.fn();
global.fetch = mockFetch;
beforeEach(() => mockFetch.mockReset());
afterEach(async () => {
  await i18n.changeLanguage("en");
});

it.each(["fr", "nl", "en"])(
  "keeps the chosen %s language on a waitlist registration",
  async (language) => {
    await i18n.changeLanguage(language);
    mockFetch.mockResolvedValue({ ok: true, status: 204 });
    expect(await api.addOperationsWaitlist(7, "Ada", 2, "ada@example.test")).toEqual({
      ok: true,
      value: undefined,
    });
    expect(JSON.parse(mockFetch.mock.calls[0][1].body).locale).toBe(language);
  }
);

it.each([
  ["fr", "Vérifiez les champs renseignés."],
  ["nl", "Controleer de velden."],
  ["en", "Check the fields."],
])("shows a refused exception in %s and does not retry the write", async (language, message) => {
  await i18n.changeLanguage(language);
  mockFetch.mockResolvedValue({
    ok: false,
    status: 400,
    json: async () => ({
      code: "operations.invalid",
      message: "La date doit être au format AAAA-MM-JJ.",
    }),
  });
  expect(
    await api.saveException(7, { date: "bad", open: "12:00", close: "22:00", closed: true })
  ).toEqual({ ok: false, status: 400, code: "operations.invalid", message });
  expect(mockFetch).toHaveBeenCalledTimes(1);
});
