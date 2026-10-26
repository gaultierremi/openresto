import i18n from "@/i18n";
import type { OnboardingMenu } from "@/api/onboarding";
import type { PublicMenu, PublicTokens } from "@/api/menus";
import { menuTranslation } from "@/utils/menuTranslation";
import { formatPrice } from "@/utils/menuPrice";
import { menuUrl, qrToSvg, svgToDataUri } from "@/utils/qrCode";

const escapeHtml = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!
  );
const CSS = `@page{size:A4;margin:15mm}*{box-sizing:border-box}body{font:12pt system-ui,sans-serif;color:#111;background:#fff;max-width:180mm;margin:20px auto}h1,h2{break-after:avoid}article,figure{break-inside:avoid}article{padding:8px 0;border-bottom:1px solid #ddd}article header{display:flex;justify-content:space-between;gap:16px}p{margin:4px 0}small{display:block}.qr{display:grid;grid-template-columns:1fr 1fr;gap:10mm}figure{margin:0;padding:5mm;text-align:center;border:1px dashed #888}figure img{width:54mm;height:54mm}figure small{overflow-wrap:anywhere;font-size:8pt}button{min-height:44px;padding:8px 16px;margin:8px}@media print{body{margin:0}nav{display:none}}`;

export function menuPrintHtml(
  name: string,
  menu: OnboardingMenu | PublicMenu,
  language: string
): string {
  const t = i18n.getFixedT(language);
  const currency = menu.currency ?? "EUR";
  return (
    `<h1>${escapeHtml(name)}</h1><h2>${escapeHtml(menu.name)}</h2><p>${escapeHtml(t("common.menu.allergenNote"))}</p>` +
    menu.categories
      .filter((category) => !("isVisible" in category) || category.isVisible !== false)
      .map(
        (category) =>
          `<section><h2>${escapeHtml(category.name)}</h2>` +
          category.items
            .filter((item) => item.availability !== "Hidden")
            .map((item) => {
              const text = menuTranslation(item, language);
              const declarations = (item.allergens ?? [])
                .map((allergen) => t(`common.menu.allergens.${allergen}`))
                .join(", ");
              return (
                `<article><header><strong>${escapeHtml(text.name)}</strong><span>${escapeHtml(item.priceMinor === null ? t("common.menu.priceOnRequest") : formatPrice(item.priceMinor, currency))}</span></header>` +
                (text.description ? `<p>${escapeHtml(text.description)}</p>` : "") +
                (item.availability === "SoldOut"
                  ? `<p><strong>${escapeHtml(t("common.menu.availability.SoldOut"))}</strong></p>`
                  : "") +
                (declarations
                  ? `<small>${escapeHtml(t("admin.menus.item.allergensLabel"))}: ${escapeHtml(declarations)}</small>`
                  : "") +
                `</article>`
              );
            })
            .join("") +
          `</section>`
      )
      .join("")
  );
}

export function qrPrintHtml(name: string, tokens: PublicTokens, base: string): string {
  const t = i18n.t.bind(i18n);
  const codes = [
    {
      label: t("admin.qrCodes.sheet.restaurantLabel"),
      url: menuUrl(base, "r", tokens.restaurantToken),
    },
    ...tokens.tables.map((table) => ({
      label: `${table.sectionName} · ${table.tableName ?? t("admin.qrCodes.tableFallback", { id: table.tableId })}`,
      url: menuUrl(base, "t", table.token),
    })),
  ];
  return (
    `<h1>${escapeHtml(name)}</h1><p>${escapeHtml(t("admin.qrCodes.sheet.scan"))}</p><div class="qr">` +
    codes
      .map(
        (code) =>
          `<figure><img alt="" src="${svgToDataUri(qrToSvg(code.url))}"><figcaption><strong>${escapeHtml(code.label)}</strong><small>${escapeHtml(code.url)}</small></figcaption></figure>`
      )
      .join("") +
    `</div>`
  );
}

/** @see [menuPrint.test.ts](../tests/utils/menuPrint.test.ts) — prints only guest-visible dishes and escapes restaurant text. */
export function openPrintPreview(title: string, body: string, existingPopup?: Window): boolean {
  if (typeof window === "undefined") return false;
  const popup = existingPopup ?? window.open("", "_blank");
  if (!popup) return false;
  popup.opener = null;
  popup.document.open();
  popup.document.write(
    `<!doctype html><html lang="${escapeHtml(i18n.language)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>${escapeHtml(title)}</title><style>${CSS}</style></head><body><nav><button type="button">${escapeHtml(i18n.t("common.menu.printPdf"))}</button></nav>${body}</body></html>`
  );
  popup.document.close();
  popup.document.querySelector("button")?.addEventListener("click", () => popup.print());
  return true;
}
