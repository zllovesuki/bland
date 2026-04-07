import { useCallback, useEffect, useRef, useState } from "react";
import { Outlet, useLocation, useRouterState } from "@tanstack/react-router";
import { useAuthStore } from "@/client/stores/auth-store";
import { STORAGE_KEYS } from "@/client/lib/constants";
import { Header } from "./header";
import { Footer } from "./footer";
import { Sidebar } from "./sidebar/sidebar";
import { ConfirmContainer } from "./confirm";
import { ToastContainer } from "./toast";
import { useOnline } from "@/client/hooks/use-online";

export function AppShell() {
  const location = useLocation();
  const isShareView = location.pathname.startsWith("/s/");
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
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

  return (
    <div className="flex h-screen flex-col">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[200] focus:rounded-lg focus:bg-zinc-900 focus:px-4 focus:py-2 focus:text-accent-400 focus:ring-2 focus:ring-accent-500/50"
      >
        Skip to content
      </a>
      <Header expanded={expanded} onToggleLayout={toggleLayout} onToggleMobileSidebar={toggleMobileDrawer} />
      {!online && (
        <div className="animate-slide-up border-b border-amber-500/20 bg-amber-500/10 py-1.5 text-center text-xs text-amber-400">
          Offline — changes will sync when you reconnect
        </div>
      )}
      <div className={`flex flex-1 overflow-hidden ${expanded ? "" : "mx-auto w-full max-w-7xl"}`}>
        {isAuthenticated && <Sidebar mobileOpen={mobileDrawerOpen} onMobileClose={closeMobileDrawer} />}
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
