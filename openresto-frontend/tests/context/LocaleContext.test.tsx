/**
 * @jest-environment jsdom
 */
import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react-native";
import { Platform, Text } from "react-native";
import { LocaleProvider, useLocale, useRouteDefaultLocale } from "@/context/LocaleContext";
import i18n from "@/i18n";
import { setActiveLocale } from "@/utils/locale";
import { LOCALE_DIRECTIONS, MENU_DEFAULT_LOCALE, type SupportedLocale } from "@/constants/locales";

// StorageService (and therefore localStorage["openresto.locale"]) only reads on web.
Object.defineProperty(Platform, "OS", { value: "web", configurable: true });

const mockGetLocales = jest.fn<{ languageCode?: string; textDirection: string }[], []>(() => [
  { textDirection: "ltr" },
]);
jest.mock("expo-localization", () => ({
  getLocales: () => mockGetLocales(),
}));

let mockBrand: { defaultLocale?: string } = {};
jest.mock("@/context/BrandContext", () => ({
  useBrand: () => mockBrand,
}));

jest.mock("@/utils/locale", () => ({
  setActiveLocale: jest.fn(),
}));

function TestConsumer() {
  const { locale, setLocale } = useLocale();
  return (
    <>
      <Text testID="locale">{locale}</Text>
      <Text testID="switch-to-fr" onPress={() => setLocale("fr")}>
        switch
      </Text>
    </>
  );
}

describe("LocaleContext", () => {
  beforeEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
    mockGetLocales.mockReturnValue([{ textDirection: "ltr" }]);
    mockBrand = {};
    document.documentElement.lang = "";
    document.documentElement.dir = "";
    jest.spyOn(i18n, "changeLanguage").mockResolvedValue(undefined as never);
  });

  it("falls back to DEFAULT_LOCALE when nothing else resolves", async () => {
    render(
      <LocaleProvider>
        <TestConsumer />
      </LocaleProvider>
    );

    await waitFor(() => expect(screen.getByTestId("locale").props.children).toBe("en"));
    expect(i18n.changeLanguage).toHaveBeenCalledWith("en");
    expect(setActiveLocale).toHaveBeenCalledWith("en");
  });

  it("resolves brand.defaultLocale when localStorage has no saved pick", async () => {
    mockBrand = { defaultLocale: "es" };

    render(
      <LocaleProvider>
        <TestConsumer />
      </LocaleProvider>
    );

    await waitFor(() => expect(screen.getByTestId("locale").props.children).toBe("es"));
    expect(i18n.changeLanguage).toHaveBeenCalledWith("es");
    expect(setActiveLocale).toHaveBeenCalledWith("es");
  });

  it("prefers a supported localStorage pick over brand.defaultLocale", async () => {
    localStorage.setItem("openresto.locale", "fr");
    mockBrand = { defaultLocale: "es" };

    render(
      <LocaleProvider>
        <TestConsumer />
      </LocaleProvider>
    );

    await waitFor(() => expect(screen.getByTestId("locale").props.children).toBe("fr"));
    expect(i18n.changeLanguage).toHaveBeenCalledWith("fr");
  });

  it("falls through an unsupported localStorage value to brand.defaultLocale", async () => {
    localStorage.setItem("openresto.locale", "xx-not-a-locale");
    mockBrand = { defaultLocale: "de" };

    render(
      <LocaleProvider>
        <TestConsumer />
      </LocaleProvider>
    );

    await waitFor(() => expect(screen.getByTestId("locale").props.children).toBe("de"));
  });

  it("ignores the device language on web, where the restaurant's own default wins", async () => {
    // The mirror of this case is in LocaleContext.native.test.tsx, where the device wins.
    mockGetLocales.mockReturnValue([{ languageCode: "fr", textDirection: "ltr" }]);
    mockBrand = { defaultLocale: "es" };

    render(
      <LocaleProvider>
        <TestConsumer />
      </LocaleProvider>
    );

    await waitFor(() => expect(screen.getByTestId("locale").props.children).toBe("es"));
  });

  it("falls through an unsupported brand.defaultLocale to DEFAULT_LOCALE", async () => {
    mockBrand = { defaultLocale: "not-a-real-locale" };

    render(
      <LocaleProvider>
        <TestConsumer />
      </LocaleProvider>
    );

    await waitFor(() => expect(screen.getByTestId("locale").props.children).toBe("en"));
  });

  it("sets document.documentElement.lang and dir from the active locale on web", async () => {
    mockBrand = { defaultLocale: "fr" };

    render(
      <LocaleProvider>
        <TestConsumer />
      </LocaleProvider>
    );

    await waitFor(() => expect(document.documentElement.lang).toBe("fr"));
    expect(document.documentElement.dir).toBe(LOCALE_DIRECTIONS.fr);
  });

  it("takes dir from the chosen locale, not from an RTL device", async () => {
    mockGetLocales.mockReturnValue([{ textDirection: "rtl" }]);
    mockBrand = { defaultLocale: "de" };

    render(
      <LocaleProvider>
        <TestConsumer />
      </LocaleProvider>
    );

    await waitFor(() => expect(document.documentElement.lang).toBe("de"));
    expect(document.documentElement.dir).toBe("ltr");
  });

  it("useLocale defaults to DEFAULT_LOCALE outside a provider", () => {
    render(<TestConsumer />);
    expect(screen.getByTestId("locale").props.children).toBe("en");
  });

  it("setLocale outside a provider changes nothing and persists nothing", () => {
    render(<TestConsumer />);
    fireEvent.press(screen.getByTestId("switch-to-fr"));

    expect(screen.getByTestId("locale").props.children).toBe("en");
    expect(localStorage.getItem("openresto.locale")).toBeNull();
  });

  it("setLocale updates the context live, persists the pick, and re-applies i18next/formatters", async () => {
    render(
      <LocaleProvider>
        <TestConsumer />
      </LocaleProvider>
    );
    await waitFor(() => expect(screen.getByTestId("locale").props.children).toBe("en"));
    jest.clearAllMocks();

    fireEvent.press(screen.getByTestId("switch-to-fr"));

    expect(screen.getByTestId("locale").props.children).toBe("fr");
    expect(localStorage.getItem("openresto.locale")).toBe("fr");
    expect(i18n.changeLanguage).toHaveBeenCalledWith("fr");
    expect(setActiveLocale).toHaveBeenCalledWith("fr");
    expect(document.documentElement.lang).toBe("fr");
  });

  describe("route default (useRouteDefaultLocale)", () => {
    function RouteDefault({ locale }: { locale: SupportedLocale }) {
      useRouteDefaultLocale(locale);
      return null;
    }

    function Harness({ route }: { route: SupportedLocale | null }) {
      return (
        <LocaleProvider>
          <TestConsumer />
          {route ? <RouteDefault locale={route} /> : null}
        </LocaleProvider>
      );
    }

    const shown = () => screen.getByTestId("locale").props.children;

    it("is French for the public menu", () => {
      expect(MENU_DEFAULT_LOCALE).toBe("fr");
    });

    it("applies while the route is mounted, below the brand default it replaces", async () => {
      mockBrand = { defaultLocale: "es" };
      render(<Harness route="fr" />);

      await waitFor(() => expect(shown()).toBe("fr"));
      expect(i18n.changeLanguage).toHaveBeenLastCalledWith("fr");
      expect(setActiveLocale).toHaveBeenLastCalledWith("fr");
      expect(document.documentElement.lang).toBe("fr");
    });

    it("applies when the brand has no default of its own", async () => {
      render(<Harness route="fr" />);
      await waitFor(() => expect(shown()).toBe("fr"));
    });

    it("loses to a language the visitor has saved", async () => {
      localStorage.setItem("openresto.locale", "de");
      mockBrand = { defaultLocale: "es" };
      render(<Harness route="fr" />);

      await waitFor(() => expect(shown()).toBe("de"));
      expect(i18n.changeLanguage).not.toHaveBeenCalledWith("fr");
      expect(setActiveLocale).not.toHaveBeenCalledWith("fr");
    });

    it("yields to a pick made while the route is open, and does not persist its own", async () => {
      render(<Harness route="de" />);
      await waitFor(() => expect(shown()).toBe("de"));
      expect(localStorage.getItem("openresto.locale")).toBeNull();

      fireEvent.press(screen.getByTestId("switch-to-fr"));

      expect(shown()).toBe("fr");
      expect(localStorage.getItem("openresto.locale")).toBe("fr");
    });

    it("hands the brand default back when the route unmounts", async () => {
      mockBrand = { defaultLocale: "es" };
      const { rerender } = render(<Harness route="fr" />);
      await waitFor(() => expect(shown()).toBe("fr"));

      rerender(<Harness route={null} />);

      await waitFor(() => expect(shown()).toBe("es"));
      expect(i18n.changeLanguage).toHaveBeenLastCalledWith("es");
      expect(setActiveLocale).toHaveBeenLastCalledWith("es");
    });

    it("hands back English when there is no brand default either", async () => {
      const { rerender } = render(<Harness route="fr" />);
      await waitFor(() => expect(shown()).toBe("fr"));

      rerender(<Harness route={null} />);

      await waitFor(() => expect(shown()).toBe("en"));
    });

    it("follows the route when it asks for another language", async () => {
      const { rerender } = render(<Harness route="fr" />);
      await waitFor(() => expect(shown()).toBe("fr"));

      rerender(<Harness route="de" />);

      await waitFor(() => expect(shown()).toBe("de"));
    });

    it("does nothing outside a provider", () => {
      expect(() => render(<RouteDefault locale="fr" />)).not.toThrow();
    });
  });
});
