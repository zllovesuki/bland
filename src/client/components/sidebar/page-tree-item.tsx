import { useCallback, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { ChevronRight, FileText, MoreHorizontal, Plus, Trash2 } from "lucide-react";
import type { Page } from "@/shared/types";
import { DEFAULT_PAGE_TITLE } from "@/shared/constants";
import { api } from "@/client/lib/api";
import { useWorkspaceStore } from "@/client/stores/workspace-store";
import { useAuthStore } from "@/client/stores/auth-store";
import { canArchivePage } from "@/client/lib/permissions";
import { useClickOutside } from "@/client/hooks/use-click-outside";

interface PageTreeItemProps {
  page: Page;
  depth: number;
  childPages: Page[];
  allPages: Page[];
}

export function PageTreeItem({ page, depth, childPages, allPages }: PageTreeItemProps) {
  const params = useParams({ strict: false }) as {
    workspaceSlug?: string;
    pageId?: string;
  };
  const navigate = useNavigate();
  const currentWorkspace = useWorkspaceStore((s) => s.currentWorkspace);
  const archivePage = useWorkspaceStore((s) => s.archivePage);
  const addPage = useWorkspaceStore((s) => s.addPage);
  const members = useWorkspaceStore((s) => s.members);
  const currentUser = useAuthStore((s) => s.user);
  const canArchive = canArchivePage(members, currentUser, page);
  const myMembership = members.find((m) => m.user_id === currentUser?.id);
  const canCreate = !!myMembership && myMembership.role !== "guest";
  const [isExpanded, setIsExpanded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [creating, setCreating] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const isActive = params.pageId === page.id;
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
      setArchiving(true);
      try {
        await api.pages.delete(currentWorkspace.id, page.id);
        archivePage(page.id);
        if (params.pageId === page.id) {
          navigate({ to: "/$workspaceSlug", params: { workspaceSlug: params.workspaceSlug ?? "" } });
        }
      } finally {
        setArchiving(false);
        setMenuOpen(false);
      }
    },
    [currentWorkspace, archiving, page.id, archivePage, params.pageId, params.workspaceSlug, navigate],
  );

  const handleCreateSubpage = useCallback(
    async (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!currentWorkspace || creating) return;
      setCreating(true);
      try {
        const newPage = await api.pages.create(currentWorkspace.id, {
          title: DEFAULT_PAGE_TITLE,
          parent_id: page.id,
        });
        addPage(newPage);
        setIsExpanded(true);
        navigate({
          to: "/$workspaceSlug/$pageId",
          params: { workspaceSlug: params.workspaceSlug ?? "", pageId: newPage.id },
        });
      } finally {
        setCreating(false);
      }
    },
    [currentWorkspace, creating, page.id, addPage, navigate, params.workspaceSlug],
  );

  return (
    <div>
      <Link
        to="/$workspaceSlug/$pageId"
        params={{ workspaceSlug: params.workspaceSlug ?? "", pageId: page.id }}
        className={`group flex h-8 items-center gap-1 rounded-md px-2 text-sm transition ${
          isActive ? "bg-accent-500/10 text-accent-400" : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200"
        }`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
      >
        <button
          onClick={toggleExpand}
          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded transition ${
            hasChildren ? "text-zinc-500 hover:bg-zinc-700 hover:text-zinc-300" : "pointer-events-none opacity-0"
          }`}
          tabIndex={-1}
          aria-label={isExpanded ? "Collapse" : "Expand"}
        >
          <ChevronRight className={`h-3 w-3 transition-transform ${isExpanded ? "rotate-90" : ""}`} />
        </button>

        <span className="flex h-5 w-5 shrink-0 items-center justify-center text-xs">
          {page.icon ?? <FileText className="h-3.5 w-3.5 text-zinc-500" />}
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
              <div className="absolute right-0 top-full z-20 mt-1 w-32 rounded-md border border-zinc-700 bg-zinc-800 shadow-lg">
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

      {isExpanded && hasChildren && (
        <div>
          {childPages.map((child) => (
            <PageTreeItem
              key={child.id}
              page={child}
              depth={depth + 1}
              childPages={allPages.filter((p) => p.parent_id === child.id && !p.archived_at)}
              allPages={allPages}
            />
          ))}
        </div>
      )}
    </div>
  );
}
