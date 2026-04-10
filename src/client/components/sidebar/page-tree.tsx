import { useMemo, useCallback } from "react";
import { useParams } from "@tanstack/react-router";
import { useWorkspaceStore, selectActiveWorkspace, selectActivePages } from "@/client/stores/workspace-store";
import { useOnline } from "@/client/hooks/use-online";
import { usePageDrag, computePosition } from "@/client/hooks/use-page-drag";
import { api } from "@/client/lib/api";
import { toast } from "@/client/components/toast";
import { PageTreeItem } from "./page-tree-item";

export function PageTree() {
  const pages = useWorkspaceStore(selectActivePages);
  const currentWorkspace = useWorkspaceStore(selectActiveWorkspace);
  const accessMode = useWorkspaceStore((s) => s.activeAccessMode);
  const updatePage = useWorkspaceStore((s) => s.updatePageInSnapshot);
  const params = useParams({ strict: false }) as { pageId?: string };
  const online = useOnline();

  const activePages = pages.filter((p) => !p.archived_at).sort((a, b) => a.position - b.position);
  const { draggedId, dropTarget, onDragStart, onDragOver, onDragLeave, onDragEnd, setDropTarget } =
    usePageDrag(activePages);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      if (!dropTarget || !draggedId || !currentWorkspace) return;

      const { pageId: targetId, position: dropPos } = dropTarget;
      const target = activePages.find((p) => p.id === targetId);
      if (!target) return;

      let newParentId: string | null;
      let newPosition: number;

      if (dropPos === "child") {
        newParentId = targetId;
        const children = activePages.filter((p) => p.parent_id === targetId);
        newPosition = computePosition(children, children.length);
      } else {
        newParentId = target.parent_id;
        const siblings = activePages.filter((p) => p.parent_id === target.parent_id);
        const filtered = siblings.filter((p) => p.id !== draggedId);
        const adjustedTarget = filtered.findIndex((p) => p.id === targetId);
        const adjustedIndex = dropPos === "before" ? adjustedTarget : adjustedTarget + 1;
        newPosition = computePosition(filtered, adjustedIndex);
      }

      // Optimistic update
      const draggedPage = activePages.find((p) => p.id === draggedId);
      const oldParentId = draggedPage?.parent_id ?? null;
      const oldPosition = draggedPage?.position ?? 0;

      updatePage(currentWorkspace.id, draggedId, { parent_id: newParentId, position: newPosition });
      onDragEnd();

      try {
        await api.pages.update(currentWorkspace.id, draggedId, {
          parent_id: newParentId,
          position: newPosition,
        });
      } catch {
        updatePage(currentWorkspace.id, draggedId, { parent_id: oldParentId, position: oldPosition });
        toast.error("Failed to move page");
      }
    },
    [dropTarget, draggedId, currentWorkspace, activePages, updatePage, onDragEnd],
  );

  const activeAncestorIds = useMemo(() => {
    const ids = new Set<string>();
    if (!params.pageId) return ids;
    const byId = new Map(activePages.map((p) => [p.id, p]));
    let cur = byId.get(params.pageId);
    while (cur?.parent_id) {
      ids.add(cur.parent_id);
      cur = byId.get(cur.parent_id);
    }
    return ids;
  }, [params.pageId, activePages]);

  const rootPages = activePages.filter((p) => p.parent_id === null);

  if (activePages.length === 0) {
    return <div className="px-3 py-4 text-center text-xs text-zinc-600">No pages yet</div>;
  }

  return (
    <div className="space-y-0.5 py-1" onDrop={handleDrop} onDragOver={(e) => e.preventDefault()}>
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
            activeAncestorIds={activeAncestorIds}
            draggedId={draggedId}
            dropTarget={dropTarget}
            onDragStart={onDragStart}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDragEnd={onDragEnd}
            canDrag={online && accessMode !== "shared"}
          />
        </div>
      ))}
    </div>
  );
}
