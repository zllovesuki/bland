import { lazy, Suspense, useState, useEffect, useCallback, useRef } from "react";
import { Link } from "@tanstack/react-router";
import { Plus, Search, ChevronsLeft, ChevronsRight, Loader2, Settings, ArrowLeft } from "lucide-react";
import {
  useWorkspaceView,
  useWorkspaceMembers,
  useCurrentWorkspace,
} from "@/client/components/workspace/use-workspace-view";
import { useCreatePage } from "@/client/hooks/use-create-page";
import { STORAGE_KEYS } from "@/client/lib/constants";
import { WorkspaceSwitcher } from "./workspace-switcher";
import { PageTree } from "./page-tree";
import { searchShortcutLabel } from "./search-shortcut";

const SearchDialog = lazy(() => import("./search-dialog").then((mod) => ({ default: mod.SearchDialog })));
import { useOnline } from "@/client/hooks/use-online";
import { useAuthStore } from "@/client/stores/auth-store";
import { getMyRole } from "@/client/lib/workspace-role";
import { deriveSidebarBaseAffordance } from "@/client/lib/affordance/sidebar";
import { isActionEnabled, isActionVisible } from "@/client/lib/affordance/action-state";
import { toast } from "@/client/components/toast";
import { EmojiIcon } from "@/client/components/ui/emoji-icon";
import { MobileDrawer } from "@/client/components/ui/mobile-drawer";
import { readStorageString, writeStorageString } from "@/client/lib/storage";

interface SidebarProps {
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

export function Sidebar({ mobileOpen, onMobileClose }: SidebarProps = {}) {
  const { route } = useWorkspaceView();
  const currentWorkspace = useCurrentWorkspace();
  const isSharedMode = route.phase === "ready" && route.accessMode === "shared";
  const members = useWorkspaceMembers();
  const currentUser = useAuthStore((s) => s.user);
  const { createPage, isCreating } = useCreatePage();
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    const stored = readStorageString(STORAGE_KEYS.SIDEBAR);
    if (stored !== null) return stored === "true";
    return window.innerWidth < 768;
  });
  const [manualToggle, setManualToggle] = useState(() => {
    if (typeof window === "undefined") return false;
    return readStorageString(STORAGE_KEYS.SIDEBAR) !== null;
  });
  const [searchOpen, setSearchOpen] = useState(false);
  const online = useOnline();
  const workspaceRole = getMyRole(members, currentUser) ?? "none";
  const sidebarAffordance = deriveSidebarBaseAffordance({ workspaceRole, online });
  const onlineRef = useRef(online);
  onlineRef.current = online;

  const openSearch = useCallback(() => {
    if (!onlineRef.current) {
      toast.info("Search requires a connection");
      return;
    }
    setSearchOpen(true);
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        if (!onlineRef.current) {
          toast.info("Search requires a connection");
          return;
        }
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

  const showCollapsed = collapsed && !mobileOpen;
  const sidebarMenuZIndex = mobileOpen ? 90 : undefined;

  const sidebarContent = (
    <aside
      className={`relative flex h-full shrink-0 flex-col border-r border-zinc-800/60 transition-[width] duration-200 ${
        showCollapsed ? "w-12" : "w-[260px]"
      } bg-zinc-900`}
    >
      {showCollapsed ? (
        <div className="flex flex-1 flex-col items-center gap-2 pt-2">
          {isActionVisible(sidebarAffordance.createPage) && (
            <button
              onClick={() => createPage()}
              disabled={!isActionEnabled(sidebarAffordance.createPage)}
              className="flex h-8 w-8 items-center justify-center rounded-md text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300 disabled:opacity-50"
              aria-label="New page"
              title={sidebarAffordance.createPage.kind === "disabled" ? sidebarAffordance.createPage.reason : undefined}
            >
              <Plus className="h-4 w-4" />
            </button>
          )}
          <button
            onClick={openSearch}
            className="flex h-8 w-8 items-center justify-center rounded-md text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300"
            aria-label="Search"
          >
            <Search className="h-4 w-4" />
          </button>
          <div className="flex-1" />
          <button
            onClick={() => {
              setManualToggle(true);
              setCollapsed(false);
              writeStorageString(STORAGE_KEYS.SIDEBAR, "false");
            }}
            className="mb-3 flex h-8 w-8 items-center justify-center rounded-md text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300"
            aria-label="Expand sidebar"
          >
            <ChevronsRight className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <>
          {isSharedMode ? (
            <div className="flex h-10 items-center gap-2 border-b border-zinc-800/60 px-3">
              <Link
                to="/"
                className="flex shrink-0 items-center justify-center rounded-md p-0.5 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300"
                aria-label="Back to your workspaces"
                title="Back to your workspaces"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
              </Link>
              <span className="truncate text-sm font-medium text-zinc-300">
                {currentWorkspace?.icon && (
                  <span className="mr-1.5 inline-flex items-center align-middle">
                    <EmojiIcon emoji={currentWorkspace.icon} size={14} />
                  </span>
                )}
                {currentWorkspace?.name ?? "Workspace"}
              </span>
            </div>
          ) : (
            <WorkspaceSwitcher />
          )}

          <div className="h-[46px] px-2 py-2">
            <div className="flex h-full items-center gap-1">
              {isActionVisible(sidebarAffordance.createPage) && (
                <button
                  onClick={() => createPage()}
                  disabled={isCreating || !isActionEnabled(sidebarAffordance.createPage)}
                  className="flex flex-1 items-center gap-1.5 rounded-md border border-zinc-700/50 bg-zinc-800/30 px-2 py-1.5 text-xs font-medium text-zinc-300 transition-colors hover:border-zinc-600/50 hover:bg-zinc-800/60 hover:text-zinc-100 disabled:opacity-50"
                  title={
                    sidebarAffordance.createPage.kind === "disabled" ? sidebarAffordance.createPage.reason : undefined
                  }
                >
                  {isCreating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                  New page
                </button>
              )}
              <button
                onClick={openSearch}
                className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-zinc-500 transition-colors hover:bg-zinc-800/50 hover:text-zinc-300"
                aria-label="Search pages"
              >
                <Search className="h-3.5 w-3.5" />
                <kbd className="hidden rounded border border-zinc-700 bg-zinc-800 px-1 py-0.5 font-mono text-[10px] text-zinc-400 sm:inline">
                  {searchShortcutLabel}
                </kbd>
              </button>
            </div>
          </div>

          <nav className="flex-1 overflow-y-auto px-1">
            {isSharedMode && <div className="px-2 py-1 text-xs text-zinc-400">Shared with you</div>}
            <PageTree alwaysShowActions={!!mobileOpen} menuZIndex={sidebarMenuZIndex} />
          </nav>

          <div className="flex items-center gap-1 border-t border-zinc-800/60 px-2 py-2">
            {currentWorkspace && !isSharedMode && (
              <Link
                to="/$workspaceSlug/settings"
                params={{ workspaceSlug: currentWorkspace.slug }}
                className="flex h-7 w-7 items-center justify-center rounded-md text-zinc-400 transition-colors hover:bg-zinc-800/50 hover:text-zinc-300"
                aria-label="Settings"
                title="Settings"
              >
                <Settings className="h-4 w-4" />
              </Link>
            )}
            <div className="flex-1" />
            {!mobileOpen && (
              <button
                onClick={() => {
                  setManualToggle(true);
                  setCollapsed(true);
                  writeStorageString(STORAGE_KEYS.SIDEBAR, "true");
                }}
                className="flex h-7 w-7 items-center justify-center rounded-md text-zinc-400 transition-colors hover:bg-zinc-800/50 hover:text-zinc-300"
                aria-label="Collapse sidebar"
                title="Collapse sidebar"
              >
                <ChevronsLeft className="h-4 w-4" />
              </button>
            )}
          </div>
        </>
      )}
      {searchOpen && (
        <Suspense fallback={null}>
          <SearchDialog open onClose={() => setSearchOpen(false)} />
        </Suspense>
      )}
    </aside>
  );

  return (
    <MobileDrawer open={!!mobileOpen} onClose={onMobileClose ?? (() => {})}>
      {sidebarContent}
    </MobileDrawer>
  );
}
