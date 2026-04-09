import { createRootRoute, createRoute, redirect, lazyRouteComponent } from "@tanstack/react-router";
import { AlertCircle } from "lucide-react";
import { Button } from "@/client/components/ui/button";
import { AppShell } from "@/client/components/app-shell";
import { bootstrapWorkspaceData } from "@/client/lib/workspace-data";
import { WorkspaceLayout } from "@/client/components/workspace-layout";
import { useAuthStore } from "@/client/stores/auth-store";
import { useWorkspaceStore } from "@/client/stores/workspace-store";
import { api } from "@/client/lib/api";

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
    try {
      const store = useWorkspaceStore.getState();
      const workspaces = await api.workspaces.list();
      store.setWorkspaces(workspaces);
      if (workspaces.length > 0) {
        const preferred = store.currentWorkspace;
        const target = preferred && workspaces.find((w) => w.id === preferred.id) ? preferred.slug : workspaces[0].slug;
        throw redirect({
          to: "/$workspaceSlug",
          params: { workspaceSlug: target },
        });
      }
    } catch (err) {
      if (err !== null && typeof err === "object" && "to" in (err as object)) {
        throw err;
      }
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

    const store = useWorkspaceStore.getState();

    // Always refresh workspaces to avoid stale membership cache
    let workspaces = store.workspaces;
    let gotRemoteResponse = false;
    try {
      workspaces = await api.workspaces.list();
      store.setWorkspaces(workspaces);
      gotRemoteResponse = true;
    } catch {
      // Fall back to cached list
    }

    // Resolve slug to workspace
    const workspace = workspaces.find((w) => w.slug === params.workspaceSlug);
    if (workspace) {
      store.setCurrentWorkspace(workspace);
      try {
        await bootstrapWorkspaceData(store, workspace.id, "member");
      } catch {
        // Component handles empty state
      }
    } else if (gotRemoteResponse && isAuthenticated) {
      // We got a real server response -- user isn't a member of this workspace
      store.clearWorkspaceContext();
    }
    // else: local-only / expired with no remote response -- keep cached state
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
    const store = useWorkspaceStore.getState();
    if (store.accessMode !== null) return; // already bootstrapped

    // Non-member: bootstrap via context API
    try {
      const ctx = await api.pages.context(params.pageId);
      store.setCurrentWorkspace(ctx.workspace);
      await bootstrapWorkspaceData(store, ctx.workspace.id, ctx.access_mode);
      // Redirect to canonical slug if stale
      if (ctx.workspace.slug !== params.workspaceSlug) {
        throw redirect({
          to: "/$workspaceSlug/$pageId",
          params: { workspaceSlug: ctx.workspace.slug, pageId: params.pageId },
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
