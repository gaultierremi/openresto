import i18n from "@/i18n";
import {
  invitationLocaleLabel,
  invitationStateLabel,
  statusLabel,
  stepLabel,
} from "@/components/admin/platform/labels";
import type { InvitationLocale, InvitationState, PlatformStatus } from "@/constants/platform";

const t = i18n.getFixedT("en");
const fr = i18n.getFixedT("fr");

describe("platform labels", () => {
  it("names every status, in the viewer's language", () => {
    expect(
      ["Draft", "Published", "Suspended"].map((s) => statusLabel(t, s as PlatformStatus))
    ).toEqual(["Draft", "Published", "Suspended"]);
    expect(
      ["Draft", "Published", "Suspended"].map((s) => statusLabel(fr, s as PlatformStatus))
    ).toEqual(["Brouillon", "Publié", "Suspendu"]);
  });

  it("names every invitation state, in French as the spec words it", () => {
    expect(
      ["Pending", "Expired", "Revoked", "Accepted"].map((s) =>
        invitationStateLabel(fr, s as InvitationState)
      )
    ).toEqual(["En attente", "Expirée", "Révoquée", "Acceptée"]);
  });

  it("prints a state it does not know as it came", () => {
    expect(invitationStateLabel(t, "Frozen" as InvitationState)).toBe("Frozen");
  });

  it("names the three invitation languages", () => {
    expect(
      (["fr", "nl", "en"] as InvitationLocale[]).map((l) => invitationLocaleLabel(t, l))
    ).toEqual(["Français", "Nederlands", "English"]);
  });

  it("names each setup step and prints an unknown one as its key", () => {
    expect(["info", "hours", "layout", "menu", "branding"].map((s) => stepLabel(fr, s))).toEqual([
      "Informations",
      "Horaires",
      "Salles et tables",
      "Carte",
      "Identité visuelle",
    ]);
    expect(stepLabel(t, "payments")).toBe("payments");
  });
});
