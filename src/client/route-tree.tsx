import { createRootRoute, createRoute, redirect, lazyRouteComponent } from "@tanstack/react-router";
import { AlertCircle } from "lucide-react";
import { Button } from "@/client/components/ui/button";
import { RootShell } from "@/client/components/root-shell";
import { StandaloneLayout } from "@/client/components/layouts/standalone-layout";
import { ShareLayout } from "@/client/components/layouts/share-layout";
import { WorkspaceLayout } from "@/client/components/workspace/layout";
import { useAuthStore, selectHasLocalSession, selectIsAuthenticated } from "@/client/stores/auth-store";

function RouteErrorFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center">
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
  component: RootShell,
  errorComponent: RouteErrorFallback,
});

// --- Bare route (no layout chrome) ---
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: lazyRouteComponent(() => import("@/client/components/index-gateway"), "IndexGateway"),
});

// --- Standalone layout routes ---
// Each standalone route uses StandaloneLayout as its component, with the
// actual page as a child index route. This preserves the URL structure
// without needing pathless id-based layout routes.

const loginWrapper = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  component: StandaloneLayout,
  validateSearch: (search: Record<string, unknown>) => ({
    redirect: typeof search.redirect === "string" ? search.redirect : undefined,
  }),
  beforeLoad: ({ search }) => {
    if (selectIsAuthenticated(useAuthStore.getState())) {
      throw redirect({ to: search.redirect || "/" });
    }
  },
});

const loginRoute = createRoute({
  getParentRoute: () => loginWrapper,
  path: "/",
  component: lazyRouteComponent(() => import("@/client/components/auth/login-page"), "LoginPage"),
});

const inviteWrapper = createRoute({
  getParentRoute: () => rootRoute,
  path: "/invite/$token",
  component: StandaloneLayout,
});

const inviteRoute = createRoute({
  getParentRoute: () => inviteWrapper,
  path: "/",
  component: lazyRouteComponent(() => import("@/client/components/auth/invite-page"), "InvitePage"),
});

const profileWrapper = createRoute({
  getParentRoute: () => rootRoute,
  path: "/profile",
  component: StandaloneLayout,
  beforeLoad: async () => {
    if (!selectIsAuthenticated(useAuthStore.getState())) {
      throw redirect({ to: "/login", search: { redirect: "/profile" } });
    }
  },
});

const profileRoute = createRoute({
  getParentRoute: () => profileWrapper,
  path: "/",
  component: lazyRouteComponent(() => import("@/client/components/profile-settings"), "ProfileSettings"),
});

const sharedWithMeWrapper = createRoute({
  getParentRoute: () => rootRoute,
  path: "/shared-with-me",
  component: StandaloneLayout,
  beforeLoad: async () => {
    if (!selectHasLocalSession(useAuthStore.getState())) {
      throw redirect({ to: "/login", search: { redirect: "/shared-with-me" } });
    }
  },
});

const sharedWithMeRoute = createRoute({
  getParentRoute: () => sharedWithMeWrapper,
  path: "/",
  component: lazyRouteComponent(() => import("@/client/components/shared-with-me-view"), "SharedWithMeView"),
});

const shareWrapper = createRoute({
  getParentRoute: () => rootRoute,
  path: "/s/$token",
  component: ShareLayout,
  validateSearch: (search: Record<string, unknown>) => ({
    page: typeof search.page === "string" ? search.page : undefined,
  }),
});

const shareRoute = createRoute({
  getParentRoute: () => shareWrapper,
  path: "/",
  component: lazyRouteComponent(() => import("@/client/routes/shared-page-route"), "SharedPageRoute"),
});

const workspaceRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/$workspaceSlug",
  component: WorkspaceLayout,
  beforeLoad: ({ location }) => {
    if (!selectHasLocalSession(useAuthStore.getState())) {
      throw redirect({ to: "/login", search: { redirect: location.pathname } });
    }
  },
});

const workspaceIndexRoute = createRoute({
  getParentRoute: () => workspaceRoute,
  path: "/",
  component: lazyRouteComponent(() => import("@/client/components/workspace/index"), "WorkspaceIndex"),
});

const settingsRoute = createRoute({
  getParentRoute: () => workspaceRoute,
  path: "/settings",
  component: lazyRouteComponent(() => import("@/client/components/workspace/settings"), "WorkspaceSettings"),
});

const pageRoute = createRoute({
  getParentRoute: () => workspaceRoute,
  path: "/$pageId",
  component: lazyRouteComponent(() => import("@/client/components/workspace/page-view"), "PageView"),
});

export const routeTree = rootRoute.addChildren([
  indexRoute,
  loginWrapper.addChildren([loginRoute]),
  inviteWrapper.addChildren([inviteRoute]),
  profileWrapper.addChildren([profileRoute]),
  sharedWithMeWrapper.addChildren([sharedWithMeRoute]),
  shareWrapper.addChildren([shareRoute]),
  workspaceRoute.addChildren([workspaceIndexRoute, settingsRoute, pageRoute]),
]);
