import { useCallback, useEffect, useState } from "react";
import { Outlet } from "@tanstack/react-router";
import { STORAGE_KEYS } from "@/client/lib/constants";
import { Header } from "@/client/components/header";
import { Footer } from "@/client/components/footer";
import { Banners } from "@/client/components/ui/banners";
import { readStorageString, writeStorageString } from "@/client/lib/storage";
import { selectHasLocalSession, useAuthStore } from "@/client/stores/auth-store";

const NARROW_SHELL_CONTENT_CLASS = "mx-auto w-full max-w-7xl";
const NARROW_SHELL_ROW_CLASS = `${NARROW_SHELL_CONTENT_CLASS} border-l border-zinc-800/60`;

export function StandaloneLayout() {
  const hasLocalSession = useAuthStore(selectHasLocalSession);
  const [expanded, setExpanded] = useState(
    () => hasLocalSession && readStorageString(STORAGE_KEYS.LAYOUT) === "expanded",
  );

  useEffect(() => {
    setExpanded(hasLocalSession && readStorageString(STORAGE_KEYS.LAYOUT) === "expanded");
  }, [hasLocalSession]);

  const toggleLayout = useCallback(() => {
    setExpanded((prev) => {
      const next = !prev;
      writeStorageString(STORAGE_KEYS.LAYOUT, next ? "expanded" : "default");
      return next;
    });
  }, []);
  return (
    <div className="flex h-screen flex-col">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[200] focus:rounded-lg focus:bg-zinc-800 focus:px-4 focus:py-2 focus:text-accent-400 focus:ring-2 focus:ring-accent-500/50"
      >
        Skip to content
      </a>
      <Header expanded={expanded} onToggleLayout={toggleLayout} />
      <Banners />
      <div className={`flex flex-1 overflow-hidden ${expanded ? "" : NARROW_SHELL_ROW_CLASS}`}>
        <main id="main-content" tabIndex={-1} className="flex-1 overflow-y-auto outline-none">
          <Outlet />
        </main>
      </div>
      <Footer expanded={expanded} />
    </div>
  );
}
