import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "@tanstack/react-router";
import { FileText } from "lucide-react";
import {
  useWorkspacePages,
  useCurrentWorkspace,
  useWorkspaceMembers,
} from "@/client/components/workspace/use-workspace-view";
import { useWorkspaceStore } from "@/client/stores/workspace-store";
import { useOnline } from "@/client/hooks/use-online";
import { usePageDrag, computePosition, resolveInsertionIndex, type DropTarget } from "@/client/hooks/use-page-drag";
import { api, toApiError } from "@/client/lib/api";
import { toast } from "@/client/components/toast";
import { DEFAULT_PAGE_TITLE, MAX_TREE_DEPTH } from "@/shared/constants";
import type { Page } from "@/shared/types";
import { EmojiIcon } from "@/client/components/ui/emoji-icon";
import { useAuthStore } from "@/client/stores/auth-store";
import { getMyRole } from "@/client/lib/workspace-role";
import { deriveSidebarBaseAffordance } from "@/client/lib/affordance/sidebar";
import { isActionEnabled } from "@/client/lib/affordance/action-state";
import { SIDEBAR_TREE_INDENT_PX, SIDEBAR_TREE_ROW_PADDING_PX } from "./tree-metrics";
import { PageTreeItem } from "./page-tree-item";
import "./page-tree-drag.css";

interface PageTreeProps {
  alwaysShowActions?: boolean;
  menuZIndex?: number;
}

const AUTO_EXPAND_DELAY_MS = 500;
const EDGE_SCROLL_THRESHOLD_PX = 40;
const EDGE_SCROLL_SPEED_PX = 4;

export function PageTree({ alwaysShowActions = false, menuZIndex }: PageTreeProps) {
  const pages = useWorkspacePages();
  const currentWorkspace = useCurrentWorkspace();
  const updatePage = useWorkspaceStore((s) => s.updatePageInSnapshot);
  const params = useParams({ strict: false }) as { pageId?: string };
  const online = useOnline();
  const members = useWorkspaceMembers();
  const currentUser = useAuthStore((s) => s.user);
  const workspaceRole = getMyRole(members, currentUser) ?? "none";
  const baseAffordance = deriveSidebarBaseAffordance({ workspaceRole, online });
  const canDrag = isActionEnabled(baseAffordance.dragTree);

  const activePages = useMemo(
    () => pages.filter((p) => !p.archived_at).sort((a, b) => a.position - b.position),
    [pages],
  );
  const { draggedId, dropTarget, onDragStart, updateFromEvent, onDragEnd } = usePageDrag(activePages);

  const containerRef = useRef<HTMLDivElement>(null);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const [expandedDuringDrag, setExpandedDuringDrag] = useState<Set<string>>(new Set());
  const autoExpandTimer = useRef<number | null>(null);
  const autoExpandCandidate = useRef<string | null>(null);

  const scrollDirection = useRef<1 | -1 | 0>(0);
  const scrollRaf = useRef<number | null>(null);
  const scrollParent = useRef<HTMLElement | null>(null);

  const byId = useMemo(() => new Map(activePages.map((p) => [p.id, p])), [activePages]);
  const draggedPage = draggedId ? (byId.get(draggedId) ?? null) : null;

  const findScrollParent = useCallback((node: HTMLElement): HTMLElement | null => {
    let cur: HTMLElement | null = node.parentElement;
    while (cur) {
      const style = window.getComputedStyle(cur);
      if (/auto|scroll/.test(style.overflowY) && cur.scrollHeight > cur.clientHeight) return cur;
      cur = cur.parentElement;
    }
    return null;
  }, []);

  const stopAutoScroll = useCallback(() => {
    scrollDirection.current = 0;
    if (scrollRaf.current !== null) {
      cancelAnimationFrame(scrollRaf.current);
      scrollRaf.current = null;
    }
  }, []);

  const tickAutoScroll = useCallback(() => {
    if (scrollDirection.current === 0 || !scrollParent.current) {
      scrollRaf.current = null;
      return;
    }
    scrollParent.current.scrollTop += scrollDirection.current * EDGE_SCROLL_SPEED_PX;
    scrollRaf.current = requestAnimationFrame(tickAutoScroll);
  }, []);

  const updateAutoScroll = useCallback(
    (clientY: number) => {
      if (!scrollParent.current) return;
      const rect = scrollParent.current.getBoundingClientRect();
      let dir: 1 | -1 | 0 = 0;
      if (clientY < rect.top + EDGE_SCROLL_THRESHOLD_PX && scrollParent.current.scrollTop > 0) {
        dir = -1;
      } else if (
        clientY > rect.bottom - EDGE_SCROLL_THRESHOLD_PX &&
        scrollParent.current.scrollTop + scrollParent.current.clientHeight < scrollParent.current.scrollHeight
      ) {
        dir = 1;
      }
      if (dir !== scrollDirection.current) {
        scrollDirection.current = dir;
        if (dir !== 0 && scrollRaf.current === null) {
          scrollRaf.current = requestAnimationFrame(tickAutoScroll);
        }
      }
    },
    [tickAutoScroll],
  );

  const clearAutoExpand = useCallback(() => {
    if (autoExpandTimer.current !== null) {
      window.clearTimeout(autoExpandTimer.current);
      autoExpandTimer.current = null;
    }
    autoExpandCandidate.current = null;
  }, []);

  const scheduleAutoExpand = useCallback(
    (candidateId: string | null) => {
      if (autoExpandCandidate.current === candidateId) return;
      clearAutoExpand();
      autoExpandCandidate.current = candidateId;
      if (!candidateId) return;
      autoExpandTimer.current = window.setTimeout(() => {
        setExpandedDuringDrag((prev) => {
          if (prev.has(candidateId)) return prev;
          const next = new Set(prev);
          next.add(candidateId);
          return next;
        });
        autoExpandTimer.current = null;
      }, AUTO_EXPAND_DELAY_MS);
    },
    [clearAutoExpand],
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      if (!containerRef.current) return;
      if (!scrollParent.current) {
        scrollParent.current = findScrollParent(containerRef.current);
      }
      updateFromEvent(e, containerRef.current);
      setCursor({ x: e.clientX, y: e.clientY });
      updateAutoScroll(e.clientY);
    },
    [updateFromEvent, findScrollParent, updateAutoScroll],
  );

  const handleDragLeave = useCallback(
    (e: React.DragEvent) => {
      const related = e.relatedTarget as Node | null;
      if (!related || !containerRef.current?.contains(related)) {
        setCursor(null);
        stopAutoScroll();
        clearAutoExpand();
      }
    },
    [stopAutoScroll, clearAutoExpand],
  );

  const resetDragUi = useCallback(() => {
    setCursor(null);
    setExpandedDuringDrag(new Set());
    stopAutoScroll();
    clearAutoExpand();
  }, [stopAutoScroll, clearAutoExpand]);

  const handleDragEnd = useCallback(() => {
    onDragEnd();
    resetDragUi();
  }, [onDragEnd, resetDragUi]);

  useEffect(() => {
    if (!draggedId) {
      resetDragUi();
    }
  }, [draggedId, resetDragUi]);

  useEffect(() => {
    const candidate =
      draggedId && dropTarget?.valid && dropTarget.parentId && !expandedDuringDrag.has(dropTarget.parentId)
        ? dropTarget.parentId
        : null;
    scheduleAutoExpand(candidate);
  }, [draggedId, dropTarget, expandedDuringDrag, scheduleAutoExpand]);

  useEffect(() => {
    return () => {
      stopAutoScroll();
      clearAutoExpand();
    };
  }, [stopAutoScroll, clearAutoExpand]);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      if (!canDrag) return;
      const target = dropTarget;
      const dragged = draggedId;
      onDragEnd();
      resetDragUi();

      if (!target || !target.valid || !dragged || !currentWorkspace) return;

      const newParentId = target.parentId;
      const siblings = activePages
        .filter((p) => p.parent_id === newParentId && p.id !== dragged)
        .sort((a, b) => a.position - b.position);
      const insertionIndex = resolveInsertionIndex(target.slot, newParentId, byId, siblings);
      const newPosition = computePosition(siblings, insertionIndex);

      const draggedPageRow = byId.get(dragged);
      const oldParentId = draggedPageRow?.parent_id ?? null;
      const oldPosition = draggedPageRow?.position ?? 0;

      if (newParentId === oldParentId && newPosition === oldPosition) return;

      if (siblings.length >= 2) {
        const gap = Math.abs((siblings[insertionIndex - 1]?.position ?? 0) - (siblings[insertionIndex]?.position ?? 0));
        if (gap > 0 && gap < 1e-6) {
          console.warn("page-tree: fractional position gap collapsing", { gap, newParentId });
        }
      }

      updatePage(currentWorkspace.id, dragged, { parent_id: newParentId, position: newPosition });

      try {
        await api.pages.update(currentWorkspace.id, dragged, {
          parent_id: newParentId,
          position: newPosition,
        });
      } catch (err) {
        updatePage(currentWorkspace.id, dragged, { parent_id: oldParentId, position: oldPosition });
        const apiErr = toApiError(err);
        toast.error(apiErr.message || "Failed to move page");
      }
    },
    [canDrag, dropTarget, draggedId, currentWorkspace, activePages, byId, onDragEnd, resetDragUi, updatePage],
  );

  const activeAncestorIds = useMemo(() => {
    const ids = new Set<string>();
    if (!params.pageId) return ids;
    let cur = byId.get(params.pageId);
    while (cur?.parent_id) {
      ids.add(cur.parent_id);
      cur = byId.get(cur.parent_id);
    }
    return ids;
  }, [params.pageId, byId]);

  const rootPages = useMemo(() => activePages.filter((p) => p.parent_id === null), [activePages]);

  if (activePages.length === 0) {
    return <div className="px-3 py-4 text-center text-xs text-zinc-400">No pages yet</div>;
  }

  const showPreview = !!(draggedId && dropTarget && dropTarget.reason !== "noop");
  const dropAnchorId = showPreview && dropTarget?.slot.below ? dropTarget.slot.below.id : null;
  const renderDropPreview = useCallback(
    () => (dropTarget ? <DropSlotPreview target={dropTarget} draggedPage={draggedPage} /> : null),
    [dropTarget, draggedPage],
  );

  return (
    <div
      ref={containerRef}
      className="relative min-h-full space-y-0.5 py-1"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {rootPages.map((page, i) => (
        <div
          key={page.id}
          className="opacity-0 animate-slide-up"
          style={{ animationDelay: `${Math.min(i, 7) * 60}ms` }}
        >
          <PageTreeItem
            page={page}
            depth={0}
            childPages={activePages.filter((p) => p.parent_id === page.id)}
            allPages={activePages}
            alwaysShowActions={alwaysShowActions}
            activeAncestorIds={activeAncestorIds}
            expandedDuringDrag={expandedDuringDrag}
            draggedId={draggedId}
            dropAnchorId={dropAnchorId}
            renderDropPreview={renderDropPreview}
            menuZIndex={menuZIndex}
            onDragStart={onDragStart}
            onDragEnd={handleDragEnd}
            canDrag={canDrag}
            workspaceRole={workspaceRole}
            online={online}
          />
        </div>
      ))}
      {showPreview && dropTarget && dropTarget.slot.below === null && (
        <DropSlotPreview target={dropTarget} draggedPage={draggedPage} />
      )}
      {draggedId && dropTarget && cursor && dropTarget.reason !== "noop" && (
        <DragStatusChip target={dropTarget} cursor={cursor} byId={byId} />
      )}
    </div>
  );
}

function DropSlotPreview({ target, draggedPage }: { target: DropTarget; draggedPage: Page | null }) {
  const { depth, intent, valid } = target;
  const title = draggedPage?.title || DEFAULT_PAGE_TITLE;
  const icon = draggedPage?.icon ?? null;
  // paddingLeft mirrors the real row's paddingLeft exactly (same formula used
  // in page-tree-item.tsx), so the previewed landing position is where the
  // dropped row will actually render.
  const variant = !valid
    ? "page-tree-drop-placeholder--invalid"
    : intent === "root"
      ? "page-tree-drop-placeholder--root"
      : intent === "child"
        ? "page-tree-drop-placeholder--child"
        : "";

  return (
    <div
      className={`page-tree-drop-placeholder ${variant}`}
      style={{ paddingLeft: `${depth * SIDEBAR_TREE_INDENT_PX + SIDEBAR_TREE_ROW_PADDING_PX}px` }}
      aria-hidden
    >
      {/* Invisible spacer matching the real row's chevron column (w-5 = 20px).
          Without it, the preview's icon lands ~24px left of where the dropped
          row's icon will render. */}
      <span className="page-tree-drop-placeholder-chevron" />
      <span className="page-tree-drop-placeholder-icon">
        {icon ? <EmojiIcon emoji={icon} size={14} /> : <FileText className="h-3.5 w-3.5 text-zinc-500" />}
      </span>
      <span className="page-tree-drop-placeholder-label">{title}</span>
    </div>
  );
}

function DragStatusChip({
  target,
  cursor,
  byId,
}: {
  target: DropTarget;
  cursor: { x: number; y: number };
  byId: Map<string, Page>;
}) {
  const message = chipMessage(target, byId);
  if (!message) return null;
  return (
    <div
      className={`page-tree-drag-chip ${target.valid ? "" : "page-tree-drag-chip--invalid"}`}
      style={{ top: cursor.y + 14, left: cursor.x + 14 }}
    >
      {message}
    </div>
  );
}

function chipMessage(target: DropTarget, byId: Map<string, Page>): string | null {
  if (!target.valid) {
    switch (target.reason) {
      case "self":
        return "Can't move a page into itself";
      case "cycle":
        return "Can't nest a page inside its own subtree";
      case "depth":
        return `Maximum nesting depth (${MAX_TREE_DEPTH}) reached`;
      case "noop":
        return null;
      default:
        return "Can't drop here";
    }
  }
  // The anchor is the row immediately above the insertion gap; sibling/child
  // messages are phrased in terms of that anchor so the user sees an explicit
  // reference to what they're next to / nesting into.
  const anchor = target.slot.above ? byId.get(target.slot.above.id) : null;
  if (target.intent === "root") return "Root level";
  if (target.intent === "child" && anchor) {
    return `Inside "${anchor.title || DEFAULT_PAGE_TITLE}"`;
  }
  if (target.intent === "sibling" && anchor) {
    return `After "${anchor.title || DEFAULT_PAGE_TITLE}"`;
  }
  return "Root level";
}
