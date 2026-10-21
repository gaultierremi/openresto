import { Redirect } from "expo-router";
import PageLoader from "@/components/common/PageLoader";
import { PlatformScreen } from "@/components/admin/platform/PlatformScreen";
import { useAuth, useCan } from "@/context/AuthContext";

export default function AdminPlatformRoute() {
  const { status } = useAuth();
  // The API refuses every platform call for a Manager, so the route is a dead end rather than a
  // disabled screen; the sidebar hides the entry too and this catches a typed-in URL. An
  // unresolved session has no role yet, so an Owner would be bounced on a cold load without the wait.
  const canManagePlatform = useCan("manage:platform");

  if (status === "loading") return <PageLoader />;
  if (!canManagePlatform) return <Redirect href="/admin/dashboard" />;

  return <PlatformScreen />;
}
