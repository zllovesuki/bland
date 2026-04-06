import { createRootRoute, createRoute, redirect } from "@tanstack/react-router";
import { AppShell } from "@/client/components/app-shell";
import { LoginPage } from "@/client/components/auth/login-page";
import { InvitePage } from "@/client/components/auth/invite-page";
import { EmptyWorkspaceView } from "@/client/components/empty-workspace-view";
import { WorkspaceLayout } from "@/client/components/workspace-layout";
import { WorkspaceIndex } from "@/client/components/workspace-index";
import { PageView } from "@/client/components/page-view";
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
      throw redirect({ to: "/login" });
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
  component: LoginPage,
});

const inviteRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/invite/$token",
  component: InvitePage,
});

const workspaceRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/$workspaceSlug",
  beforeLoad: async ({ params }) => {
    const { isAuthenticated } = useAuthStore.getState();
    if (!isAuthenticated) {
      throw redirect({ to: "/login" });
    }

    // Load workspaces if not cached
    let { workspaces } = useWorkspaceStore.getState();
    if (workspaces.length === 0) {
      workspaces = await api.workspaces.list();
      useWorkspaceStore.getState().setWorkspaces(workspaces);
    }

    // Resolve slug to workspace
    const workspace = workspaces.find((w) => w.slug === params.workspaceSlug);
    if (!workspace) {
      throw redirect({ to: "/" });
    }

    useWorkspaceStore.getState().setCurrentWorkspace(workspace);

    try {
      const [pages, members] = await Promise.all([api.pages.list(workspace.id), api.workspaces.members(workspace.id)]);
      useWorkspaceStore.getState().setPages(pages);
      useWorkspaceStore.getState().setMembers(members);
    } catch {
      // Component handles empty state
    }
  },
  component: WorkspaceLayout,
});

const workspaceIndexRoute = createRoute({
  getParentRoute: () => workspaceRoute,
  path: "/",
  component: WorkspaceIndex,
});

const pageRoute = createRoute({
  getParentRoute: () => workspaceRoute,
  path: "/$pageId",
  component: PageView,
});

export const routeTree = rootRoute.addChildren([
  indexRoute,
  loginRoute,
  inviteRoute,
  workspaceRoute.addChildren([workspaceIndexRoute, pageRoute]),
]);
