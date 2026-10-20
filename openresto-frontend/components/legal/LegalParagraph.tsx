import { ThemedText } from "@/components/themed-text";
import { useAppTheme } from "@/hooks/use-app-theme";
import { theme } from "@/theme/theme";
import { styles } from "./LegalParagraph.styles";

/**
 * Splits a paragraph into runs, the bracketed `[…]` fields being their own. A bracket is what the
 * operator still has to fill in; it is never edited or dropped here, only set apart.
 */
export function splitPlaceholders(text: string): { text: string; placeholder: boolean }[] {
  return text
    .split(/(\[[^\]]*\])/)
    .filter((part) => part.length > 0)
    .map((part) => ({ text: part, placeholder: part.startsWith("[") && part.endsWith("]") }));
}

/**
 * One paragraph of a legal text. The square-bracketed fields are drawn as they are, with a
 * tint behind them so an unfilled field cannot be read past as if it were wording.
 *
 * @see [LegalParagraph.test.tsx](../../tests/components/legal/LegalParagraph.test.tsx) — pins the
 * split and that the brackets stay in the text.
 */
export function LegalParagraph({ text }: { text: string }) {
  const { colors } = useAppTheme();

  return (
    <ThemedText style={styles.paragraph}>
      {splitPlaceholders(text).map((run, index) =>
        run.placeholder ? (
          <ThemedText
            key={index}
            testID="legal-placeholder"
            style={[
              styles.placeholder,
              { backgroundColor: `${theme.colors.warning}33`, color: colors.text },
            ]}
          >
            {run.text}
          </ThemedText>
        ) : (
          run.text
        )
      )}
    </ThemedText>
  );
}

export default LegalParagraph;
