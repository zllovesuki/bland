import { lazy, Suspense, useCallback, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "@tanstack/react-router";

import {
  ArrowDown,
  ArrowUp,
  ChevronRight,
  FileText,
  ListIndentDecrease,
  ListIndentIncrease,
  MoreHorizontal,
  Move,
  Plus,
  Trash2,
} from "lucide-react";
import type { Page } from "@/shared/types";
import { DEFAULT_PAGE_TITLE } from "@/shared/constants";
import { api, toApiError } from "@/client/lib/api";
import { useCurrentWorkspace } from "@/client/components/workspace/use-workspace-view";
import { useWorkspaceStore } from "@/client/stores/workspace-store";
import { useAuthStore } from "@/client/stores/auth-store";
import { getArchivePageConfirmMessage } from "@/client/lib/page-archive";
import { useCreatePage } from "@/client/hooks/use-create-page";
import { EmojiIcon } from "@/client/components/ui/emoji-icon";
import { confirm } from "@/client/components/confirm";
import { DropdownPortal } from "@/client/components/ui/dropdown-portal";
import { deriveSidebarRowAffordance } from "@/client/lib/affordance/sidebar";
import { isActionEnabled, isActionVisible } from "@/client/lib/affordance/action-state";
import {
  resolveIndent,
  resolveMoveDown,
  resolveMoveUp,
  resolveOutdent,
  type MoveResolution,
  type MoveResult,
  type PageTreeIndex,
} from "@/client/lib/page-tree-model";
import { toast } from "@/client/components/toast";
const SidebarMoveDialog = lazy(() =>
  import("./sidebar-move-dialog").then((mod) => ({ default: mod.SidebarMoveDialog })),
);
import { getSidebarTreeChevronLeft, getSidebarTreeContentPaddingLeft } from "./tree-metrics";

interface PageTreeItemProps {
  page: Page;
  depth: number;
  index: PageTreeIndex;
  allPages: Page[];
  alwaysShowActions: boolean;
  activeAncestorIds: Set<string>;
  menuZIndex?: number;
  workspaceRole: "owner" | "admin" | "member" | "guest" | "none";
  online: boolean;
}

const EMPTY_CHILDREN: readonly never[] = [];

const MENU_ITEM_CLASS =
  "group flex min-h-8 w-full items-center gap-2 rounded px-2 py-1.5 text-[13px] text-left transition-[background-color,color] focus-visible:outline-none disabled:opacity-40 disabled:hover:bg-transparent";
const MENU_NEUTRAL_ITEM_CLASS =
  "text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100 focus-visible:bg-zinc-700 focus-visible:text-zinc-100 disabled:hover:text-zinc-300";
const MENU_DANGER_ITEM_CLASS =
  "text-red-400 hover:bg-red-500/10 hover:text-red-300 focus-visible:bg-red-500/10 focus-visible:text-red-300 disabled:hover:text-red-400";
const MENU_ICON_CLASS =
  "flex w-4 shrink-0 items-center justify-center text-zinc-400 transition-colors group-hover:text-current group-focus-visible:text-current";
const MENU_DANGER_ICON_CLASS = MENU_ICON_CLASS;
const MENU_LABEL_CLASS = "flex-1";
const MENU_SEPARATOR_CLASS = "my-1 h-px bg-zinc-800";

export function PageTreeItem({
  page,
  depth,
  index,
  allPages,
  alwaysShowActions,
  activeAncestorIds,
  menuZIndex,
  workspaceRole,
  online,
}: PageTreeItemProps) {
  const childPages = index.childrenByParent.get(page.id) ?? EMPTY_CHILDREN;
  const params = useParams({ strict: false }) as {
    workspaceSlug?: string;
    pageId?: string;
  };
  const navigate = useNavigate();
  const currentWorkspace = useCurrentWorkspace();
  const archivePage = useWorkspaceStore((s) => s.archivePageInSnapshot);
  const patchPage = useWorkspaceStore((s) => s.updatePageInSnapshot);
  const upsertPage = useWorkspaceStore((s) => s.upsertPageInSnapshot);
  const currentUser = useAuthStore((s) => s.user);
  const rowAffordance = deriveSidebarRowAffordance({
    workspaceRole,
    ownsPage: currentUser?.id === page.created_by,
    online,
  });
  const { createPage, isCreating: creating } = useCreatePage();
  const isActive = params.pageId === page.id;
  const shouldExpand = activeAncestorIds.has(page.id) || isActive;
  const [userExpanded, setUserExpanded] = useState(shouldExpand);
  const [prevShouldExpand, setPrevShouldExpand] = useState(shouldExpand);
  // Auto-expand when becoming active or hosting an active descendant; user
  // toggles still win until shouldExpand transitions again. Pattern from
  // https://react.dev/reference/react/useState#storing-information-from-previous-renders
  if (shouldExpand !== prevShouldExpand) {
    setPrevShouldExpand(shouldExpand);
    if (shouldExpand) setUserExpanded(true);
  }
  const isExpanded = userExpanded;
  const [menuOpen, setMenuOpen] = useState(false);
  const [moveDialogOpen, setMoveDialogOpen] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [moving, setMoving] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const hasChildren = childPages.length > 0;
  const moreVisibility =
    alwaysShowActions || menuOpen || isActive ? "opacity-100" : "opacity-40 group-hover:opacity-100";
  const addVisibility = alwaysShowActions || menuOpen || isActive ? "opacity-100" : "opacity-0 group-hover:opacity-100";

  const moveUp = useMemo(() => resolveMoveUp(allPages, page, index), [allPages, page, index]);
  const moveDown = useMemo(() => resolveMoveDown(allPages, page, index), [allPages, page, index]);
  const indent = useMemo(() => resolveIndent(allPages, page, index), [allPages, page, index]);
  const outdent = useMemo(() => resolveOutdent(allPages, page, index), [allPages, page, index]);

  const toggleExpand = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setUserExpanded((v) => !v);
  }, []);

  const executeMove = useCallback(
    async (resolution: MoveResolution) => {
      if (!currentWorkspace || moving) return;
      setMoving(true);
      setMenuOpen(false);
      const previousParentId = page.parent_id;
      const previousPosition = page.position;
      patchPage(currentWorkspace.id, page.id, {
        parent_id: resolution.proposal.parentId,
        position: resolution.proposal.position,
      });
      try {
        const updated = await api.pages.update(currentWorkspace.id, page.id, {
          parent_id: resolution.proposal.parentId,
          position: resolution.proposal.position,
        });
        upsertPage(currentWorkspace.id, updated);
      } catch (err) {
        patchPage(currentWorkspace.id, page.id, {
          parent_id: previousParentId,
          position: previousPosition,
        });
        toast.error(toApiError(err).message || "Failed to move page");
        throw err;
      } finally {
        setMoving(false);
      }
    },
    [currentWorkspace, moving, page.id, page.parent_id, page.position, patchPage, upsertPage],
  );

  const handleArchive = useCallback(
    async (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!currentWorkspace || archiving) return;
      setMenuOpen(false);
      const ok = await confirm({
        title: "Archive page",
        message: getArchivePageConfirmMessage(page.title, childPages.length),
      });
      if (!ok) return;
      setArchiving(true);
      try {
        await api.pages.delete(currentWorkspace.id, page.id);
        archivePage(currentWorkspace.id, page.id);
        if (params.pageId === page.id) {
          navigate({ to: "/$workspaceSlug", params: { workspaceSlug: params.workspaceSlug || currentWorkspace.slug } });
        }
      } finally {
        setArchiving(false);
        setMenuOpen(false);
      }
    },
    [
      currentWorkspace,
      archiving,
      page.id,
      page.title,
      childPages.length,
      archivePage,
      params.pageId,
      params.workspaceSlug,
      navigate,
    ],
  );

  const handleCreateSubpage = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      createPage({ parentId: page.id, onCreated: () => setUserExpanded(true) });
    },
    [createPage, page.id],
  );

  const openMoveDialog = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!isActionEnabled(rowAffordance.movePage)) return;
      setMenuOpen(false);
      setMoveDialogOpen(true);
    },
    [rowAffordance.movePage],
  );

  const runQuickMove = useCallback(
    (e: React.MouseEvent, result: MoveResult) => {
      e.preventDefault();
      e.stopPropagation();
      if (!isActionEnabled(rowAffordance.movePage) || !result.ok) return;
      void executeMove(result);
    },
    [executeMove, rowAffordance.movePage],
  );

  const rowPaddingLeft = getSidebarTreeContentPaddingLeft(depth);
  const chevronLeft = getSidebarTreeChevronLeft(depth);

  const moveTitle = rowAffordance.movePage.kind === "disabled" ? rowAffordance.movePage.reason : undefined;
  const moveDisabledReason = useCallback(
    (result: MoveResult) => {
      if (rowAffordance.movePage.kind === "disabled") return rowAffordance.movePage.reason;
      return result.ok ? undefined : result.message;
    },
    [rowAffordance.movePage],
  );

  return (
    <div>
      <Link
        to="/$workspaceSlug/$pageId"
        params={{ workspaceSlug: params.workspaceSlug || currentWorkspace?.slug || "", pageId: page.id }}
        data-page-row
        data-page-id={page.id}
        data-depth={depth}
        className={`group relative flex h-8 items-center gap-1 rounded-md px-2 text-sm transition-colors ${
          isActive ? "bg-accent-500/10 text-accent-400" : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200"
        }`}
        style={{ paddingLeft: rowPaddingLeft }}
      >
        {hasChildren && (
          <button
            onClick={toggleExpand}
            className="absolute top-1/2 flex h-5 w-4 -translate-y-1/2 items-center justify-center rounded text-zinc-500 transition-colors hover:bg-zinc-700 hover:text-zinc-300"
            style={{ left: chevronLeft }}
            tabIndex={-1}
            aria-label={isExpanded ? "Collapse" : "Expand"}
          >
            <ChevronRight className={`h-3 w-3 transition-transform ${isExpanded ? "rotate-90" : ""}`} />
          </button>
        )}

        <span className="flex h-5 w-5 shrink-0 items-center justify-center text-xs">
          {page.icon ? <EmojiIcon emoji={page.icon} size={14} /> : <FileText className="h-3.5 w-3.5 text-zinc-500" />}
        </span>

        <span className="truncate" title={page.title || DEFAULT_PAGE_TITLE}>
          {page.title || DEFAULT_PAGE_TITLE}
        </span>

        {isActionVisible(rowAffordance.createSubpage) && (
          <button
            onClick={handleCreateSubpage}
            disabled={creating || !isActionEnabled(rowAffordance.createSubpage)}
            className={`ml-auto flex h-6 w-6 shrink-0 items-center justify-center rounded hover:bg-zinc-700 ${addVisibility} disabled:opacity-50`}
            tabIndex={-1}
            aria-label="Create subpage"
            title={rowAffordance.createSubpage.kind === "disabled" ? rowAffordance.createSubpage.reason : undefined}
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        )}

        {(isActionVisible(rowAffordance.movePage) || isActionVisible(rowAffordance.archivePage)) && (
          <div ref={menuRef} className="shrink-0">
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setMenuOpen((v) => !v);
              }}
              className={`flex h-6 w-6 items-center justify-center rounded hover:bg-zinc-700 ${moreVisibility}`}
              tabIndex={-1}
              aria-label="Page options"
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </button>
            {menuOpen && (
              <DropdownPortal
                triggerRef={menuRef}
                zIndex={menuZIndex}
                width={208}
                className="p-1 shadow-[0_8px_24px_rgba(0,0,0,0.45)]"
                onClose={() => setMenuOpen(false)}
              >
                <div role="menu" aria-label="Page actions">
                  {isActionVisible(rowAffordance.movePage) && (
                    <>
                      <button
                        role="menuitem"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={openMoveDialog}
                        disabled={!isActionEnabled(rowAffordance.movePage)}
                        className={`${MENU_ITEM_CLASS} ${MENU_NEUTRAL_ITEM_CLASS}`}
                        title={moveTitle}
                      >
                        <span className={MENU_ICON_CLASS}>
                          <Move className="h-3.5 w-3.5" />
                        </span>
                        <span className={MENU_LABEL_CLASS}>Move…</span>
                      </button>

                      <div className={MENU_SEPARATOR_CLASS} role="separator" />

                      <button
                        role="menuitem"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={(e) => runQuickMove(e, moveUp)}
                        disabled={!isActionEnabled(rowAffordance.movePage) || !moveUp.ok}
                        className={`${MENU_ITEM_CLASS} ${MENU_NEUTRAL_ITEM_CLASS}`}
                        title={moveDisabledReason(moveUp)}
                      >
                        <span className={MENU_ICON_CLASS}>
                          <ArrowUp className="h-3.5 w-3.5" />
                        </span>
                        <span className={MENU_LABEL_CLASS}>Move up</span>
                      </button>
                      <button
                        role="menuitem"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={(e) => runQuickMove(e, moveDown)}
                        disabled={!isActionEnabled(rowAffordance.movePage) || !moveDown.ok}
                        className={`${MENU_ITEM_CLASS} ${MENU_NEUTRAL_ITEM_CLASS}`}
                        title={moveDisabledReason(moveDown)}
                      >
                        <span className={MENU_ICON_CLASS}>
                          <ArrowDown className="h-3.5 w-3.5" />
                        </span>
                        <span className={MENU_LABEL_CLASS}>Move down</span>
                      </button>

                      <div className={MENU_SEPARATOR_CLASS} role="separator" />

                      <button
                        role="menuitem"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={(e) => runQuickMove(e, indent)}
                        disabled={!isActionEnabled(rowAffordance.movePage) || !indent.ok}
                        className={`${MENU_ITEM_CLASS} ${MENU_NEUTRAL_ITEM_CLASS}`}
                        title={moveDisabledReason(indent)}
                      >
                        <span className={MENU_ICON_CLASS}>
                          <ListIndentIncrease className="h-3.5 w-3.5" />
                        </span>
                        <span className={MENU_LABEL_CLASS}>Indent</span>
                      </button>
                      <button
                        role="menuitem"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={(e) => runQuickMove(e, outdent)}
                        disabled={!isActionEnabled(rowAffordance.movePage) || !outdent.ok}
                        className={`${MENU_ITEM_CLASS} ${MENU_NEUTRAL_ITEM_CLASS}`}
                        title={moveDisabledReason(outdent)}
                      >
                        <span className={MENU_ICON_CLASS}>
                          <ListIndentDecrease className="h-3.5 w-3.5" />
                        </span>
                        <span className={MENU_LABEL_CLASS}>Outdent</span>
                      </button>
                    </>
                  )}

                  {isActionVisible(rowAffordance.movePage) && isActionVisible(rowAffordance.archivePage) && (
                    <div className={MENU_SEPARATOR_CLASS} role="separator" />
                  )}

                  {isActionVisible(rowAffordance.archivePage) && (
                    <button
                      role="menuitem"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={handleArchive}
                      disabled={archiving || !isActionEnabled(rowAffordance.archivePage)}
                      className={`${MENU_ITEM_CLASS} ${MENU_DANGER_ITEM_CLASS}`}
                      title={
                        rowAffordance.archivePage.kind === "disabled" ? rowAffordance.archivePage.reason : undefined
                      }
                    >
                      <span className={MENU_DANGER_ICON_CLASS}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </span>
                      <span className={MENU_LABEL_CLASS}>{archiving ? "Archiving..." : "Archive"}</span>
                    </button>
                  )}
                </div>
              </DropdownPortal>
            )}
          </div>
        )}
      </Link>

      {moveDialogOpen && (
        <Suspense fallback={null}>
          <SidebarMoveDialog
            open
            page={page}
            allPages={allPages}
            index={index}
            onClose={() => setMoveDialogOpen(false)}
            onConfirm={executeMove}
          />
        </Suspense>
      )}

      {isExpanded && hasChildren && (
        <div>
          {childPages.map((child) => (
            <PageTreeItem
              key={child.id}
              page={child}
              depth={depth + 1}
              index={index}
              allPages={allPages}
              alwaysShowActions={alwaysShowActions}
              activeAncestorIds={activeAncestorIds}
              menuZIndex={menuZIndex}
              workspaceRole={workspaceRole}
              online={online}
            />
          ))}
        </div>
      )}
    </div>
  );
}
