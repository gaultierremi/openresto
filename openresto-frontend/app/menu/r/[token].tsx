import { useLocalSearchParams } from "expo-router";
import { PublicMenuScreen } from "@/components/menu/PublicMenuScreen";

/** The restaurant's own QR code: the whole of its published menu. */
export default function RestaurantMenuRoute() {
  const { token } = useLocalSearchParams<{ token: string }>();
  return <PublicMenuScreen kind="r" token={token} />;
}
