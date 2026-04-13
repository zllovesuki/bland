import { createRootRoute, createRoute, redirect, lazyRouteComponent } from "@tanstack/react-router";
import { AlertCircle } from "lucide-react";
import { Button } from "@/client/components/ui/button";
import { AppShell } from "@/client/components/app-shell";
import { resolveWorkspaceRoute, resolvePageRoute, applyResolvedRoute } from "@/client/lib/workspace-data";
import { WorkspaceLayout } from "@/client/components/workspace-layout";
import { useAuthStore } from "@/client/stores/auth-store";
import { useWorkspaceStore, selectActiveSnapshot } from "@/client/stores/workspace-store";

export type ChromeMode = "workspace" | "standalone" | "share";

declare module "@tanstack/react-router" {
  interface StaticDataRouteOption {
    chrome: ChromeMode;
    nav: "shared-inbox" | null;
  }
}

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
  staticData: { chrome: "standalone", nav: null },
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  staticData: { chrome: "share", nav: null },
  component: lazyRouteComponent(() => import("@/client/components/index-gateway"), "IndexGateway"),
});

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  staticData: { chrome: "standalone", nav: null },
  validateSearch: (search: Record<string, unknown>) => ({
    redirect: typeof search.redirect === "string" ? search.redirect : undefined,
  }),
  beforeLoad: ({ search }) => {
    const { isAuthenticated } = useAuthStore.getState();
    if (isAuthenticated) {
      throw redirect({ to: search.redirect || "/" });
    }
  },
  component: lazyRouteComponent(() => import("@/client/components/auth/login-page"), "LoginPage"),
});

const inviteRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/invite/$token",
  staticData: { chrome: "standalone", nav: null },
  component: lazyRouteComponent(() => import("@/client/components/auth/invite-page"), "InvitePage"),
});

const profileRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/profile",
  staticData: { chrome: "standalone", nav: null },
  beforeLoad: async () => {
    const { isAuthenticated } = useAuthStore.getState();
    if (!isAuthenticated) {
      throw redirect({ to: "/login", search: { redirect: "/profile" } });
    }
  },
  component: lazyRouteComponent(() => import("@/client/components/profile-settings"), "ProfileSettings"),
});

const sharedWithMeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/shared-with-me",
  staticData: { chrome: "standalone", nav: "shared-inbox" },
  beforeLoad: async () => {
    const { hasLocalSession } = useAuthStore.getState();
    if (!hasLocalSession) {
      throw redirect({ to: "/login", search: { redirect: "/shared-with-me" } });
    }
  },
  component: lazyRouteComponent(() => import("@/client/components/shared-with-me-view"), "SharedWithMeView"),
});

const shareRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/s/$token",
  staticData: { chrome: "share", nav: null },
  validateSearch: (search: Record<string, unknown>) => ({
    page: typeof search.page === "string" ? search.page : undefined,
  }),
  component: lazyRouteComponent(() => import("@/client/routes/shared-page-route"), "SharedPageRoute"),
});

const workspaceRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/$workspaceSlug",
  staticData: { chrome: "workspace", nav: null },
  beforeLoad: async ({ params, location }) => {
    const { hasLocalSession, isAuthenticated } = useAuthStore.getState();
    if (!hasLocalSession) {
      throw redirect({ to: "/login", search: { redirect: location.pathname } });
    }

    const store = useWorkspaceStore.getState();
    const result = await resolveWorkspaceRoute(params.workspaceSlug, isAuthenticated, store);
    applyResolvedRoute(store, result);
    // Do NOT redirect on unavailable here -- child page routes may still
    // resolve via api.pages.context for shared-access workspaces.
    // Only the workspace index and settings routes redirect on non-member access.
  },
  component: WorkspaceLayout,
});

const workspaceIndexRoute = createRoute({
  getParentRoute: () => workspaceRoute,
  path: "/",
  staticData: { chrome: "workspace", nav: null },
  beforeLoad: ({ params }) => {
    // Workspace index requires confirmed member access for the correct workspace.
    const store = useWorkspaceStore.getState();
    const snap = selectActiveSnapshot(store);
    if (!snap || snap.workspace.slug !== params.workspaceSlug || snap.accessMode !== "member") {
      throw redirect({ to: "/" });
    }
  },
  component: lazyRouteComponent(() => import("@/client/components/workspace-index"), "WorkspaceIndex"),
});

const settingsRoute = createRoute({
  getParentRoute: () => workspaceRoute,
  path: "/settings",
  staticData: { chrome: "workspace", nav: null },
  beforeLoad: ({ params }) => {
    const store = useWorkspaceStore.getState();
    const snap = selectActiveSnapshot(store);
    if (!snap || snap.workspace.slug !== params.workspaceSlug || snap.accessMode !== "member") {
      throw redirect({ to: "/" });
    }
  },
  component: lazyRouteComponent(() => import("@/client/components/workspace-settings"), "WorkspaceSettings"),
});

const pageRoute = createRoute({
  getParentRoute: () => workspaceRoute,
  path: "/$pageId",
  staticData: { chrome: "workspace", nav: null },
  beforeLoad: async ({ params }) => {
    const store = useWorkspaceStore.getState();
    const result = await resolvePageRoute(params.workspaceSlug, params.pageId, store);
    applyResolvedRoute(store, result);

    if (result.kind === "resolved" && result.data.canonicalSlug) {
      throw redirect({
        to: "/$workspaceSlug/$pageId",
        params: { workspaceSlug: result.data.canonicalSlug, pageId: params.pageId },
      });
    }
    if (result.kind === "not_found" || result.kind === "unavailable") {
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
  sharedWithMeRoute,
  shareRoute,
  workspaceRoute.addChildren([workspaceIndexRoute, settingsRoute, pageRoute]),
]);
