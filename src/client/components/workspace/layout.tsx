import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { Outlet, useLocation, useNavigate, useParams } from "@tanstack/react-router";
import { AlertCircle } from "lucide-react";
import { STORAGE_KEYS } from "@/client/lib/constants";
import { isWorkspaceReady } from "@/client/lib/workspace-route-model";
import { shouldBlockMemberOnlyRouteContent, shouldRedirectMemberOnlyRoute } from "@/client/lib/workspace-layout-model";
import { WorkspaceViewProvider } from "./view-provider";
import { useWorkspaceView } from "./use-workspace-view";
import { Header } from "@/client/components/header";
import { Footer } from "@/client/components/footer";
import { Banners } from "@/client/components/ui/banners";
import { Skeleton } from "@/client/components/ui/skeleton";
import { Button } from "@/client/components/ui/button";
import { useMobileDrawer } from "@/client/hooks/use-mobile-drawer";

const Sidebar = lazy(() => import("@/client/components/sidebar/sidebar").then((mod) => ({ default: mod.Sidebar })));

function SidebarFallback({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <div
      className={`hidden shrink-0 flex-col border-r border-zinc-800/60 bg-zinc-900 md:flex ${collapsed ? "w-12" : "w-[260px]"}`}
      aria-hidden="true"
    >
      {collapsed ? (
        <div className="flex flex-1 flex-col items-center gap-2 pt-2">
          <Skeleton className="h-8 w-8 rounded-md" />
          <Skeleton className="h-8 w-8 rounded-md" />
        </div>
      ) : (
        <>
          <div className="flex h-10 items-center border-b border-zinc-800/60 px-3">
            <Skeleton className="h-3.5 w-28" />
          </div>
          <div className="flex items-center gap-1 px-2 py-2">
            <Skeleton className="h-7 flex-1 rounded-md" />
            <Skeleton className="h-7 w-12 rounded-md" />
          </div>
          <div className="flex-1 space-y-1 px-1 py-1">
            <Skeleton className="h-7 w-full rounded-md" />
            <Skeleton className="ml-4 h-7 w-4/5 rounded-md" />
            <Skeleton className="ml-4 h-7 w-3/5 rounded-md" />
            <Skeleton className="h-7 w-full rounded-md" />
            <Skeleton className="h-7 w-4/5 rounded-md" />
          </div>
          <div className="space-y-1 border-t border-zinc-800/60 px-2 py-2">
            <Skeleton className="h-7 w-24 rounded-md" />
            <Skeleton className="h-7 w-20 rounded-md" />
          </div>
        </>
      )}
    </div>
  );
}

function TerminalRouteError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="text-center">
        <AlertCircle className="mx-auto mb-3 h-8 w-8 text-red-400" />
        <p className="mb-4 text-sm text-zinc-400">{message}</p>
        <div className="flex items-center justify-center gap-3">
          {onRetry && (
            <Button variant="secondary" size="sm" onClick={onRetry}>
              Try again
            </Button>
          )}
          <Button variant="secondary" size="sm" onClick={() => (window.location.href = "/")}>
            Go home
          </Button>
        </div>
      </div>
    </div>
  );
}

function WorkspaceLayoutInner() {
  const { route, canonicalSlug } = useWorkspaceView();
  const params = useParams({ strict: false }) as { workspaceSlug: string; pageId?: string };
  const location = useLocation();
  const navigate = useNavigate();
  const { open: mobileDrawerOpen, close: closeMobileDrawer, toggle: toggleMobileDrawer } = useMobileDrawer();
  const [expanded, setExpanded] = useState(() => localStorage.getItem(STORAGE_KEYS.LAYOUT) === "expanded");

  const [sidebarCollapsed] = useState(() => localStorage.getItem(STORAGE_KEYS.SIDEBAR) === "true");

  const toggleLayout = useCallback(() => {
    setExpanded((prev) => {
      const next = !prev;
      localStorage.setItem(STORAGE_KEYS.LAYOUT, next ? "expanded" : "default");
      return next;
    });
  }, []);

  // Canonical slug redirect — preserves search and hash state.
  useEffect(() => {
    if (!canonicalSlug) return;
    const segments = location.pathname.split("/");
    if (segments[1] === canonicalSlug) return;
    segments[1] = canonicalSlug;
    const corrected = segments.join("/") + location.searchStr + (location.hash ? `#${location.hash}` : "");
    navigate({ to: corrected, replace: true });
  }, [canonicalSlug, location.pathname, location.searchStr, location.hash, navigate]);

  // Member-access gating: routes without a pageId param (workspace index,
  // settings) require confirmed member access.
  const isMemberOnlyRoute = !params.pageId;
  const memberOnlyRouteBlocked = shouldBlockMemberOnlyRouteContent(route, isMemberOnlyRoute);
  useEffect(() => {
    if (shouldRedirectMemberOnlyRoute(route, isMemberOnlyRoute)) {
      navigate({ to: "/", replace: true });
    }
  }, [route, isMemberOnlyRoute, navigate]);

  let mainContent: React.ReactNode = null;

  if (memberOnlyRouteBlocked) {
    mainContent = null;
  } else if (route.phase === "degraded") {
    if (!params.pageId) {
      mainContent = (
        <TerminalRouteError
          message="Unable to verify access to this workspace."
          onRetry={() => window.location.reload()}
        />
      );
    } else {
      // Page route on degraded workspace: render Outlet so the page-surface
      // can render from cache or surface its own unavailable state.
      mainContent = <Outlet />;
    }
  } else if (route.phase === "error") {
    mainContent = (
      <TerminalRouteError
        message={route.message}
        onRetry={route.errorKind === "network" ? () => window.location.reload() : undefined}
      />
    );
  } else {
    mainContent = <Outlet />;
  }

  const showFullSidebar = isWorkspaceReady(route);
  const showSkeleton = route.phase === "loading" || route.phase === "degraded";

  return (
    <>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[200] focus:rounded-lg focus:bg-zinc-800 focus:px-4 focus:py-2 focus:text-accent-400 focus:ring-2 focus:ring-accent-500/50"
      >
        Skip to content
      </a>
      <Header
        expanded={expanded}
        onToggleLayout={toggleLayout}
        onToggleMobileSidebar={showFullSidebar ? toggleMobileDrawer : undefined}
      />
      <Banners />
      <div
        className={`flex flex-1 overflow-hidden ${expanded ? "" : "mx-auto w-full max-w-7xl border-l border-zinc-800/60"}`}
      >
        {showFullSidebar ? (
          <Suspense fallback={<SidebarFallback collapsed={sidebarCollapsed} />}>
            <Sidebar mobileOpen={mobileDrawerOpen} onMobileClose={closeMobileDrawer} />
          </Suspense>
        ) : showSkeleton ? (
          <SidebarFallback collapsed={sidebarCollapsed} />
        ) : null}
        <main id="main-content" tabIndex={-1} className="flex-1 overflow-y-auto outline-none">
          {mainContent}
        </main>
      </div>
      <Footer expanded={expanded} />
    </>
  );
}

export function WorkspaceLayout() {
  const { workspaceSlug, pageId } = useParams({ strict: false }) as { workspaceSlug: string; pageId?: string };

  return (
    <div className="flex h-screen flex-col">
      <WorkspaceViewProvider key={workspaceSlug} workspaceSlug={workspaceSlug} pageId={pageId ?? null}>
        <WorkspaceLayoutInner />
      </WorkspaceViewProvider>
    </div>
  );
}
