import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { ThemedText } from "@/components/themed-text";
import { RowTextButton } from "@/components/common/RowTextButton";
import { useAppTheme } from "@/hooks/use-app-theme";
import { theme } from "@/theme/theme";
import { fmtDateTime } from "@/utils/formatters";
import type { PlatformRestaurant } from "@/api/platform";
import { PlatformStatusBadge } from "./PlatformStatusBadge";
import { invitationStateLabel, stepLabel } from "./labels";
import { styles } from "./PlatformRestaurantRow.styles";

/** The theme's arrived green is tuned for a light card; on a dark one the lighter step reads. */
const REACTIVATE_COLOR_DARK = "#4ade80";

export type PlatformRowAction = "invite" | "suspend" | "reactivate" | "consents" | "guestData";

/**
 * One restaurant of the platform list. It reads named fields of the row and nothing else, so a
 * guest's name or address cannot reach the screen through it even if the object it was handed
 * carried one: the list is counts and dates by contract, and the one door to a guest is the
 * guest-data modal behind a stated reason.
 *
 * @see [PlatformRestaurantRow.test.tsx](../../../tests/components/admin/platform/PlatformRestaurantRow.test.tsx)
 * — pins the owner-or-invitation line, the "never" sign-in, the setup progress, the action
 * offered for each status, and that no guest field is ever drawn.
 */
export function PlatformRestaurantRow({
  restaurant,
  onAction,
}: {
  restaurant: PlatformRestaurant;
  onAction: (action: PlatformRowAction, restaurant: PlatformRestaurant) => void;
}) {
  const { t } = useTranslation();
  const { colors, primaryColor, isDark } = useAppTheme();
  const muted = { color: colors.muted };
  const suspended = restaurant.status === "Suspended";
  const invited = restaurant.invitation !== null || restaurant.ownerEmail !== null;

  const owner = restaurant.ownerEmail ? (
    <ThemedText style={[styles.fact, muted]}>
      {t("admin.platform.row.account", { email: restaurant.ownerEmail })}
    </ThemedText>
  ) : restaurant.invitation ? (
    <>
      <ThemedText style={[styles.fact, muted]}>
        {t("admin.platform.row.invitation", {
          state: invitationStateLabel(t, restaurant.invitation.state),
          email: restaurant.invitation.email,
        })}
      </ThemedText>
      <ThemedText style={[styles.fact, muted]}>
        {t("admin.platform.row.invitationExpiry", {
          date: fmtDateTime(new Date(restaurant.invitation.expiresAt)),
        })}
      </ThemedText>
    </>
  ) : (
    <ThemedText style={[styles.fact, muted]}>{t("admin.platform.row.noInvitation")}</ThemedText>
  );

  return (
    <View
      testID={`platform-row-${restaurant.id}`}
      style={[styles.card, { borderColor: colors.border, backgroundColor: colors.card }]}
    >
      <View style={styles.header}>
        <ThemedText type="h3" style={styles.name}>
          {restaurant.name}
        </ThemedText>
        <PlatformStatusBadge status={restaurant.status} />
      </View>

      <View style={styles.facts}>
        {owner}
        <ThemedText style={[styles.fact, muted]}>
          {t("admin.platform.row.lastLogin", {
            when: restaurant.lastLoginAt
              ? fmtDateTime(new Date(restaurant.lastLoginAt))
              : t("admin.platform.row.never"),
          })}
        </ThemedText>
        <ThemedText style={[styles.fact, muted]}>
          {t("admin.platform.row.bookings", {
            total: restaurant.totalBookings,
            upcoming: restaurant.upcomingBookings,
          })}
        </ThemedText>
        <ThemedText style={[styles.fact, muted]}>
          {t("admin.platform.row.progress", {
            done: restaurant.stepsDone,
            total: restaurant.stepsTotal,
          })}
          {" · "}
          {restaurant.nextStep
            ? t("admin.platform.row.nextStep", { step: stepLabel(t, restaurant.nextStep) })
            : t("admin.platform.row.setupComplete")}
        </ThemedText>
        {suspended && restaurant.suspendedAt && (
          <ThemedText style={[styles.fact, muted]}>
            {t("admin.platform.row.suspendedSince", {
              date: fmtDateTime(new Date(restaurant.suspendedAt)),
            })}
          </ThemedText>
        )}
        {suspended && restaurant.suspensionReason && (
          <ThemedText style={[styles.fact, muted]}>
            {t("admin.platform.row.suspensionReason", { reason: restaurant.suspensionReason })}
          </ThemedText>
        )}
      </View>

      <View style={styles.actions}>
        <RowTextButton
          label={invited ? t("admin.platform.actions.resend") : t("admin.platform.actions.invite")}
          color={primaryColor}
          onPress={() => onAction("invite", restaurant)}
        />
        <RowTextButton
          label={t("admin.platform.actions.consents")}
          color={colors.muted}
          onPress={() => onAction("consents", restaurant)}
        />
        <RowTextButton
          label={t("admin.platform.actions.guestData")}
          color={colors.muted}
          onPress={() => onAction("guestData", restaurant)}
        />
        {suspended ? (
          <RowTextButton
            label={t("admin.platform.actions.reactivate")}
            color={isDark ? REACTIVATE_COLOR_DARK : theme.status.arrived.text}
            onPress={() => onAction("reactivate", restaurant)}
          />
        ) : (
          <RowTextButton
            label={t("admin.platform.actions.suspend")}
            color={theme.colors.error}
            onPress={() => onAction("suspend", restaurant)}
          />
        )}
      </View>
    </View>
  );
}

export default PlatformRestaurantRow;
