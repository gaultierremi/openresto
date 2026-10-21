import type { ReactNode } from "react";
import { ScrollView, View } from "react-native";
import { ThemedView } from "@/components/themed-view";
import PageContainer from "@/components/layout/PageContainer";
import Footer from "@/components/layout/Footer";
import { LegalReviewBanner } from "./LegalReviewBanner";
import { styles } from "./LegalPageShell.styles";

/**
 * The frame of every legal page: the review warning pinned above the scroll when the text needs
 * one, then a reading-width column, then the guest footer. The column is capped well under the
 * site's content width because these are long documents, and a line of prose past about 75
 * characters stops being readable.
 *
 * @see [LegalPageShell.test.tsx](../../tests/components/legal/LegalPageShell.test.tsx) — pins
 * that the banner appears only when asked for.
 */
export function LegalPageShell({
  reviewPending,
  children,
}: {
  reviewPending: boolean;
  children: ReactNode;
}) {
  return (
    <ThemedView style={styles.root}>
      {reviewPending && <LegalReviewBanner />}
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.scroll}>
        <PageContainer>
          <View style={styles.column}>{children}</View>
        </PageContainer>
        <Footer />
      </ScrollView>
    </ThemedView>
  );
}

export default LegalPageShell;
