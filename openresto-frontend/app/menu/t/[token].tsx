import { useLocalSearchParams } from "expo-router";
import { PublicMenuScreen } from "@/components/menu/PublicMenuScreen";

/** A table's QR code: the same menu, with the table's name shown on it. */
export default function TableMenuRoute() {
  const { token } = useLocalSearchParams<{ token: string }>();
  return <PublicMenuScreen kind="t" token={token} />;
}
