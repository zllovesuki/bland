import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { Outlet, useLocation, useRouterState, Link } from "@tanstack/react-router";
import { SESSION_MODES, STORAGE_KEYS } from "@/client/lib/constants";
import { useAuthStore } from "@/client/stores/auth-store";
import { useWorkspaceStore } from "@/client/stores/workspace-store";
import { Header } from "./header";
import { Footer } from "./footer";
import { ConfirmContainer } from "./confirm";
import { ToastContainer } from "./toast";
import { useOnline } from "@/client/hooks/use-online";
import { useSessionRehydration } from "@/client/hooks/use-session-rehydration";

const Sidebar = lazy(() => import("./sidebar/sidebar").then((mod) => ({ default: mod.Sidebar })));

function SidebarFallback() {
  return (
    <div className="hidden w-[260px] shrink-0 border-r border-zinc-800/60 bg-zinc-950/50 md:block" aria-hidden="true" />
  );
}

export function AppShell() {
  const location = useLocation();
  const isShareView = location.pathname.startsWith("/s/");
  const hasLocalSession = useAuthStore((s) => s.hasLocalSession);
  const sessionMode = useAuthStore((s) => s.sessionMode);
  const currentWorkspace = useWorkspaceStore((s) => s.currentWorkspace);
  const [expanded, setExpanded] = useState(() => localStorage.getItem(STORAGE_KEYS.LAYOUT) === "expanded");
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  const toggleLayout = useCallback(() => {
    setExpanded((prev) => {
      const next = !prev;
      localStorage.setItem(STORAGE_KEYS.LAYOUT, next ? "expanded" : "default");
      return next;
    });
  }, []);

  const toggleMobileDrawer = useCallback(() => setMobileDrawerOpen((o) => !o), []);
  const closeMobileDrawer = useCallback(() => setMobileDrawerOpen(false), []);

  const online = useOnline();
  useSessionRehydration();

  // Route change: close drawer, move focus, announce
  const prevPathRef = useRef(location.pathname);
  const [routeAnnouncement, setRouteAnnouncement] = useState("");
  const isResolving = useRouterState({ select: (s) => s.isLoading });
  useEffect(() => {
    if (location.pathname !== prevPathRef.current) {
      prevPathRef.current = location.pathname;
      setMobileDrawerOpen(false);
      if (!isResolving) {
        const main = document.getElementById("main-content");
        if (main) main.focus({ preventScroll: true });
        setRouteAnnouncement(document.title);
      }
    }
  }, [location.pathname, isResolving]);

  if (isShareView) return <Outlet />;

  const showSidebar = hasLocalSession && (location.pathname !== "/" || currentWorkspace !== null);

  return (
    <div className="flex h-screen flex-col">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[200] focus:rounded-lg focus:bg-zinc-900 focus:px-4 focus:py-2 focus:text-accent-400 focus:ring-2 focus:ring-accent-500/50"
      >
        Skip to content
      </a>
      <Header
        expanded={expanded}
        onToggleLayout={toggleLayout}
        onToggleMobileSidebar={showSidebar ? toggleMobileDrawer : undefined}
      />
      {!online && (
        <div className="animate-slide-up border-b border-amber-500/20 bg-amber-500/10 py-1.5 text-center text-xs text-amber-400">
          Offline — changes will sync when you reconnect
        </div>
      )}
      {sessionMode === SESSION_MODES.EXPIRED && (
        <div className="animate-slide-up border-b border-red-500/20 bg-red-500/10 py-1.5 text-center text-xs text-red-400">
          Session expired.{" "}
          <Link to="/login" search={{ redirect: location.pathname }} className="underline hover:text-red-300">
            Sign in
          </Link>{" "}
          to resume editing.
        </div>
      )}
      <div className={`flex flex-1 overflow-hidden ${expanded ? "" : "mx-auto w-full max-w-7xl"}`}>
        {showSidebar && (
          <Suspense fallback={<SidebarFallback />}>
            <Sidebar mobileOpen={mobileDrawerOpen} onMobileClose={closeMobileDrawer} />
          </Suspense>
        )}
        <main id="main-content" tabIndex={-1} className="flex-1 overflow-y-auto outline-none">
          <Outlet />
        </main>
      </div>
      <Footer expanded={expanded} />
      <ToastContainer />
      <ConfirmContainer />
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {routeAnnouncement}
      </div>
    </div>
  );
}
