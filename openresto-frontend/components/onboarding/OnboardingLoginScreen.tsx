import { useRef, useState } from "react";
import { TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import Button from "@/components/common/Button";
import Input from "@/components/common/Input";
import { OnboardingPage } from "@/components/onboarding/OnboardingPage";
import { login } from "@/api/auth";
import { useOnboardingSession } from "@/context/OnboardingSessionContext";
import { useAppTheme } from "@/hooks/use-app-theme";
import { isValidEmail } from "@/utils/validation";
import { styles } from "@/styles/onboarding/login.styles";

/**
 * Sign-in for a restaurateur. It uses the admin login endpoint, then asks the restaurateur's own
 * `/onboarding/me`, which is what says whether the account is one: an account that is not (an
 * admin who followed the wrong link) is told so and is not signed out of anything. A wrong
 * password gets the one generic message, never which half was wrong. There is no reset flow:
 * a forgotten password is a new invitation, and the screen says so.
 *
 * @see [OnboardingLoginScreen.test.tsx](../../tests/components/onboarding/OnboardingLoginScreen.test.tsx)
 * — pins the landing on a good sign-in, the generic message for a wrong password, the 403 case
 * staying on the screen without signing out, and the button waiting for a plausible address.
 */
export function OnboardingLoginScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { refresh } = useOnboardingSession();
  const { colors } = useAppTheme();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const passwordRef = useRef<TextInput>(null);

  const submit = async () => {
    setError(null);
    setLoading(true);
    const result = await login(email.trim(), password);
    if (!result) {
      setLoading(false);
      setError(t("admin.onboarding.login.invalidCredentials"));
      return;
    }
    const status = await refresh();
    setLoading(false);
    if (status === "authenticated") router.replace("/onboarding");
    else if (status === "forbidden") setError(t("admin.onboarding.login.notRestaurateur"));
    else setError(t("admin.onboarding.login.sessionFailed"));
  };

  const canSubmit = isValidEmail(email) && password.length > 0 && !loading;

  return (
    <OnboardingPage centered>
      <ThemedView
        style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
      >
        <View>
          <ThemedText style={styles.title} role="heading">
            {t("admin.onboarding.login.title")}
          </ThemedText>
          <ThemedText style={[styles.subtitle, { color: colors.muted }]}>
            {t("admin.onboarding.login.subtitle")}
          </ThemedText>
        </View>

        <View style={styles.fields}>
          <View style={styles.field}>
            <ThemedText style={styles.label}>{t("admin.onboarding.login.emailLabel")}</ThemedText>
            <Input
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              returnKeyType="next"
              onSubmitEditing={() => passwordRef.current?.focus()}
              blurOnSubmit={false}
              accessibilityLabel={t("admin.onboarding.login.emailLabel")}
              testID="onboarding-login-email"
            />
          </View>
          <View style={styles.field}>
            <ThemedText style={styles.label}>
              {t("admin.onboarding.login.passwordLabel")}
            </ThemedText>
            <Input
              ref={passwordRef}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="current-password"
              returnKeyType="go"
              onSubmitEditing={() => canSubmit && submit()}
              accessibilityLabel={t("admin.onboarding.login.passwordLabel")}
              testID="onboarding-login-password"
            />
          </View>

          {error ? (
            <View style={styles.error} role="alert" testID="onboarding-login-error">
              <ThemedText style={styles.errorText}>{error}</ThemedText>
            </View>
          ) : null}

          <Button
            fullWidth
            loading={loading}
            disabled={!canSubmit}
            onPress={submit}
            testID="onboarding-login-submit"
          >
            {t("admin.onboarding.login.submit")}
          </Button>
        </View>

        <ThemedText style={[styles.hint, { color: colors.muted }]} testID="onboarding-login-hint">
          {t("admin.onboarding.login.forgotHint")}
        </ThemedText>
      </ThemedView>
    </OnboardingPage>
  );
}
