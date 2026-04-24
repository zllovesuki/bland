import { lazy, Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import {
  Plus,
  Search,
  ChevronsLeft,
  ChevronsRight,
  Loader2,
  Settings,
  ArrowLeft,
  ChevronDown,
  FileText,
  PenTool,
} from "lucide-react";
import { DropdownPortal } from "@/client/components/ui/dropdown-portal";
import { useCurrentWorkspace, useWorkspaceRole } from "@/client/components/workspace/use-workspace-view";
import { useCreatePage } from "@/client/hooks/use-create-page";
import { WorkspaceSwitcher } from "./workspace-switcher";
import { PageTree } from "./page-tree";
import { searchShortcutLabel } from "./search-shortcut";
import { useOnline } from "@/client/hooks/use-online";
import { deriveSidebarBaseAffordance, type SidebarBaseAffordance } from "@/client/lib/affordance/sidebar";
import { isActionEnabled, isActionVisible } from "@/client/lib/affordance/action-state";
import { toast } from "@/client/components/toast";
import { EmojiIcon } from "@/client/components/ui/emoji-icon";
import { MobileDrawer } from "@/client/components/ui/mobile-drawer";

const SearchDialog = lazy(() => import("./search-dialog").then((mod) => ({ default: mod.SearchDialog })));

interface SidebarProps {
  collapsed: boolean;
  onCollapsedChange: (next: boolean) => void;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

import type { WorkspaceRole } from "@/shared/types";
type SidebarWorkspaceRole = WorkspaceRole | "none";
type CreatePageAction = SidebarBaseAffordance["createPage"];
type CreatePageFn = ReturnType<typeof useCreatePage>["createPage"];

export function Sidebar({ collapsed, onCollapsedChange, mobileOpen, onMobileClose }: SidebarProps) {
  const currentWorkspace = useCurrentWorkspace();
  const { createPage, isCreating } = useCreatePage();
  const online = useOnline();
  const workspaceRole: SidebarWorkspaceRole = useWorkspaceRole() ?? "none";
  // "Shared mode" is role-defined, not access_mode-defined: guests belong in
  // the authenticated shell (so they can reach Leave Workspace), but still
  // need the sidebar to hide writer-only affordances. Anything outside the
  // owner/admin/member/guest set is shared-surface.
  const isSharedMode = workspaceRole === "none";
  const sidebarAffordance = deriveSidebarBaseAffordance({ workspaceRole, online });
  const { searchOpen, openSearch, closeSearch } = useSidebarSearch(online);

  const showCollapsed = collapsed && !mobileOpen;
  const sidebarMenuZIndex = mobileOpen ? 90 : undefined;
  const expandSidebar = useCallback(() => onCollapsedChange(false), [onCollapsedChange]);
  const collapseSidebar = useCallback(() => onCollapsedChange(true), [onCollapsedChange]);

  return (
    <MobileDrawer open={!!mobileOpen} onClose={onMobileClose ?? NOOP}>
      <SidebarFrame collapsed={showCollapsed}>
        {showCollapsed ? (
          <CollapsedSidebarRail
            createPageAction={sidebarAffordance.createPage}
            createPage={createPage}
            openSearch={openSearch}
            onExpand={expandSidebar}
          />
        ) : (
          <ExpandedSidebarContent
            currentWorkspace={currentWorkspace}
            isSharedMode={isSharedMode}
            createPageAction={sidebarAffordance.createPage}
            createPage={createPage}
            isCreating={isCreating}
            openSearch={openSearch}
            menuZIndex={sidebarMenuZIndex}
            mobileOpen={!!mobileOpen}
            onCollapse={collapseSidebar}
          />
        )}
        {searchOpen && (
          <Suspense fallback={null}>
            <SearchDialog open onClose={closeSearch} />
          </Suspense>
        )}
      </SidebarFrame>
    </MobileDrawer>
  );
}

function useSidebarSearch(online: boolean) {
  const [searchOpen, setSearchOpen] = useState(false);
  const onlineRef = useRef(online);
  onlineRef.current = online;

  const openSearch = useCallback(() => {
    if (!onlineRef.current) {
      toast.info("Search requires a connection");
      return;
    }
    setSearchOpen(true);
  }, []);

  const closeSearch = useCallback(() => {
    setSearchOpen(false);
  }, []);

  useEffect(() => {
    const handleKeydown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "k") {
        event.preventDefault();
        if (!onlineRef.current) {
          toast.info("Search requires a connection");
          return;
        }
        setSearchOpen((open) => !open);
      }
    };
    document.addEventListener("keydown", handleKeydown);
    return () => document.removeEventListener("keydown", handleKeydown);
  }, []);

  return { searchOpen, openSearch, closeSearch };
}

function SidebarFrame({ collapsed, children }: { collapsed: boolean; children: ReactNode }) {
  return (
    <aside
      className={`relative flex h-full shrink-0 flex-col border-r border-zinc-800/60 bg-zinc-900 transition-[width] duration-200 ${
        collapsed ? "w-12" : "w-[260px]"
      }`}
    >
      {children}
    </aside>
  );
}

interface CollapsedSidebarRailProps {
  createPageAction: CreatePageAction;
  createPage: CreatePageFn;
  openSearch: () => void;
  onExpand: () => void;
}

function CollapsedSidebarRail({ createPageAction, createPage, openSearch, onExpand }: CollapsedSidebarRailProps) {
  return (
    <div className="flex flex-1 flex-col items-center gap-2 pt-2">
      {isActionVisible(createPageAction) && (
        <button
          onClick={() => createPage()}
          disabled={!isActionEnabled(createPageAction)}
          className="flex h-8 w-8 items-center justify-center rounded-md text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300 disabled:opacity-50"
          aria-label="New page"
          title={createPageAction.kind === "disabled" ? createPageAction.reason : undefined}
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
        onClick={onExpand}
        className="mb-3 flex h-8 w-8 items-center justify-center rounded-md text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300"
        aria-label="Expand sidebar"
      >
        <ChevronsRight className="h-4 w-4" />
      </button>
    </div>
  );
}

interface ExpandedSidebarContentProps {
  currentWorkspace: ReturnType<typeof useCurrentWorkspace>;
  isSharedMode: boolean;
  createPageAction: CreatePageAction;
  createPage: CreatePageFn;
  isCreating: boolean;
  openSearch: () => void;
  menuZIndex?: number;
  mobileOpen: boolean;
  onCollapse: () => void;
}

function ExpandedSidebarContent({
  currentWorkspace,
  isSharedMode,
  createPageAction,
  createPage,
  isCreating,
  openSearch,
  menuZIndex,
  mobileOpen,
  onCollapse,
}: ExpandedSidebarContentProps) {
  return (
    <>
      {isSharedMode ? <SharedWorkspaceHeader currentWorkspace={currentWorkspace} /> : <WorkspaceSwitcher />}

      <SidebarActionBar
        createPageAction={createPageAction}
        createPage={createPage}
        isCreating={isCreating}
        openSearch={openSearch}
      />

      <nav className="flex-1 overflow-y-auto px-1">
        {isSharedMode && <div className="px-2 py-1 text-xs text-zinc-400">Shared with you</div>}
        <PageTree alwaysShowActions={mobileOpen} menuZIndex={menuZIndex} />
      </nav>

      <SidebarFooter
        currentWorkspace={currentWorkspace}
        isSharedMode={isSharedMode}
        mobileOpen={mobileOpen}
        onCollapse={onCollapse}
      />
    </>
  );
}

function SharedWorkspaceHeader({ currentWorkspace }: { currentWorkspace: ReturnType<typeof useCurrentWorkspace> }) {
  return (
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
  );
}

interface SidebarActionBarProps {
  createPageAction: CreatePageAction;
  createPage: CreatePageFn;
  isCreating: boolean;
  openSearch: () => void;
}

function SidebarActionBar({ createPageAction, createPage, isCreating, openSearch }: SidebarActionBarProps) {
  return (
    <div className="h-[46px] px-2 py-2">
      <div className="flex h-full items-center gap-1">
        <CreatePageControls createPageAction={createPageAction} createPage={createPage} isCreating={isCreating} />
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
  );
}

interface CreatePageControlsProps {
  createPageAction: CreatePageAction;
  createPage: CreatePageFn;
  isCreating: boolean;
}

function CreatePageControls({ createPageAction, createPage, isCreating }: CreatePageControlsProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  if (!isActionVisible(createPageAction)) return null;

  const disabled = isCreating || !isActionEnabled(createPageAction);
  const disabledReason = createPageAction.kind === "disabled" ? createPageAction.reason : undefined;

  return (
    <div className="relative flex flex-1 items-stretch">
      <button
        onClick={() => createPage()}
        disabled={disabled}
        className="flex flex-1 items-center gap-1.5 rounded-l-md border border-r-0 border-zinc-700/50 bg-zinc-800/30 px-2 py-1.5 text-xs font-medium text-zinc-300 transition-colors hover:border-zinc-600/50 hover:bg-zinc-800/60 hover:text-zinc-100 disabled:opacity-50"
        title={disabledReason}
      >
        {isCreating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
        New page
      </button>
      <button
        ref={triggerRef}
        onClick={() => setMenuOpen((open) => !open)}
        disabled={disabled}
        aria-label="New page options"
        aria-expanded={menuOpen}
        className="flex w-6 items-center justify-center rounded-r-md border border-zinc-700/50 bg-zinc-800/30 text-zinc-400 transition-colors hover:border-zinc-600/50 hover:bg-zinc-800/60 hover:text-zinc-100 disabled:opacity-50"
      >
        <ChevronDown className="h-3 w-3" />
      </button>
      {menuOpen && (
        <DropdownPortal triggerRef={triggerRef} align="left" width={180} onClose={() => setMenuOpen(false)}>
          <div className="py-1 text-sm">
            <button
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-zinc-200 hover:bg-zinc-700/70"
              onClick={() => {
                setMenuOpen(false);
                createPage({ kind: "doc" });
              }}
            >
              <FileText className="h-3.5 w-3.5 text-zinc-400" />
              New doc page
            </button>
            <button
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-zinc-200 hover:bg-zinc-700/70"
              onClick={() => {
                setMenuOpen(false);
                createPage({ kind: "canvas" });
              }}
            >
              <PenTool className="h-3.5 w-3.5 text-zinc-400" />
              New canvas
            </button>
          </div>
        </DropdownPortal>
      )}
    </div>
  );
}

interface SidebarFooterProps {
  currentWorkspace: ReturnType<typeof useCurrentWorkspace>;
  isSharedMode: boolean;
  mobileOpen: boolean;
  onCollapse: () => void;
}

function SidebarFooter({ currentWorkspace, isSharedMode, mobileOpen, onCollapse }: SidebarFooterProps) {
  // Settings link is available to any membership (including guest, so they
  // can reach Leave Workspace). Shared-surface viewers do not see it because
  // they cannot act on workspace settings.
  const showSettings = !!currentWorkspace && !isSharedMode;
  return (
    <div className="flex items-center gap-1 border-t border-zinc-800/60 px-2 py-2">
      {showSettings && (
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
          onClick={onCollapse}
          className="flex h-7 w-7 items-center justify-center rounded-md text-zinc-400 transition-colors hover:bg-zinc-800/50 hover:text-zinc-300"
          aria-label="Collapse sidebar"
          title="Collapse sidebar"
        >
          <ChevronsLeft className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

function NOOP() {}
