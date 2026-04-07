import { useState, useEffect } from "react";
import { Link } from "@tanstack/react-router";
import { Plus, Search, ChevronsLeft, ChevronsRight, Loader2, Settings } from "lucide-react";
import { useWorkspaceStore } from "@/client/stores/workspace-store";
import { useCreatePage } from "@/client/hooks/use-create-page";
import { STORAGE_KEYS } from "@/client/lib/constants";
import { WorkspaceSwitcher } from "./workspace-switcher";
import { PageTree } from "./page-tree";
import { SearchDialog, searchShortcutLabel } from "./search-dialog";

export function Sidebar() {
  const currentWorkspace = useWorkspaceStore((s) => s.currentWorkspace);
  const accessMode = useWorkspaceStore((s) => s.accessMode);
  const isSharedMode = accessMode === "shared";
  const { createPage, isCreating } = useCreatePage();
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    const stored = localStorage.getItem(STORAGE_KEYS.SIDEBAR);
    if (stored !== null) return stored === "true";
    return window.innerWidth < 768;
  });
  const [manualToggle, setManualToggle] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(STORAGE_KEYS.SIDEBAR) !== null;
  });
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    if (manualToggle) return;
    const mq = window.matchMedia("(max-width: 767px)");
    const handler = (e: MediaQueryListEvent) => setCollapsed(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [manualToggle]);

  return (
    <aside
      className={`relative flex shrink-0 flex-col border-r border-zinc-800/50 bg-zinc-950/50 transition-[width] duration-200 ${
        collapsed ? "w-12" : "w-[260px]"
      }`}
    >
      {collapsed ? (
        <div className="flex flex-1 flex-col items-center gap-2 pt-2">
          {!isSharedMode && (
            <button
              onClick={() => createPage()}
              className="flex h-8 w-8 items-center justify-center rounded-md text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-300"
              aria-label="New page"
            >
              <Plus className="h-4 w-4" />
            </button>
          )}
          <button
            onClick={() => setSearchOpen(true)}
            className="flex h-8 w-8 items-center justify-center rounded-md text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-300"
            aria-label="Search"
          >
            <Search className="h-4 w-4" />
          </button>
          <div className="flex-1" />
          <button
            onClick={() => {
              setManualToggle(true);
              setCollapsed(false);
              localStorage.setItem(STORAGE_KEYS.SIDEBAR, "false");
            }}
            className="mb-3 flex h-8 w-8 items-center justify-center rounded-md text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-300"
            aria-label="Expand sidebar"
          >
            <ChevronsRight className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <>
          {isSharedMode ? (
            <div className="flex h-10 items-center border-b border-zinc-800/50 px-3">
              <span className="truncate text-sm font-medium text-zinc-300">
                {currentWorkspace?.icon && <span className="mr-1.5">{currentWorkspace.icon}</span>}
                {currentWorkspace?.name ?? "Workspace"}
              </span>
            </div>
          ) : (
            <WorkspaceSwitcher />
          )}

          <div className="flex items-center gap-1 px-2 py-2">
            {!isSharedMode && (
              <button
                onClick={() => createPage()}
                disabled={isCreating}
                className="flex flex-1 items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium text-zinc-400 transition hover:bg-zinc-800/50 hover:text-zinc-200 disabled:opacity-50"
              >
                {isCreating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                New page
              </button>
            )}
            <button
              onClick={() => setSearchOpen(true)}
              className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-zinc-500 transition hover:bg-zinc-800/50 hover:text-zinc-300"
              aria-label="Search pages"
            >
              <Search className="h-3.5 w-3.5" />
              <kbd className="hidden rounded border border-zinc-700 bg-zinc-800 px-1 py-0.5 font-mono text-[10px] text-zinc-500 sm:inline">
                {searchShortcutLabel}
              </kbd>
            </button>
          </div>

          <nav className="flex-1 overflow-y-auto px-1">
            {isSharedMode && <div className="px-2 py-1 text-xs text-zinc-500">Shared with you</div>}
            <PageTree />
          </nav>

          <div className="border-t border-zinc-800/50 px-2 py-2">
            {currentWorkspace && !isSharedMode && (
              <Link
                to="/$workspaceSlug/settings"
                params={{ workspaceSlug: currentWorkspace.slug }}
                className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-zinc-500 transition hover:bg-zinc-800/50 hover:text-zinc-300"
              >
                <Settings className="h-4 w-4" />
                <span>Settings</span>
              </Link>
            )}
            <button
              onClick={() => {
                setManualToggle(true);
                setCollapsed(true);
                localStorage.setItem(STORAGE_KEYS.SIDEBAR, "true");
              }}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-zinc-500 transition hover:bg-zinc-800/50 hover:text-zinc-300"
              aria-label="Collapse sidebar"
            >
              <ChevronsLeft className="h-4 w-4" />
              <span>Collapse</span>
            </button>
          </div>
        </>
      )}
      <SearchDialog open={searchOpen} onClose={() => setSearchOpen(false)} />
    </aside>
  );
}
