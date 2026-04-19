import { useAuthStore, selectHasLocalSession } from "@/client/stores/auth-store";
import { LandingPage } from "./landing-page";
import { EmptyWorkspaceView } from "./empty-workspace-view";

export function IndexGateway() {
  const hasLocalSession = useAuthStore(selectHasLocalSession);
  const refreshState = useAuthStore((s) => s.refreshState);

  if (!hasLocalSession && refreshState === "refreshing") {
    return (
      <div className="flex min-h-screen items-center justify-center" aria-busy="true">
        <div className="animate-slide-up text-center">
          <div className="mx-auto mb-3 h-1.5 w-1.5 animate-pulse rounded-full bg-zinc-400" aria-hidden="true" />
          <p className="text-sm text-zinc-400">Restoring your session.</p>
        </div>
      </div>
    );
  }

  if (!hasLocalSession) return <LandingPage />;
  return <EmptyWorkspaceView />;
}
