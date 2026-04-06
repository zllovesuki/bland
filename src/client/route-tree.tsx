import { createRootRoute, createRoute, redirect } from "@tanstack/react-router";
import { AppShell } from "@/client/components/app-shell";
import { LoginPage } from "@/client/components/auth/login-page";
import { InvitePage } from "@/client/components/auth/invite-page";
import { EmptyWorkspaceView } from "@/client/components/empty-workspace-view";
import { WorkspaceLayout } from "@/client/components/workspace-layout";
import { WorkspaceIndex } from "@/client/components/workspace-index";
import { PageView } from "@/client/components/page-view";
import { SharedPageView } from "@/client/components/shared-page-view";
import { WorkspaceSettings } from "@/client/components/workspace-settings";
import { ProfileSettings } from "@/client/components/profile-settings";
import { useAuthStore } from "@/client/stores/auth-store";
import { useWorkspaceStore } from "@/client/stores/workspace-store";
import { api } from "@/client/lib/api";

const rootRoute = createRootRoute({
  component: AppShell,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  beforeLoad: async () => {
    const { isAuthenticated } = useAuthStore.getState();
    if (!isAuthenticated) {
      throw redirect({ to: "/login", search: { redirect: undefined } });
    }
    try {
      const workspaces = await api.workspaces.list();
      useWorkspaceStore.getState().setWorkspaces(workspaces);
      if (workspaces.length > 0) {
        throw redirect({
          to: "/$workspaceSlug",
          params: { workspaceSlug: workspaces[0].slug },
        });
      }
    } catch (err) {
      if (err !== null && typeof err === "object" && "to" in (err as object)) {
        throw err;
      }
    }
  },
  component: EmptyWorkspaceView,
});

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  validateSearch: (search: Record<string, unknown>) => ({
    redirect: typeof search.redirect === "string" ? search.redirect : undefined,
  }),
  component: LoginPage,
});

const inviteRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/invite/$token",
  component: InvitePage,
});

const profileRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/profile",
  beforeLoad: async () => {
    const { isAuthenticated } = useAuthStore.getState();
    if (!isAuthenticated) {
      throw redirect({ to: "/login", search: { redirect: undefined } });
    }
  },
  component: ProfileSettings,
});

// Static /s prefix takes priority over dynamic /$workspaceSlug
const shareRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/s/$token",
  validateSearch: (search: Record<string, unknown>) => ({
    page: typeof search.page === "string" ? search.page : undefined,
  }),
  component: () => {
    const params = shareRoute.useParams();
    const search = shareRoute.useSearch();
    return <SharedPageView token={params.token} activePage={search.page} />;
  },
});

const workspaceRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/$workspaceSlug",
  beforeLoad: async ({ params, location }) => {
    const { isAuthenticated } = useAuthStore.getState();
    if (!isAuthenticated) {
      throw redirect({ to: "/login", search: { redirect: location.pathname } });
    }

    const store = useWorkspaceStore.getState();

    // Always refresh workspaces to avoid stale membership cache
    let workspaces = store.workspaces;
    try {
      workspaces = await api.workspaces.list();
      store.setWorkspaces(workspaces);
    } catch {
      // Fall back to cached list
    }

    // Resolve slug to workspace
    const workspace = workspaces.find((w) => w.slug === params.workspaceSlug);
    if (workspace) {
      store.setCurrentWorkspace(workspace);
      store.setAccessMode("member");
      try {
        const [pages, members] = await Promise.all([
          api.pages.list(workspace.id),
          api.workspaces.members(workspace.id),
        ]);
        store.setPages(pages);
        store.setMembers(members);
      } catch {
        // Component handles empty state
      }
    } else {
      // Non-member: clear context, let pageRoute bootstrap via context API
      store.setCurrentWorkspace(null);
      store.setAccessMode(null);
      store.setPages([]);
      store.setMembers([]);
    }
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
  component: WorkspaceIndex,
});

const settingsRoute = createRoute({
  getParentRoute: () => workspaceRoute,
  path: "/settings",
  beforeLoad: () => {
    if (useWorkspaceStore.getState().accessMode !== "member") {
      throw redirect({ to: "/" });
    }
  },
  component: WorkspaceSettings,
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
      store.setAccessMode(ctx.access_mode);
      if (ctx.access_mode === "shared") {
        const pages = await api.pages.list(ctx.workspace.id);
        store.setPages(pages);
        store.setMembers([]);
      } else {
        const [pages, members] = await Promise.all([
          api.pages.list(ctx.workspace.id),
          api.workspaces.members(ctx.workspace.id),
        ]);
        store.setPages(pages);
        store.setMembers(members);
      }
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
  component: PageView,
});

export const routeTree = rootRoute.addChildren([
  indexRoute,
  loginRoute,
  inviteRoute,
  profileRoute,
  shareRoute,
  workspaceRoute.addChildren([workspaceIndexRoute, settingsRoute, pageRoute]),
]);
