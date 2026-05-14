import { useCallback, useEffect, useMemo, useState } from "react";
import { Outlet, useRouter } from "@tanstack/react-router";
import { ConfirmContainer } from "./confirm";
import { ToastContainer } from "./toast";
import { ShortcutHelp } from "./ui/shortcut-help";
import { MobileDrawerContext, type MobileDrawerState } from "../hooks/use-mobile-drawer";
import { useSessionRehydration } from "@/client/hooks/use-session-rehydration";

export function RootShell() {
  const router = useRouter();
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [shortcutHelpOpen, setShortcutHelpOpen] = useState(false);
  const [routeAnnouncement, setRouteAnnouncement] = useState("");

  useSessionRehydration();

  const toggleDrawer = useCallback(() => setMobileDrawerOpen((open) => !open), []);
  const closeDrawer = useCallback(() => {
    setMobileDrawerOpen(false);
  }, []);

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

  // Route change: close drawer immediately; focus and announce after route
  // resolution so the main content and document title are current.
  useEffect(() => {
    const unsubscribeBeforeNavigate = router.subscribe("onBeforeNavigate", (event) => {
      if (event.pathChanged) setMobileDrawerOpen(false);
    });
    const unsubscribeResolved = router.subscribe("onResolved", (event) => {
      if (!event.pathChanged) return;
      const main = document.getElementById("main-content");
      if (main) main.focus({ preventScroll: true });
      setRouteAnnouncement(document.title);
    });
    return () => {
      unsubscribeBeforeNavigate();
      unsubscribeResolved();
    };
  }, [router]);

  const drawerState = useMemo<MobileDrawerState>(
    () => ({ open: mobileDrawerOpen, toggle: toggleDrawer, close: closeDrawer }),
    [mobileDrawerOpen, toggleDrawer, closeDrawer],
  );

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
