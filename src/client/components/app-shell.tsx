import { useCallback, useState } from "react";
import { Outlet } from "@tanstack/react-router";
import { useAuthStore } from "@/client/stores/auth-store";
import { Header } from "./header";
import { Footer } from "./footer";
import { Sidebar } from "./sidebar/sidebar";

const LAYOUT_KEY = "bland.layout";

export function AppShell() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [expanded, setExpanded] = useState(() => localStorage.getItem(LAYOUT_KEY) === "expanded");

  const toggleLayout = useCallback(() => {
    setExpanded((prev) => {
      const next = !prev;
      localStorage.setItem(LAYOUT_KEY, next ? "expanded" : "default");
      return next;
    });
  }, []);

  return (
    <div className="flex h-screen flex-col">
      <Header expanded={expanded} onToggleLayout={toggleLayout} />
      <div className={`flex flex-1 overflow-hidden ${expanded ? "" : "mx-auto w-full max-w-7xl"}`}>
        {isAuthenticated && <Sidebar />}
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
      <Footer expanded={expanded} />
    </div>
  );
}
