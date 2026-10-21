import { useLocalSearchParams } from "expo-router";
import { LegalDocumentScreen } from "@/components/legal/LegalDocumentScreen";

/** `/legal/terms`, `/legal/privacy`, `/legal/dpa`, `/legal/legal-notice`: the keys the API serves. */
export default function LegalDocumentRoute() {
  const { key } = useLocalSearchParams<{ key: string | string[] }>();
  const docKey = Array.isArray(key) ? (key[0] ?? "") : (key ?? "");

  return <LegalDocumentScreen docKey={docKey} />;
}
