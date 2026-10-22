import { useState } from "react";
import { Pressable, View } from "react-native";
import { useTranslation } from "react-i18next";
import { ThemedText } from "@/components/themed-text";
import Button from "@/components/common/Button";
import { ButtonRow } from "@/components/common/ButtonRow";
import { Icon } from "@/components/common/Icon";
import { IconButton } from "@/components/common/IconButton";
import Input from "@/components/common/Input";
import { RowTextButton } from "@/components/common/RowTextButton";
import { Banner, Field } from "@/components/onboarding/formParts";
import { StepShell } from "@/components/onboarding/StepShell";
import { saveMenu, skipStep } from "@/api/onboarding";
import { useOnboardingCall } from "@/hooks/use-onboarding-call";
import { useAppTheme } from "@/hooks/use-app-theme";
import {
  MAX_CATEGORY_NAME_LENGTH,
  MAX_DISH_DESCRIPTION_LENGTH,
  MAX_DISH_NAME_LENGTH,
  MAX_MENU_NAME_LENGTH,
} from "@/constants/onboarding";
import {
  addCategory,
  addDish,
  draftFromMenu,
  menuFromDraft,
  moveCategory,
  moveDish,
  patchDish,
  removeCategory,
  removeDish,
  renameCategory,
  toggleDishAllergen,
  toggleDishDiet,
  type DraftMenu,
  type MenuProblem,
} from "@/utils/onboardingMenu";
import { stepOf } from "@/utils/onboardingStages";
import { ALLERGENS, DIETARY_TAGS } from "@/constants/menu";
import { FilterChip } from "@/components/menu/MenuFilters";
import type { StepProps } from "@/types/onboarding";
import { styles } from "./MenuStep.styles";

const toggled = (keys: ReadonlySet<string>, key: string): ReadonlySet<string> => {
  const next = new Set(keys);
  if (!next.delete(key)) next.add(key);
  return next;
};

/**
 * Step 4: the first menu, as categories of dishes in the order they are entered. A price is
 * typed in euros (`12,50` or `12.5`) and an empty one means "price on request"; a price that is
 * not an amount is refused beside its dish with nothing sent. The import card holds the place
 * of the later photo or PDF import: it is bound to the server's `menuImport` capability and
 * stays off while that is false. The step is optional, so it can also be skipped.
 *
 * @see [MenuStep.test.tsx](../../../tests/components/onboarding/steps/MenuStep.test.tsx) — pins
 * the cents sent for a typed price, a garbage or negative price being refused with nothing
 * sent, the order of entry, the disabled import card, and skip.
 */
export function MenuStep({
  restaurantId,
  state,
  readOnly,
  onState,
  onAdvance,
  onBack,
  onExpired,
}: StepProps) {
  const { t } = useTranslation();
  const { colors, primaryColor } = useAppTheme();
  const [draft, setDraft] = useState<DraftMenu>(() => draftFromMenu(state.menu));
  const [problem, setProblem] = useState<MenuProblem | null>(null);
  const [openDeclarations, setOpenDeclarations] = useState<ReadonlySet<string>>(new Set());
  const { busy, error, run, clear } = useOnboardingCall(onExpired);

  const importAvailable = state.capabilities.menuImport;
  const canSkip = stepOf(state, "menu")?.canSkip === true;

  const change = (next: DraftMenu) => {
    setDraft(next);
    setProblem(null);
  };

  const submit = async () => {
    const request = menuFromDraft(draft);
    if (!request.ok) {
      clear();
      setProblem(request.problem);
      return;
    }
    setProblem(null);
    const saved = await run(() => saveMenu(restaurantId, request.menu));
    if (saved) {
      onState(saved);
      onAdvance();
    }
  };

  const skip = async () => {
    const saved = await run(() => skipStep(restaurantId, "menu"));
    if (saved) {
      onState(saved);
      onAdvance();
    }
  };

  return (
    <StepShell
      testID="step-menu"
      title={t("admin.onboarding.menu.title")}
      description={t("admin.onboarding.menu.description")}
      readOnly={readOnly}
      busy={busy}
      primaryDisabled={draft.categories.length === 0}
      onPrimary={submit}
      onNext={onAdvance}
      onBack={onBack}
      onSkip={canSkip ? skip : undefined}
    >
      {error ? <Banner testID="step-menu-banner">{error.message}</Banner> : null}

      <Pressable
        disabled={!importAvailable}
        accessibilityRole="button"
        accessibilityLabel={t("admin.onboarding.menu.importTitle")}
        accessibilityState={{ disabled: !importAvailable }}
        style={[
          styles.importCard,
          { borderColor: colors.border, opacity: importAvailable ? 1 : 0.6 },
        ]}
        testID="menu-import"
      >
        <Icon
          name="camera-outline"
          size="xxl"
          color={importAvailable ? primaryColor : colors.muted}
        />
        <View style={styles.importText}>
          <ThemedText style={styles.importTitle}>
            {t("admin.onboarding.menu.importTitle")}
          </ThemedText>
          <ThemedText style={[styles.importHint, { color: colors.muted }]}>
            {t("admin.onboarding.menu.importHint")}
          </ThemedText>
        </View>
        {!importAvailable ? (
          <ThemedText style={[styles.soon, { color: colors.muted }]} testID="menu-import-soon">
            {t("admin.onboarding.menu.importSoon")}
          </ThemedText>
        ) : null}
      </Pressable>

      <Field label={t("admin.onboarding.menu.nameLabel")} testID="menu-name-field">
        <Input
          value={draft.name}
          onChangeText={(name) => change({ ...draft, name })}
          editable={!readOnly}
          maxLength={MAX_MENU_NAME_LENGTH}
          accessibilityLabel={t("admin.onboarding.menu.nameLabel")}
          testID="menu-name"
        />
      </Field>

      <View style={styles.categories}>
        {draft.categories.map((category, categoryIndex) => (
          <View
            key={category.key}
            style={[styles.category, { borderColor: colors.border }]}
            testID={`category-${categoryIndex}`}
          >
            <View style={styles.categoryHeader}>
              <Field
                label={t("admin.onboarding.menu.categoryNameLabel")}
                error={
                  problem?.kind === "categoryName" && problem.key === category.key
                    ? t("errors.onboarding.menu_invalid")
                    : null
                }
                style={styles.categoryName}
                testID={`category-${categoryIndex}-name-field`}
              >
                <Input
                  value={category.name}
                  onChangeText={(name) => change(renameCategory(draft, category.key, name))}
                  editable={!readOnly}
                  maxLength={MAX_CATEGORY_NAME_LENGTH}
                  placeholder={t("admin.onboarding.menu.categoryNamePlaceholder")}
                  accessibilityLabel={t("admin.onboarding.menu.categoryNameLabel")}
                  testID={`category-${categoryIndex}-name`}
                />
              </Field>
              <View style={styles.controls}>
                <IconButton
                  name="arrow-up"
                  color={colors.muted}
                  disabled={categoryIndex === 0}
                  accessibilityLabel={t("admin.onboarding.menu.moveCategoryUp")}
                  onPress={() => change(moveCategory(draft, category.key, -1))}
                  testID={`category-${categoryIndex}-up`}
                />
                <IconButton
                  name="arrow-down"
                  color={colors.muted}
                  disabled={categoryIndex === draft.categories.length - 1}
                  accessibilityLabel={t("admin.onboarding.menu.moveCategoryDown")}
                  onPress={() => change(moveCategory(draft, category.key, 1))}
                  testID={`category-${categoryIndex}-down`}
                />
                <RowTextButton
                  label={t("admin.onboarding.menu.removeCategory")}
                  color={colors.error}
                  icon="trash-outline"
                  onPress={() => change(removeCategory(draft, category.key))}
                  testID={`category-${categoryIndex}-remove`}
                />
              </View>
            </View>

            <View style={styles.dishes}>
              {category.dishes.map((dish, dishIndex) => {
                const at = `category-${categoryIndex}-dish-${dishIndex}`;
                const dishProblem = problem?.key === dish.key ? problem.kind : null;
                const declared = dish.allergens.length + dish.dietaryTags.length;
                const declarationsOpen = openDeclarations.has(dish.key);
                return (
                  <View
                    key={dish.key}
                    style={[styles.dish, { borderTopColor: colors.border }]}
                    testID={at}
                  >
                    <View style={styles.dishTop}>
                      <Field
                        label={t("admin.onboarding.menu.dishNameLabel")}
                        error={
                          dishProblem === "dishName" ? t("errors.onboarding.menu_invalid") : null
                        }
                        style={styles.dishName}
                        testID={`${at}-name-field`}
                      >
                        <Input
                          value={dish.name}
                          onChangeText={(name) =>
                            change(patchDish(draft, category.key, dish.key, { name }))
                          }
                          editable={!readOnly}
                          maxLength={MAX_DISH_NAME_LENGTH}
                          accessibilityLabel={t("admin.onboarding.menu.dishNameLabel")}
                          testID={`${at}-name`}
                        />
                      </Field>
                      <Field
                        label={t("admin.onboarding.menu.priceLabel")}
                        error={
                          dishProblem === "dishPrice"
                            ? t("admin.onboarding.menu.priceInvalid")
                            : null
                        }
                        style={styles.dishPrice}
                        testID={`${at}-price-field`}
                      >
                        <Input
                          value={dish.priceText}
                          onChangeText={(priceText) =>
                            change(patchDish(draft, category.key, dish.key, { priceText }))
                          }
                          editable={!readOnly}
                          keyboardType="decimal-pad"
                          placeholder={t("admin.onboarding.menu.pricePlaceholder")}
                          accessibilityLabel={t("admin.onboarding.menu.priceLabel")}
                          testID={`${at}-price`}
                        />
                      </Field>
                    </View>
                    <Input
                      value={dish.description}
                      onChangeText={(description) =>
                        change(patchDish(draft, category.key, dish.key, { description }))
                      }
                      editable={!readOnly}
                      maxLength={MAX_DISH_DESCRIPTION_LENGTH}
                      placeholder={t("admin.onboarding.menu.descriptionPlaceholder")}
                      accessibilityLabel={t("admin.onboarding.menu.descriptionLabel")}
                      testID={`${at}-description`}
                    />
                    <View style={styles.declarations}>
                      <RowTextButton
                        label={
                          declared > 0
                            ? t("admin.onboarding.menu.declarationsCount", { count: declared })
                            : t("admin.onboarding.menu.declarations")
                        }
                        color={primaryColor}
                        icon={declarationsOpen ? "chevron-up" : "chevron-down"}
                        selected={declarationsOpen}
                        onPress={() => setOpenDeclarations((open) => toggled(open, dish.key))}
                        testID={`${at}-declarations`}
                      />
                      {declarationsOpen ? (
                        <View style={styles.declarationsBody}>
                          <ThemedText style={[styles.hint, { color: colors.muted }]}>
                            {t("admin.menus.item.allergensHint")}
                          </ThemedText>
                          <ThemedText style={styles.label}>
                            {t("admin.menus.item.allergensLabel")}
                          </ThemedText>
                          <View style={styles.chips}>
                            {ALLERGENS.map((allergen) => (
                              <FilterChip
                                key={allergen}
                                testID={`${at}-allergen-${allergen}`}
                                label={t(`common.menu.allergens.${allergen}`)}
                                selected={dish.allergens.includes(allergen)}
                                onPress={() =>
                                  change(
                                    toggleDishAllergen(draft, category.key, dish.key, allergen)
                                  )
                                }
                              />
                            ))}
                          </View>
                          <ThemedText style={styles.label}>
                            {t("admin.menus.item.dietaryLabel")}
                          </ThemedText>
                          <View style={styles.chips}>
                            {DIETARY_TAGS.map((tag) => (
                              <FilterChip
                                key={tag}
                                testID={`${at}-diet-${tag}`}
                                label={t(`common.menu.dietary.${tag}`)}
                                selected={dish.dietaryTags.includes(tag)}
                                onPress={() =>
                                  change(toggleDishDiet(draft, category.key, dish.key, tag))
                                }
                              />
                            ))}
                          </View>
                        </View>
                      ) : null}
                    </View>
                    <View style={styles.controls}>
                      <IconButton
                        name="arrow-up"
                        color={colors.muted}
                        disabled={dishIndex === 0}
                        accessibilityLabel={t("admin.onboarding.menu.moveDishUp")}
                        onPress={() => change(moveDish(draft, category.key, dish.key, -1))}
                        testID={`${at}-up`}
                      />
                      <IconButton
                        name="arrow-down"
                        color={colors.muted}
                        disabled={dishIndex === category.dishes.length - 1}
                        accessibilityLabel={t("admin.onboarding.menu.moveDishDown")}
                        onPress={() => change(moveDish(draft, category.key, dish.key, 1))}
                        testID={`${at}-down`}
                      />
                      <RowTextButton
                        label={t("admin.onboarding.menu.removeDish")}
                        color={colors.error}
                        icon="trash-outline"
                        onPress={() => change(removeDish(draft, category.key, dish.key))}
                        testID={`${at}-remove`}
                      />
                    </View>
                  </View>
                );
              })}
            </View>

            <ButtonRow align="start">
              <Button
                variant="secondary"
                size="sm"
                icon="add"
                onPress={() => change(addDish(draft, category.key))}
                testID={`category-${categoryIndex}-add-dish`}
              >
                {t("admin.onboarding.menu.addDish")}
              </Button>
            </ButtonRow>
          </View>
        ))}
      </View>

      <ButtonRow align="start">
        <Button
          size="md"
          icon="add"
          onPress={() => change(addCategory(draft))}
          testID="menu-add-category"
        >
          {t("admin.onboarding.menu.addCategory")}
        </Button>
      </ButtonRow>
      <ThemedText style={[styles.note, { color: colors.muted }]}>
        {t("admin.onboarding.menu.note")}
      </ThemedText>
    </StepShell>
  );
}
