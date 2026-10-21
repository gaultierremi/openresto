import type { TFunction } from "i18next";
import { fmtLongDate } from "@/utils/formatters";

/** A legal document's name, as the legal pages, the footer's neighbours and the consents list all print it. */
export function legalDocumentLabel(t: TFunction, key: string): string {
  switch (key) {
    case "terms":
      return t("common.legal.documents.terms");
    case "privacy":
      return t("common.legal.documents.privacy");
    case "dpa":
      return t("common.legal.documents.dpa");
    case "legal-notice":
      return t("common.legal.documents.legalNotice");
    default:
      return key;
  }
}

/** `UpdatedOn` is a plain `YYYY-MM-DD`; anything that does not parse as one is shown as it came. */
export function legalUpdatedOn(updatedOn: string): string {
  const parsed = new Date(`${updatedOn}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? updatedOn : fmtLongDate(parsed);
}
