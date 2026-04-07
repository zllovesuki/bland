import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { ChevronRight, FileText, MoreHorizontal, Plus, Trash2 } from "lucide-react";
import type { Page } from "@/shared/types";
import { DEFAULT_PAGE_TITLE } from "@/shared/constants";
import { api } from "@/client/lib/api";
import { useWorkspaceStore } from "@/client/stores/workspace-store";
import { useAuthStore } from "@/client/stores/auth-store";
import { canArchivePage, canCreatePage } from "@/client/lib/permissions";
import { getArchivePageConfirmMessage } from "@/client/lib/page-archive";
import { useClickOutside } from "@/client/hooks/use-click-outside";
import { useCreatePage } from "@/client/hooks/use-create-page";
import type { DropTarget } from "@/client/hooks/use-page-drag";
import { EmojiIcon } from "@/client/components/ui/emoji-icon";
import { confirm } from "@/client/components/confirm";

interface PageTreeItemProps {
  page: Page;
  depth: number;
  childPages: Page[];
  allPages: Page[];
  activeAncestorIds: Set<string>;
  draggedId: string | null;
  dropTarget: DropTarget | null;
  onDragStart: (e: React.DragEvent, pageId: string) => void;
  onDragOver: (e: React.DragEvent, pageId: string) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  canDrag: boolean;
}

export function PageTreeItem({
  page,
  depth,
  childPages,
  allPages,
  activeAncestorIds,
  draggedId,
  dropTarget,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDragEnd,
  canDrag,
}: PageTreeItemProps) {
  const params = useParams({ strict: false }) as {
    workspaceSlug?: string;
    pageId?: string;
  };
  const navigate = useNavigate();
  const currentWorkspace = useWorkspaceStore((s) => s.currentWorkspace);
  const archivePage = useWorkspaceStore((s) => s.archivePage);
  const members = useWorkspaceStore((s) => s.members);
  const currentUser = useAuthStore((s) => s.user);
  const canArchive = canArchivePage(members, currentUser, page);
  const canCreate = canCreatePage(members, currentUser);
  const { createPage, isCreating: creating } = useCreatePage();
  const isActive = params.pageId === page.id;
  const shouldExpand = activeAncestorIds.has(page.id) || isActive;
  const [isExpanded, setIsExpanded] = useState(shouldExpand);

  useEffect(() => {
    if (shouldExpand) setIsExpanded(true);
  }, [shouldExpand]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const hasChildren = childPages.length > 0;

  const toggleExpand = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsExpanded((v) => !v);
  }, []);

  useClickOutside(
    menuRef,
    useCallback(() => setMenuOpen(false), []),
    menuOpen,
  );

  const handleArchive = useCallback(
    async (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!currentWorkspace || archiving) return;
      const ok = await confirm({
        title: "Archive page",
        message: getArchivePageConfirmMessage(page.title, childPages.length),
      });
      if (!ok) return;
      setArchiving(true);
      try {
        await api.pages.delete(currentWorkspace.id, page.id);
        archivePage(page.id);
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
      createPage({ parentId: page.id, onCreated: () => setIsExpanded(true) });
    },
    [createPage, page.id],
  );

  const isDragged = draggedId === page.id;
  const isDropBefore = dropTarget?.pageId === page.id && dropTarget.position === "before";
  const isDropAfter = dropTarget?.pageId === page.id && dropTarget.position === "after";
  const isDropChild = dropTarget?.pageId === page.id && dropTarget.position === "child";

  return (
    <div>
      {isDropBefore && (
        <div className="mx-2 h-0.5 rounded bg-accent-500" style={{ marginLeft: `${depth * 16 + 8}px` }} />
      )}
      <Link
        to="/$workspaceSlug/$pageId"
        params={{ workspaceSlug: params.workspaceSlug || currentWorkspace?.slug || "", pageId: page.id }}
        draggable={canDrag}
        onDragStart={(e) => onDragStart(e, page.id)}
        onDragOver={(e) => onDragOver(e, page.id)}
        onDragLeave={onDragLeave}
        onDragEnd={onDragEnd}
        className={`group flex h-8 items-center gap-1 rounded-md px-2 text-sm transition-colors ${
          isActive ? "bg-accent-500/10 text-accent-400" : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200"
        } ${isDragged ? "opacity-40" : ""} ${isDropChild ? "ring-1 ring-accent-500/50" : ""}`}
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

        <span className="truncate">{page.title || DEFAULT_PAGE_TITLE}</span>

        {canCreate && (
          <button
            onClick={handleCreateSubpage}
            disabled={creating}
            className="ml-auto flex h-6 w-6 shrink-0 items-center justify-center rounded opacity-0 hover:bg-zinc-700 group-hover:opacity-100 disabled:opacity-50"
            tabIndex={-1}
            aria-label="Create subpage"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        )}

        {canArchive && (
          <div ref={menuRef} className="relative shrink-0">
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setMenuOpen((v) => !v);
              }}
              className="flex h-6 w-6 items-center justify-center rounded opacity-0 hover:bg-zinc-700 group-hover:opacity-100"
              tabIndex={-1}
              aria-label="Page options"
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </button>
            {menuOpen && (
              <div className="animate-scale-fade origin-top-right absolute right-0 top-full z-20 mt-1 w-32 rounded-md border border-zinc-700 bg-zinc-800 shadow-lg">
                <button
                  onClick={handleArchive}
                  disabled={archiving}
                  className="flex w-full cursor-pointer items-center gap-2 rounded-sm px-3 py-1.5 text-xs text-red-400 hover:bg-zinc-700 disabled:opacity-50"
                >
                  <Trash2 className="h-3 w-3" />
                  {archiving ? "Archiving..." : "Archive"}
                </button>
              </div>
            )}
          </div>
        )}
      </Link>

      {isDropAfter && (
        <div className="mx-2 h-0.5 rounded bg-accent-500" style={{ marginLeft: `${depth * 16 + 8}px` }} />
      )}

      {isExpanded && hasChildren && (
        <div>
          {childPages.map((child) => (
            <PageTreeItem
              key={child.id}
              page={child}
              depth={depth + 1}
              childPages={allPages.filter((p) => p.parent_id === child.id && !p.archived_at)}
              allPages={allPages}
              activeAncestorIds={activeAncestorIds}
              draggedId={draggedId}
              dropTarget={dropTarget}
              onDragStart={onDragStart}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDragEnd={onDragEnd}
              canDrag={canDrag}
            />
          ))}
        </div>
      )}
    </div>
  );
}
