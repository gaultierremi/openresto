import type { TFunction } from "i18next";
import type { InvitationLocale, InvitationState, PlatformStatus } from "@/constants/platform";

/** The display text of a restaurant's status. Never the colour alone: the badge always prints this. */
export function statusLabel(t: TFunction, status: PlatformStatus): string {
  switch (status) {
    case "Draft":
      return t("admin.platform.status.draft");
    case "Published":
      return t("admin.platform.status.published");
    case "Suspended":
      return t("admin.platform.status.suspended");
    default:
      // A status this build does not know is printed as the server sent it, not hidden.
      return status;
  }
}

export function invitationStateLabel(t: TFunction, state: InvitationState): string {
  switch (state) {
    case "Pending":
      return t("admin.platform.invitationState.pending");
    case "Expired":
      return t("admin.platform.invitationState.expired");
    case "Revoked":
      return t("admin.platform.invitationState.revoked");
    case "Accepted":
      return t("admin.platform.invitationState.accepted");
    default:
      return state;
  }
}

export function invitationLocaleLabel(t: TFunction, locale: InvitationLocale): string {
  switch (locale) {
    case "fr":
      return t("admin.platform.locales.fr");
    case "nl":
      return t("admin.platform.locales.nl");
    default:
      return t("admin.platform.locales.en");
  }
}

/** A setup step's name; a step this build does not know is printed as its key. */
export function stepLabel(t: TFunction, step: string): string {
  switch (step) {
    case "info":
      return t("admin.platform.steps.info");
    case "hours":
      return t("admin.platform.steps.hours");
    case "layout":
      return t("admin.platform.steps.layout");
    case "menu":
      return t("admin.platform.steps.menu");
    case "branding":
      return t("admin.platform.steps.branding");
    default:
      return step;
  }
}
