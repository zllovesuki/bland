import { useState, useCallback, useRef } from "react";
import type { Page } from "@/shared/types";

export type DropPosition = "before" | "after" | "child";

export interface DropTarget {
  pageId: string;
  position: DropPosition;
}

/** Check if `targetId` is a descendant of `draggedId` in the page tree. */
export function isDescendant(allPages: Page[], draggedId: string, targetId: string): boolean {
  const byId = new Map(allPages.map((p) => [p.id, p]));
  let cur = byId.get(targetId);
  while (cur) {
    if (cur.parent_id === draggedId) return true;
    cur = cur.parent_id ? byId.get(cur.parent_id) : undefined;
  }
  return false;
}

/** Compute the fractional position for inserting between two siblings. */
export function computePosition(siblings: Page[], index: number): number {
  if (siblings.length === 0) return 1;
  if (index <= 0) return siblings[0].position - 1;
  if (index >= siblings.length) return siblings[siblings.length - 1].position + 1;
  return (siblings[index - 1].position + siblings[index].position) / 2;
}

export function usePageDrag(allPages: Page[]) {
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const draggedIdRef = useRef<string | null>(null);

  const onDragStart = useCallback((e: React.DragEvent, pageId: string) => {
    draggedIdRef.current = pageId;
    setDraggedId(pageId);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", pageId);
  }, []);

  const onDragOver = useCallback(
    (e: React.DragEvent, targetPageId: string) => {
      e.preventDefault();
      const dragged = draggedIdRef.current;
      if (!dragged || dragged === targetPageId) {
        setDropTarget(null);
        return;
      }
      if (isDescendant(allPages, dragged, targetPageId)) {
        setDropTarget(null);
        return;
      }

      e.dataTransfer.dropEffect = "move";
      const rect = e.currentTarget.getBoundingClientRect();
      const y = e.clientY - rect.top;
      const third = rect.height / 3;

      let position: DropPosition;
      if (y < third) position = "before";
      else if (y > third * 2) position = "after";
      else position = "child";

      setDropTarget({ pageId: targetPageId, position });
    },
    [allPages],
  );

  const onDragLeave = useCallback((e: React.DragEvent) => {
    const related = e.relatedTarget as Node | null;
    if (!related || !e.currentTarget.contains(related)) {
      setDropTarget(null);
    }
  }, []);

  const onDragEnd = useCallback(() => {
    draggedIdRef.current = null;
    setDraggedId(null);
    setDropTarget(null);
  }, []);

  return { draggedId, dropTarget, onDragStart, onDragOver, onDragLeave, onDragEnd, setDropTarget };
}
