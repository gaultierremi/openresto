import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { Platform } from "react-native";
import { getLocales } from "expo-localization";
import i18n from "@/i18n";
import { setActiveLocale } from "@/utils/locale";
import { StorageService } from "@/services/storage";
import { useBrand } from "@/context/BrandContext";
import {
  DEFAULT_LOCALE,
  LOCALE_DIRECTIONS,
  isSupportedLocale,
  type SupportedLocale,
} from "@/constants/locales";

const STORAGE_KEY = "openresto.locale";

/**
 * The first language the browser lists that this app ships, in the browser's own order of
 * preference (`navigator.languages`, then `navigator.language`), matched on the language
 * subtag so `nl-BE` and `fr-CA` count as `nl` and `fr`. `undefined` when there is no
 * `navigator` (the static export renders without one) or nothing listed is shipped.
 */
function browserLocale(): SupportedLocale | undefined {
  if (typeof navigator === "undefined") return undefined;
  for (const tag of [...(navigator.languages ?? []), navigator.language]) {
    const languageCode = tag?.split(/[-_]/)[0].toLowerCase();
    if (isSupportedLocale(languageCode)) return languageCode;
  }
  return undefined;
}

/**
 * The language of the device the viewer is on: the phone's own off web, only when this app
 * ships it, or the browser's on web, unless a mounted route opted out of it.
 *
 * @see [LocaleContext.native.test.tsx](../tests/context/LocaleContext.native.test.tsx) — pins
 * that a device set to a shipped language wins over the brand default, and that a device set
 * to one this app does not ship falls through to it.
 * @see [LocaleContext.test.tsx](../tests/context/LocaleContext.test.tsx) — pins the same two
 * cases for the browser, plus that opting out puts the brand default back.
 */
function deviceLocale(browserAllowed: boolean): SupportedLocale | undefined {
  if (Platform.OS === "web") return browserAllowed ? browserLocale() : undefined;
  const languageCode = getLocales()[0]?.languageCode;
  return isSupportedLocale(languageCode) ? languageCode : undefined;
}

/**
 * Resolution order, highest priority first:
 *  1. The viewer's own pick, in `localStorage["openresto.locale"]`, written by `setLocale`
 *     below — the admin sidebar's `LanguageSwitcher`, the guest navbar's overflow menu and
 *     the native guest settings sheet all go through it. A value outside `SUPPORTED_LOCALES`
 *     is ignored, not trusted.
 *  2. The device locale: the phone's language off web, the browser's `navigator.languages`
 *     on web. A guest in Belgium whose browser asks for Dutch gets Dutch without finding the
 *     switcher; the switcher stays the escape hatch for a browser set to the wrong language.
 *     A route that is not for the guest (the admin) calls `useBrowserLocaleOptOut` so it
 *     keeps following the instance default instead of the owner's browser.
 *  3. A route's own default, while one is mounted (`useRouteDefaultLocale`): the public menu
 *     page opens in French for a guest who has not picked a language and whose browser names
 *     none this app ships. It stands in for step 4's input, never above the viewer's pick or
 *     the device.
 *  4. `brand.defaultLocale`, the self-hoster's `Locale:Default` / `OPENRESTO_DEFAULT_LOCALE`.
 *  5. `DEFAULT_LOCALE` ("en"), hardcoded.
 *
 * @see [LocaleContext.test.tsx](../tests/context/LocaleContext.test.tsx) — pins the web order,
 * browser language included, and that a route default sits below the viewer's own pick.
 */
function resolveLocale(
  brandDefaultLocale: string | undefined,
  browserAllowed: boolean
): SupportedLocale {
  const stored = StorageService.getItem(STORAGE_KEY);
  if (isSupportedLocale(stored)) return stored;
  return (
    deviceLocale(browserAllowed) ??
    (isSupportedLocale(brandDefaultLocale) ? brandDefaultLocale : DEFAULT_LOCALE)
  );
}

interface LocaleContextValue {
  locale: SupportedLocale;
  /**
   * The language switcher's write path: persists the pick to
   * `localStorage["openresto.locale"]` (so it wins the resolution order on the next visit),
   * updates the context so every `useLocale()` consumer re-renders, and applies it live via
   * `applyLocale` — the same i18next + `setActiveLocale` pair the initial resolution uses, so
   * switching languages re-formats dates/times immediately rather than only retranslating text.
   */
  setLocale: (locale: SupportedLocale) => void;
  /**
   * Sets, or with null clears, the language a mounted route opens in when the viewer has not
   * chosen one. Not persisted: leaving the route puts the instance's own default back.
   */
  setRouteDefault: (locale: SupportedLocale | null) => void;
  /**
   * Registers a route that must not follow the browser's language and returns the function
   * that withdraws it. Counted, so two such routes mounted at once do not clear each other.
   */
  holdBrowserOptOut: () => () => void;
}

const LocaleContext = createContext<LocaleContextValue>({
  locale: DEFAULT_LOCALE,
  setLocale: () => {},
  setRouteDefault: () => {},
  holdBrowserOptOut: () => () => {},
});

/**
 * Applies a locale to every consumer outside React state: i18next (drives `t()` and
 * `useTranslation()` re-renders), `utils/locale.ts` (drives every `utils/formatters.ts`
 * date/time/number formatter), and the document's `lang`/`dir` on web. Shared by the initial
 * resolution effect and the switcher's `setLocale`, so the two paths can't drift apart.
 */
function applyLocale(locale: SupportedLocale): void {
  i18n.changeLanguage(locale);
  setActiveLocale(locale);

  /* istanbul ignore else -- native has no `document`; every test runs under jsdom */
  if (typeof document !== "undefined") {
    document.documentElement.lang = locale;
    document.documentElement.dir = LOCALE_DIRECTIONS[locale];
  }
}

/**
 * Mounted under `BrandProvider`, since resolution reads `brand.defaultLocale`. Applies the
 * resolved locale to both i18next (`i18n.changeLanguage`) and `utils/locale.ts`
 * (`setActiveLocale`) — the second call is what makes every date/time/number formatter in
 * `utils/formatters.ts` follow the UI language instead of the device's.
 */
export function LocaleProvider({ children }: { children: ReactNode }) {
  const brand = useBrand();
  const [routeDefault, setRouteDefault] = useState<SupportedLocale | null>(null);
  const [browserOptOuts, setBrowserOptOuts] = useState(0);
  const browserAllowed = browserOptOuts === 0;
  const [locale, setLocaleState] = useState<SupportedLocale>(() =>
    resolveLocale(brand.defaultLocale, browserAllowed)
  );

  useEffect(() => {
    const resolved = resolveLocale(routeDefault ?? brand.defaultLocale, browserAllowed);
    setLocaleState(resolved);
    applyLocale(resolved);
  }, [brand.defaultLocale, routeDefault, browserAllowed]);

  const setLocale = (next: SupportedLocale) => {
    StorageService.setItem(STORAGE_KEY, next);
    setLocaleState(next);
    applyLocale(next);
  };

  const holdBrowserOptOut = useCallback(() => {
    setBrowserOptOuts((count) => count + 1);
    return () => setBrowserOptOuts((count) => count - 1);
  }, []);

  return (
    <LocaleContext.Provider value={{ locale, setLocale, setRouteDefault, holdBrowserOptOut }}>
      {children}
    </LocaleContext.Provider>
  );
}

/**
 * Opens the mounted route in `locale` for a viewer with no saved language pick and no shipped
 * browser language, and hands the instance's default back on unmount. The public menu page uses
 * it: a QR code is scanned by a guest, not by the restaurant's own staff, so it speaks the
 * language of the restaurant's guests until the guest says otherwise.
 *
 * @see [LocaleContext.test.tsx](../tests/context/LocaleContext.test.tsx) — pins that the route
 * default applies, that a saved pick outranks it, and that unmounting restores the brand default.
 */
export function useRouteDefaultLocale(locale: SupportedLocale): void {
  const { setRouteDefault } = useContext(LocaleContext);
  useEffect(() => {
    setRouteDefault(locale);
    return () => setRouteDefault(null);
  }, [locale, setRouteDefault]);
}

/**
 * Keeps the mounted route on the instance's own default language rather than the browser's,
 * for a viewer with no saved pick, and hands the browser back on unmount. The admin uses it:
 * its screens ship no Dutch, and a restaurant's staff run the back office in the language the
 * instance was configured with, wherever their browser happens to point.
 *
 * @see [LocaleContext.test.tsx](../tests/context/LocaleContext.test.tsx) — pins that a mounted
 * opt-out ignores the browser, that a saved pick still outranks the default, and that
 * unmounting restores the browser's language.
 */
export function useBrowserLocaleOptOut(): void {
  const { holdBrowserOptOut } = useContext(LocaleContext);
  useEffect(() => holdBrowserOptOut(), [holdBrowserOptOut]);
}

export function useLocale(): LocaleContextValue {
  return useContext(LocaleContext);
}
