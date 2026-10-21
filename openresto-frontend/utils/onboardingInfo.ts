import { MAX_RETENTION_MONTHS, MIN_RETENTION_MONTHS } from "@/constants/onboarding";
import type { OnboardingInfo, SaveInfoInput } from "@/api/onboarding";
import { isValidEmail } from "@/utils/validation";

export type InfoField =
  | "name"
  | "address"
  | "phone"
  | "email"
  | "legalName"
  | "companyNumber"
  | "vatNumber"
  | "retention";

export interface InfoForm {
  name: string;
  address: string;
  phone: string;
  email: string;
  legalName: string;
  companyNumber: string;
  vatNumber: string;
  /** Typed, so a half-edited field is not coerced under the cursor. */
  retention: string;
}

export const infoFormFromState = (info: OnboardingInfo): InfoForm => ({
  name: info.name,
  address: info.address ?? "",
  phone: info.phoneNumber ?? "",
  email: info.emailAddress ?? "",
  legalName: info.legalName ?? "",
  companyNumber: info.companyNumber ?? "",
  vatNumber: info.vatNumber ?? "",
  retention: String(info.bookingRetentionMonths),
});

/** Whole months from 1 to 60, or null. */
export function parseRetention(text: string): number | null {
  if (!/^\d+$/.test(text.trim())) return null;
  const months = Number(text.trim());
  return months >= MIN_RETENTION_MONTHS && months <= MAX_RETENTION_MONTHS ? months : null;
}

export type InfoErrorKey =
  | "errors.onboarding.name_required"
  | "errors.onboarding.address_required"
  | "errors.onboarding.phone_required"
  | "errors.onboarding.email_required"
  | "errors.contact.email_invalid"
  | "errors.onboarding.legal_name_required"
  | "errors.onboarding.company_number_required"
  | "errors.onboarding.retention_invalid";

/**
 * The rules the server would refuse on sight, mirrored so the press says so without a round
 * trip. The shape of the enterprise and VAT numbers is left to the server: its control-digit
 * check is the only one that counts, and its message arrives beside the field.
 *
 * @see [onboardingInfo.test.ts](../tests/utils/onboardingInfo.test.ts) — pins each required
 * field and both ends of the 1 to 60 months range.
 */
export function infoErrors(form: InfoForm): Partial<Record<InfoField, InfoErrorKey>> {
  const errors: Partial<Record<InfoField, InfoErrorKey>> = {};
  if (form.name.trim() === "") errors.name = "errors.onboarding.name_required";
  if (form.address.trim() === "") errors.address = "errors.onboarding.address_required";
  if (form.phone.trim() === "") errors.phone = "errors.onboarding.phone_required";
  if (form.email.trim() === "") errors.email = "errors.onboarding.email_required";
  else if (!isValidEmail(form.email)) errors.email = "errors.contact.email_invalid";
  if (form.legalName.trim() === "") errors.legalName = "errors.onboarding.legal_name_required";
  if (form.companyNumber.trim() === "") {
    errors.companyNumber = "errors.onboarding.company_number_required";
  }
  if (parseRetention(form.retention) === null) {
    errors.retention = "errors.onboarding.retention_invalid";
  }
  return errors;
}

/** The field a server refusal is about, when its code names one. */
const FIELD_OF_CODE: Record<string, InfoField> = {
  "onboarding.name_required": "name",
  "onboarding.address_required": "address",
  "onboarding.phone_required": "phone",
  "onboarding.email_required": "email",
  "contact.email_invalid": "email",
  "onboarding.legal_name_required": "legalName",
  "onboarding.company_number_required": "companyNumber",
  "onboarding.company_number_invalid": "companyNumber",
  "onboarding.vat_invalid": "vatNumber",
  "onboarding.retention_invalid": "retention",
};

export const fieldOfCode = (code: string | undefined): InfoField | null =>
  (code && FIELD_OF_CODE[code]) || null;

/** Only call with a form `infoErrors` passed: the retention is a number by then. */
export function infoRequest(form: InfoForm): SaveInfoInput {
  return {
    name: form.name.trim(),
    address: form.address.trim(),
    phoneNumber: form.phone.trim(),
    emailAddress: form.email.trim(),
    legalName: form.legalName.trim(),
    companyNumber: form.companyNumber.trim(),
    vatNumber: form.vatNumber.trim() === "" ? null : form.vatNumber.trim(),
    bookingRetentionMonths: parseRetention(form.retention) as number,
  };
}
