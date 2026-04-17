import { useAuthStore, selectHasLocalSession } from "@/client/stores/auth-store";
import { LandingPage } from "./landing-page";
import { EmptyWorkspaceView } from "./empty-workspace-view";

export function IndexGateway() {
  const hasLocalSession = useAuthStore(selectHasLocalSession);
  if (!hasLocalSession) return <LandingPage />;
  return <EmptyWorkspaceView />;
}
