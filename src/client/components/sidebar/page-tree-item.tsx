import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "@tanstack/react-router";

import { ChevronRight, FileText, MoreHorizontal, Plus, Trash2 } from "lucide-react";
import type { Page } from "@/shared/types";
import { DEFAULT_PAGE_TITLE } from "@/shared/constants";
import { api } from "@/client/lib/api";
import { useWorkspaceMembers, useCurrentWorkspace } from "@/client/components/workspace/use-workspace-view";
import { useWorkspaceStore } from "@/client/stores/workspace-store";
import { useAuthStore } from "@/client/stores/auth-store";
import { canArchivePage, canCreatePage } from "@/client/lib/permissions";
import { getArchivePageConfirmMessage } from "@/client/lib/page-archive";
import { useCreatePage } from "@/client/hooks/use-create-page";
import { EmojiIcon } from "@/client/components/ui/emoji-icon";
import { confirm } from "@/client/components/confirm";
import { DropdownPortal } from "@/client/components/ui/dropdown-portal";

interface PageTreeItemProps {
  page: Page;
  depth: number;
  childPages: Page[];
  allPages: Page[];
  alwaysShowActions: boolean;
  activeAncestorIds: Set<string>;
  expandedDuringDrag: Set<string>;
  draggedId: string | null;
  dropAnchorId: string | null;
  renderDropPreview: () => ReactNode;
  menuZIndex?: number;
  onDragStart: (e: React.DragEvent, pageId: string) => void;
  onDragEnd: () => void;
  canDrag: boolean;
}

export function PageTreeItem({
  page,
  depth,
  childPages,
  allPages,
  alwaysShowActions,
  activeAncestorIds,
  expandedDuringDrag,
  draggedId,
  dropAnchorId,
  renderDropPreview,
  menuZIndex,
  onDragStart,
  onDragEnd,
  canDrag,
}: PageTreeItemProps) {
  const params = useParams({ strict: false }) as {
    workspaceSlug?: string;
    pageId?: string;
  };
  const navigate = useNavigate();
  const currentWorkspace = useCurrentWorkspace();
  const archivePage = useWorkspaceStore((s) => s.archivePageInSnapshot);
  const members = useWorkspaceMembers();
  const currentUser = useAuthStore((s) => s.user);
  const canArchive = canArchivePage(members, currentUser, page);
  const canCreate = canCreatePage(members, currentUser);
  const { createPage, isCreating: creating } = useCreatePage();
  const isActive = params.pageId === page.id;
  const shouldExpand = activeAncestorIds.has(page.id) || isActive;
  const [userExpanded, setUserExpanded] = useState(shouldExpand);

  useEffect(() => {
    if (shouldExpand) setUserExpanded(true);
  }, [shouldExpand]);

  const isExpanded = userExpanded || expandedDuringDrag.has(page.id);
  const [menuOpen, setMenuOpen] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const hasChildren = childPages.length > 0;
  const moreVisibility =
    alwaysShowActions || menuOpen || isActive ? "opacity-100" : "opacity-40 group-hover:opacity-100";
  const addVisibility = alwaysShowActions || menuOpen || isActive ? "opacity-100" : "opacity-0 group-hover:opacity-100";

  const toggleExpand = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setUserExpanded((v) => !v);
  }, []);

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

  const handleDragStart = useCallback(
    (e: React.DragEvent) => {
      setMenuOpen(false);
      onDragStart(e, page.id);
    },
    [onDragStart, page.id],
  );

  const isDragged = draggedId === page.id;
  const showPreviewBefore = dropAnchorId === page.id;

  return (
    <div>
      {showPreviewBefore && renderDropPreview()}
      <Link
        to="/$workspaceSlug/$pageId"
        params={{ workspaceSlug: params.workspaceSlug || currentWorkspace?.slug || "", pageId: page.id }}
        draggable={canDrag}
        onDragStart={handleDragStart}
        onDragEnd={onDragEnd}
        data-page-row
        data-page-id={page.id}
        data-depth={depth}
        data-dragging={isDragged ? "true" : undefined}
        className={`group flex h-8 items-center gap-1 rounded-md px-2 text-sm transition-colors ${
          isActive ? "bg-accent-500/10 text-accent-400" : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200"
        }`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
      >
        <button
          onClick={toggleExpand}
          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded transition-colors ${
            hasChildren ? "text-zinc-500 hover:bg-zinc-700 hover:text-zinc-300" : "pointer-events-none opacity-0"
          }`}
          tabIndex={-1}
          aria-label={isExpanded ? "Collapse" : "Expand"}
        >
          <ChevronRight className={`h-3 w-3 transition-transform ${isExpanded ? "rotate-90" : ""}`} />
        </button>

        <span className="flex h-5 w-5 shrink-0 items-center justify-center text-xs">
          {page.icon ? <EmojiIcon emoji={page.icon} size={14} /> : <FileText className="h-3.5 w-3.5 text-zinc-500" />}
        </span>

        <span className="truncate" title={page.title || DEFAULT_PAGE_TITLE}>
          {page.title || DEFAULT_PAGE_TITLE}
        </span>

        {canCreate && (
          <button
            onClick={handleCreateSubpage}
            disabled={creating}
            className={`ml-auto flex h-6 w-6 shrink-0 items-center justify-center rounded hover:bg-zinc-700 ${addVisibility} disabled:opacity-50`}
            tabIndex={-1}
            aria-label="Create subpage"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        )}

        {canArchive && (
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
              <DropdownPortal triggerRef={menuRef} zIndex={menuZIndex} onClose={() => setMenuOpen(false)}>
                <button
                  onClick={handleArchive}
                  disabled={archiving}
                  className="flex w-full cursor-pointer items-center gap-2 rounded-sm px-3 py-1.5 text-xs text-red-400 hover:bg-zinc-700 disabled:opacity-50"
                >
                  <Trash2 className="h-3 w-3" />
                  {archiving ? "Archiving..." : "Archive"}
                </button>
              </DropdownPortal>
            )}
          </div>
        )}
      </Link>

      {isExpanded && hasChildren && (
        <div>
          {childPages.map((child) => (
            <PageTreeItem
              key={child.id}
              page={child}
              depth={depth + 1}
              childPages={allPages.filter((p) => p.parent_id === child.id && !p.archived_at)}
              allPages={allPages}
              alwaysShowActions={alwaysShowActions}
              activeAncestorIds={activeAncestorIds}
              expandedDuringDrag={expandedDuringDrag}
              draggedId={draggedId}
              dropAnchorId={dropAnchorId}
              renderDropPreview={renderDropPreview}
              menuZIndex={menuZIndex}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              canDrag={canDrag}
            />
          ))}
        </div>
      )}
    </div>
  );
}
