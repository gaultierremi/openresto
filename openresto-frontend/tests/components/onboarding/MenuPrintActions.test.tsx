/** @jest-environment jsdom */
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { MenuPrintActions } from "@/components/onboarding/MenuPrintActions";
import { getMenuTokens } from "@/api/onboarding";
import { openPrintPreview, menuPrintHtml, qrPrintHtml } from "@/utils/menuPrint";
import { preview } from "@/tests/helpers/onboardingFixtures";

jest.mock("@/api/onboarding", () => ({ getMenuTokens: jest.fn() }));
jest.mock("@/utils/menuPrint", () => ({
  openPrintPreview: jest.fn(),
  menuPrintHtml: jest.fn(() => "menu-html"),
  qrPrintHtml: jest.fn(() => "qr-html"),
}));
jest.mock("@/context/BrandContext", () => ({
  useBrand: () => ({ primaryColor: "#0a7ea4", websiteUrl: "https://resto.example" }),
}));
const props = {
  restaurantId: 7,
  name: "Brasserie Fictive",
  menu: preview().menu,
  onExpired: jest.fn(),
};
const tokens = { restaurantToken: "general", tables: [] };
beforeEach(() => {
  jest.clearAllMocks();
  (openPrintPreview as jest.Mock).mockReturnValue(true);
});

it("prints the saved menu in the selected language", () => {
  render(<MenuPrintActions {...props} />);
  fireEvent.press(screen.getByTestId("menu-print"));
  expect(menuPrintHtml).toHaveBeenCalledWith(props.name, props.menu, "en");
  expect(openPrintPreview).toHaveBeenCalledWith(props.name, "menu-html");
});

it("opens the QR window during the press, fills it after loading and uses the public origin", async () => {
  const popup = {
    opener: window,
    document: { body: { textContent: "" } },
    close: jest.fn(),
    closed: false,
  };
  const open = jest.spyOn(window, "open").mockReturnValue(popup as unknown as Window);
  (getMenuTokens as jest.Mock).mockResolvedValue({ ok: true, value: tokens });
  render(<MenuPrintActions {...props} />);
  fireEvent.press(screen.getByTestId("menu-print-qrs"));
  expect(open).toHaveBeenCalledTimes(1);
  expect(popup.opener).toBeNull();
  await waitFor(() => expect(openPrintPreview).toHaveBeenCalledWith(props.name, "qr-html", popup));
  expect(qrPrintHtml).toHaveBeenCalledWith(props.name, tokens, "https://resto.example");
  open.mockRestore();
});

it("reports a blocked preview without fetching the tokens", () => {
  const open = jest.spyOn(window, "open").mockReturnValue(null);
  render(<MenuPrintActions {...props} />);
  fireEvent.press(screen.getByTestId("menu-print-qrs"));
  expect(screen.getByRole("alert")).toBeTruthy();
  expect(getMenuTokens).not.toHaveBeenCalled();
  open.mockRestore();
});

it.each([401, 404])(
  "closes the preview on HTTP %s and handles session expiry separately",
  async (status) => {
    const popup = {
      opener: window,
      document: { body: { textContent: "" } },
      close: jest.fn(),
      closed: false,
    };
    const open = jest.spyOn(window, "open").mockReturnValue(popup as unknown as Window);
    (getMenuTokens as jest.Mock).mockResolvedValue({ ok: false, status, message: "Refusé" });
    render(<MenuPrintActions {...props} />);
    fireEvent.press(screen.getByTestId("menu-print-qrs"));
    await waitFor(() => expect(popup.close).toHaveBeenCalled());
    if (status === 401) expect(props.onExpired).toHaveBeenCalledTimes(1);
    else expect(screen.getByRole("alert")).toHaveTextContent("Refusé");
    expect(openPrintPreview).not.toHaveBeenCalled();
    open.mockRestore();
  }
);
