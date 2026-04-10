import { createRootRoute, createRoute, redirect, lazyRouteComponent } from "@tanstack/react-router";
import { AlertCircle } from "lucide-react";
import { Button } from "@/client/components/ui/button";
import { AppShell } from "@/client/components/app-shell";
import { loadWorkspaceRouteData, loadPageRouteData } from "@/client/lib/workspace-data";
import { WorkspaceLayout } from "@/client/components/workspace-layout";
import { useAuthStore } from "@/client/stores/auth-store";
import { useWorkspaceStore } from "@/client/stores/workspace-store";

function RouteErrorFallback() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="text-center">
        <AlertCircle className="mx-auto mb-3 h-8 w-8 text-red-400" />
        <p className="mb-3 text-sm text-zinc-400">Something went wrong.</p>
        <Button variant="secondary" size="sm" onClick={() => window.location.reload()}>
          Reload
        </Button>
      </div>
    </div>
  );
}

const rootRoute = createRootRoute({
  component: AppShell,
  errorComponent: RouteErrorFallback,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  beforeLoad: async () => {
    const { hasLocalSession } = useAuthStore.getState();
    if (!hasLocalSession) {
      throw redirect({ to: "/login", search: { redirect: undefined } });
    }
  },
  component: lazyRouteComponent(() => import("@/client/components/empty-workspace-view"), "EmptyWorkspaceView"),
});

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  validateSearch: (search: Record<string, unknown>) => ({
    redirect: typeof search.redirect === "string" ? search.redirect : undefined,
  }),
  beforeLoad: ({ search }) => {
    const { isAuthenticated } = useAuthStore.getState();
    // Only redirect away from login if fully authenticated (not local-only/expired)
    if (isAuthenticated) {
      throw redirect({ to: search.redirect || "/" });
    }
  },
  component: lazyRouteComponent(() => import("@/client/components/auth/login-page"), "LoginPage"),
});

const inviteRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/invite/$token",
  component: lazyRouteComponent(() => import("@/client/components/auth/invite-page"), "InvitePage"),
});

const profileRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/profile",
  beforeLoad: async () => {
    // Profile requires a live server session, not just cached data
    const { isAuthenticated } = useAuthStore.getState();
    if (!isAuthenticated) {
      throw redirect({ to: "/login", search: { redirect: "/profile" } });
    }
  },
  component: lazyRouteComponent(() => import("@/client/components/profile-settings"), "ProfileSettings"),
});

// Static /s prefix takes priority over dynamic /$workspaceSlug
const shareRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/s/$token",
  validateSearch: (search: Record<string, unknown>) => ({
    page: typeof search.page === "string" ? search.page : undefined,
  }),
  component: lazyRouteComponent(() => import("@/client/routes/shared-page-route"), "SharedPageRoute"),
});

const workspaceRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/$workspaceSlug",
  beforeLoad: async ({ params, location }) => {
    const { hasLocalSession, isAuthenticated } = useAuthStore.getState();
    if (!hasLocalSession) {
      throw redirect({ to: "/login", search: { redirect: location.pathname } });
    }

    await loadWorkspaceRouteData(useWorkspaceStore.getState(), params.workspaceSlug, isAuthenticated);
  },
  component: WorkspaceLayout,
});

const workspaceIndexRoute = createRoute({
  getParentRoute: () => workspaceRoute,
  path: "/",
  beforeLoad: () => {
    if (useWorkspaceStore.getState().accessMode !== "member") {
      throw redirect({ to: "/" });
    }
  },
  component: lazyRouteComponent(() => import("@/client/components/workspace-index"), "WorkspaceIndex"),
});

const settingsRoute = createRoute({
  getParentRoute: () => workspaceRoute,
  path: "/settings",
  beforeLoad: () => {
    if (useWorkspaceStore.getState().accessMode !== "member") {
      throw redirect({ to: "/" });
    }
  },
  component: lazyRouteComponent(() => import("@/client/components/workspace-settings"), "WorkspaceSettings"),
});

const pageRoute = createRoute({
  getParentRoute: () => workspaceRoute,
  path: "/$pageId",
  beforeLoad: async ({ params }) => {
    try {
      const result = await loadPageRouteData(useWorkspaceStore.getState(), params.workspaceSlug, params.pageId);
      if (result.canonicalWorkspaceSlug) {
        throw redirect({
          to: "/$workspaceSlug/$pageId",
          params: { workspaceSlug: result.canonicalWorkspaceSlug, pageId: params.pageId },
        });
      }
    } catch (err) {
      if (err && typeof err === "object" && "to" in (err as object)) throw err;
      throw redirect({ to: "/" });
    }
  },
  component: lazyRouteComponent(() => import("@/client/components/page-view"), "PageView"),
});

export const routeTree = rootRoute.addChildren([
  indexRoute,
  loginRoute,
  inviteRoute,
  profileRoute,
  shareRoute,
  workspaceRoute.addChildren([workspaceIndexRoute, settingsRoute, pageRoute]),
]);
