import { useCallback, useState } from "react";
import { Outlet } from "@tanstack/react-router";
import { useAuthStore } from "@/client/stores/auth-store";
import { STORAGE_KEYS } from "@/client/lib/constants";
import { Header } from "./header";
import { Footer } from "./footer";
import { Sidebar } from "./sidebar/sidebar";

export function AppShell() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [expanded, setExpanded] = useState(() => localStorage.getItem(STORAGE_KEYS.LAYOUT) === "expanded");

  const toggleLayout = useCallback(() => {
    setExpanded((prev) => {
      const next = !prev;
      localStorage.setItem(STORAGE_KEYS.LAYOUT, next ? "expanded" : "default");
      return next;
    });
  }, []);

  return (
    <div className="flex h-screen flex-col">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[200] focus:rounded-lg focus:bg-zinc-900 focus:px-4 focus:py-2 focus:text-accent-400 focus:ring-2 focus:ring-accent-500/50"
      >
        Skip to content
      </a>
      <Header expanded={expanded} onToggleLayout={toggleLayout} />
      <div className={`flex flex-1 overflow-hidden ${expanded ? "" : "mx-auto w-full max-w-7xl"}`}>
        {isAuthenticated && <Sidebar />}
        <main id="main-content" className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
      <Footer expanded={expanded} />
    </div>
  );
}
