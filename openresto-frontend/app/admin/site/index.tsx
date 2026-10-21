import { Redirect } from "expo-router";
import PageLoader from "@/components/common/PageLoader";
import { SiteScreen } from "@/components/admin/site/SiteScreen";
import { useAuth, useCan } from "@/context/AuthContext";

export default function AdminSiteRoute() {
  const { status } = useAuth();
  const canManageSite = useCan("manage:site");

  if (status === "loading") return <PageLoader />;
  if (!canManageSite) return <Redirect href="/admin/dashboard" />;

  return <SiteScreen />;
}
