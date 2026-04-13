import { useAuthStore } from "@/client/stores/auth-store";
import { LandingPage } from "./landing-page";
import { EmptyWorkspaceView } from "./empty-workspace-view";

export function IndexGateway() {
  const hasLocalSession = useAuthStore((s) => s.hasLocalSession);
  if (!hasLocalSession) return <LandingPage />;
  return <EmptyWorkspaceView />;
}
