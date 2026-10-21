import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { DEFAULT_LOCALE } from "@/constants/locales";
import en from "@/locales/en.json";
import fr from "@/locales/fr.json";
import es from "@/locales/es.json";
import de from "@/locales/de.json";
import nl from "@/locales/nl.json";

/**
 * All five locale JSONs are imported statically and bundled inline — no `i18next-http-backend`.
 * At five locales and a few hundred keys that is a smaller payload than one extra network
 * round trip, and it keeps the runtime language switch instant (no fetch to wait on). Revisit
 * past ~8 languages.
 *
 * Dutch covers the guest surface only, so `nl` has no `admin` subtree: a Dutch viewer who
 * reaches an untranslated key reads French, then English, rather than a raw key.
 *
 * @see [init.test.ts](../tests/i18n/init.test.ts) — pins the chain, and that an admin key
 * resolves to French under `nl` while a guest key stays Dutch.
 */
i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    fr: { translation: fr },
    es: { translation: es },
    de: { translation: de },
    nl: { translation: nl },
  },
  lng: DEFAULT_LOCALE,
  fallbackLng: { nl: ["fr", "en"], default: [DEFAULT_LOCALE] },
  interpolation: {
    escapeValue: false, // React Native does no HTML escaping, unlike the DOM i18next targets by default.
  },
  react: {
    useSuspense: false, // No Suspense boundary at the root — the locale resolves after first paint.
  },
});

export default i18n;
