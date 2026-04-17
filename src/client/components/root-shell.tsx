import { useCallback, useEffect, useRef, useState } from "react";
import { Outlet, useLocation, useRouterState } from "@tanstack/react-router";
import { ConfirmContainer } from "./confirm";
import { ToastContainer } from "./toast";
import { ShortcutHelp } from "./ui/shortcut-help";
import { MobileDrawerContext, type MobileDrawerState } from "../hooks/use-mobile-drawer";
import { useSessionRehydration } from "@/client/hooks/use-session-rehydration";

export function RootShell() {
  const location = useLocation();
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [shortcutHelpOpen, setShortcutHelpOpen] = useState(false);
  const [routeAnnouncement, setRouteAnnouncement] = useState("");
  const prevPathRef = useRef(location.pathname);
  const isResolving = useRouterState({ select: (s) => s.isLoading });

  useSessionRehydration();

  const toggleDrawer = useCallback(() => setMobileDrawerOpen((o) => !o), []);
  const closeDrawer = useCallback(() => setMobileDrawerOpen(false), []);

  // Shortcut help: `?` key toggles modal
  useEffect(() => {
    function handleShortcutHelp(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      const editable = (e.target as HTMLElement)?.isContentEditable;
      if (tag === "INPUT" || tag === "TEXTAREA" || editable) return;
      if (e.key === "?" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        setShortcutHelpOpen((o) => !o);
      }
    }
    document.addEventListener("keydown", handleShortcutHelp);
    return () => document.removeEventListener("keydown", handleShortcutHelp);
  }, []);

  // Route change: close drawer, focus main-content, announce route.
  // Preserves the sequencing from the original AppShell: drawer closes on
  // pathname change; focus and announcement wait for router loading to settle.
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

  const drawerState: MobileDrawerState = {
    open: mobileDrawerOpen,
    toggle: toggleDrawer,
    close: closeDrawer,
  };

  return (
    <MobileDrawerContext.Provider value={drawerState}>
      <Outlet />
      <ToastContainer />
      <ConfirmContainer />
      <ShortcutHelp open={shortcutHelpOpen} onClose={() => setShortcutHelpOpen(false)} />
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {routeAnnouncement}
      </div>
    </MobileDrawerContext.Provider>
  );
}
