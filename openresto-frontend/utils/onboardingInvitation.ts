import { MIN_PASSWORD_LENGTH } from "@/constants/onboarding";
import type { LegalDocumentRef } from "@/api/onboarding";

export type PasswordProblem = "tooShort" | "mismatch";

/** The first reason a password and its confirmation cannot be sent, or null. */
export function passwordProblem(password: string, confirmation: string): PasswordProblem | null {
  if (password.length < MIN_PASSWORD_LENGTH) return "tooShort";
  return password === confirmation ? null : "mismatch";
}

/**
 * The account can be created only with a password that passes and every document ticked: one
 * checkbox each, because accepting three documents with one tick is not three acceptances.
 *
 * @see [onboardingInvitation.test.ts](../tests/utils/onboardingInvitation.test.ts) — pins the
 * password at nine and ten characters, a mismatch, and each document being required.
 */
export function canAcceptInvitation(
  password: string,
  confirmation: string,
  documents: LegalDocumentRef[],
  accepted: Record<string, boolean>
): boolean {
  return (
    passwordProblem(password, confirmation) === null &&
    documents.every((document) => accepted[document.key] === true)
  );
}
