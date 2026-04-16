import { useCallback, useRef, useState } from "react";
import type { Page } from "@/shared/types";
import { MAX_TREE_DEPTH } from "@/shared/constants";

export const INDENT_PX = 16;
export const ROW_PADDING_PX = 8;
export const TOP_CAP_PX = 12;
export const BOTTOM_CAP_PX = 24;

// A DropIntent is the user's semantic choice across three X-zones. The pointer X
// within the sidebar is split into equal thirds and each third maps to one intent.
// The continuous-depth model was abandoned because users could not reliably aim
// at narrow (16px) depth rails; three wide zones are bigger targets and self-evident.
export type DropIntent = "root" | "sibling" | "child";

export type DropInvalidReason = "self" | "cycle" | "depth" | "noop";

// A DropSlot is the vertical gap between two adjacent rows. `above` is the row
// whose bottom edge forms the top of the gap; `below` forms the bottom. Either
// can be null at the list ends (top cap / bottom cap).
export interface DropSlot {
  above: { id: string; depth: number } | null;
  below: { id: string; depth: number } | null;
}

// A DropTarget is the fully-resolved drop proposal for a given pointer position.
// `intent` is the X-zone bucket, `depth` is where the preview is drawn, and
// `parentId`/`slot` together determine the insertion (parent, index) the server needs.
export interface DropTarget {
  slot: DropSlot;
  intent: DropIntent;
  depth: number;
  parentId: string | null;
  valid: boolean;
  reason?: DropInvalidReason;
}

// Walks parent links from `targetId` upward. Returns true iff `draggedId` is an
// ancestor of `targetId`. Used to block moves that would create a cycle.
export function isDescendant(allPages: Page[], draggedId: string, targetId: string): boolean {
  const byId = new Map(allPages.map((p) => [p.id, p]));
  let cur = byId.get(targetId);
  while (cur) {
    if (cur.parent_id === draggedId) return true;
    cur = cur.parent_id ? byId.get(cur.parent_id) : undefined;
  }
  return false;
}

// Picks a fractional position between adjacent siblings. Positions are floats
// so insertions never require rewriting neighbors; the midpoint between two
// existing positions is always insertable. Extreme positions (before first /
// after last) shift by ±1 to leave room for future inserts on the same side.
export function computePosition(siblings: Page[], index: number): number {
  if (siblings.length === 0) return 1;
  if (index <= 0) return siblings[0].position - 1;
  if (index >= siblings.length) return siblings[siblings.length - 1].position + 1;
  return (siblings[index - 1].position + siblings[index].position) / 2;
}

function getPageDepth(byId: Map<string, Page>, pageId: string): number {
  let cur = byId.get(pageId);
  let depth = 0;
  while (cur?.parent_id) {
    cur = byId.get(cur.parent_id);
    depth += 1;
  }
  return depth;
}

// Returns the depth of the deepest non-archived descendant under `pageId`.
// Used to check whether the dragged subtree would exceed MAX_TREE_DEPTH at
// its new location (a one-node move from depth 2 to depth 8 is fine, but if
// that node has its own 3-deep subtree, the leaves would land at depth 11).
export function getSubtreeDepth(allPages: Page[], pageId: string): number {
  const children = allPages.filter((p) => p.parent_id === pageId && !p.archived_at);
  if (children.length === 0) return 0;
  return 1 + Math.max(...children.map((c) => getSubtreeDepth(allPages, c.id)));
}

function resolveAncestorAtDepth(
  byId: Map<string, Page>,
  startId: string,
  startDepth: number,
  targetDepth: number,
): Page | null {
  let cur: Page | undefined = byId.get(startId);
  let curDepth = startDepth;
  while (cur && curDepth > targetDepth) {
    if (!cur.parent_id) return null;
    cur = byId.get(cur.parent_id);
    curDepth -= 1;
  }
  return cur ?? null;
}

// Given a slot and the user's target depth, finds the parent_id that a page
// dropped at (slot, depth) should have. The logic:
//   - depth 0 always means root (parent = null), regardless of slot
//   - depth = above.depth + 1 means "nest as child of the row above"
//   - depth = above.depth means "sibling of the row above" (share its parent)
//   - depth < above.depth means "outdent": walk up above's ancestors to find
//     the one at `depth`, and share its parent
// Kept as a standalone helper because the arithmetic is easy to get wrong,
// and the tests cover all four branches directly.
export function resolveParent(slot: DropSlot, depth: number, byId: Map<string, Page>): string | null {
  if (depth === 0) return null;
  const above = slot.above;
  if (!above) return null;
  if (depth === above.depth + 1) return above.id;
  const ancestor = resolveAncestorAtDepth(byId, above.id, above.depth, depth);
  return ancestor?.parent_id ?? null;
}

function findSiblingForParent(pageId: string, newParentId: string | null, byId: Map<string, Page>): Page | null {
  let cur: Page | undefined = byId.get(pageId);
  while (cur) {
    if (cur.parent_id === newParentId) return cur;
    cur = cur.parent_id ? byId.get(cur.parent_id) : undefined;
  }
  return null;
}

// Returns the insertion index within the new parent's sibling list. Complicated
// because the visible gap can sit inside a subtree while the target sibling list
// lives higher up. Prefer `slot.below` so the rendered gap is authoritative:
// if the next visible row belongs to the target sibling list (directly or via an
// ancestor), insert before it. Fall back to `slot.above` only when the gap is at
// the end of that sibling list.
export function resolveInsertionIndex(
  slot: DropSlot,
  newParentId: string | null,
  byId: Map<string, Page>,
  siblings: Page[],
): number {
  if (slot.below) {
    const belowSibling = findSiblingForParent(slot.below.id, newParentId, byId);
    if (belowSibling) {
      const idx = siblings.findIndex((s) => s.id === belowSibling.id);
      if (idx !== -1) return idx;
    }
  }

  if (!slot.above) return 0;
  if (slot.above.id === newParentId) return siblings.length;
  const aboveSibling = findSiblingForParent(slot.above.id, newParentId, byId);
  if (!aboveSibling) return siblings.length;
  const idx = siblings.findIndex((s) => s.id === aboveSibling.id);
  return idx === -1 ? siblings.length : idx + 1;
}

// DOM geometry snapshot for a single row. Kept as a plain data shape so the
// resolver is pure (testable without a real DOM).
export interface RowRect {
  id: string;
  depth: number;
  top: number;
  bottom: number;
}

function readVisibleRowRects(container: HTMLElement): RowRect[] {
  const nodes = container.querySelectorAll<HTMLElement>("[data-page-row]");
  const rects: RowRect[] = [];
  nodes.forEach((node) => {
    const id = node.dataset.pageId;
    const depthStr = node.dataset.depth;
    if (!id || depthStr === undefined) return;
    const depth = Number.parseInt(depthStr, 10);
    if (!Number.isFinite(depth)) return;
    const rect = node.getBoundingClientRect();
    if (rect.height <= 0) return;
    rects.push({ id, depth, top: rect.top, bottom: rect.bottom });
  });
  return rects;
}

interface ResolveDropTargetArgs {
  rects: RowRect[];
  containerLeft: number;
  containerWidth: number;
  clientX: number;
  clientY: number;
  draggedId: string;
  allPages: Page[];
}

// Pure function: given DOM-derived rects and pointer coords, returns the drop
// proposal. Split into two phases:
//   (1) Y-slot resolution — the gap between two rows (or a cap at either end)
//   (2) X-zone resolution — root / sibling / child, then validation
// Keeping this pure makes the whole drop contract unit-testable; the DOM-reading
// sibling computeDropTarget is a thin wrapper.
export function resolveDropTarget(args: ResolveDropTargetArgs): DropTarget {
  const { rects, containerLeft, containerWidth, clientX, clientY, draggedId, allPages } = args;
  const byId = new Map(allPages.map((p) => [p.id, p]));
  const draggedSubtreeDepth = getSubtreeDepth(allPages, draggedId);

  // --- Phase 1: pick the Y slot. ---
  // The slot is determined entirely by pointer Y. Each row's midpoint divides
  // "insert before this row" from "insert after this row" — same model the
  // editor's block drag handle uses.
  let slot: DropSlot;

  if (rects.length === 0) {
    slot = { above: null, below: null };
  } else if (clientY < rects[0].top) {
    slot = { above: null, below: { id: rects[0].id, depth: rects[0].depth } };
  } else if (clientY > rects[rects.length - 1].bottom) {
    const last = rects[rects.length - 1];
    slot = { above: { id: last.id, depth: last.depth }, below: null };
  } else {
    let idx = rects.findIndex((r) => clientY >= r.top && clientY <= r.bottom);
    if (idx === -1) {
      idx = rects.findIndex((r) => clientY < r.top);
      if (idx === -1) idx = rects.length - 1;
    }
    const row = rects[idx];
    const midpoint = (row.top + row.bottom) / 2;
    if (clientY < midpoint) {
      const prev = idx > 0 ? rects[idx - 1] : null;
      slot = {
        above: prev ? { id: prev.id, depth: prev.depth } : null,
        below: { id: row.id, depth: row.depth },
      };
    } else {
      const next = idx < rects.length - 1 ? rects[idx + 1] : null;
      slot = {
        above: { id: row.id, depth: row.depth },
        below: next ? { id: next.id, depth: next.depth } : null,
      };
    }
  }

  // --- Phase 2: pick the X zone and resolve depth/parent. ---
  // The anchor for zone semantics is slot.above: "sibling" and "child" are
  // defined relative to the row immediately above the gap. At the top cap
  // there is no anchor, so only "root" is meaningful.
  const anchor = slot.above ? (byId.get(slot.above.id) ?? null) : null;
  const anchorDepth = slot.above?.depth ?? 0;

  // Split the container into three equal-width X zones. Thirds (vs. rail-
  // anchored boundaries) guarantee each zone is wide enough to aim at and
  // survives pointer jitter.
  const offsetX = clientX - containerLeft;
  const thirdWidth = containerWidth / 3;

  let intent: DropIntent;
  if (!anchor) {
    intent = "root";
  } else if (offsetX < thirdWidth) {
    intent = "root";
  } else if (offsetX < 2 * thirdWidth) {
    intent = "sibling";
  } else {
    intent = "child";
  }

  // Degenerate collapse: when the anchor is already at depth 0, "root" and
  // "sibling" both resolve to (depth 0, parent null). Pick "sibling" so the
  // chip reads "After X" (more informative than "Root level").
  if (intent === "root" && anchor && anchorDepth === 0) intent = "sibling";

  let depth: number;
  let parentId: string | null;
  if (intent === "root" || !anchor) {
    depth = 0;
    parentId = null;
  } else if (intent === "sibling") {
    depth = anchorDepth;
    parentId = anchor.parent_id;
  } else {
    depth = anchorDepth + 1;
    parentId = anchor.id;
  }

  // --- Validation. ---
  // Mirrors the server's validatePageMove (self-parent, cycle, depth). The
  // client check is cosmetic (server is still authoritative); it just lets
  // the preview show a red-tinted invalid state before the drop fires.
  let valid = true;
  let reason: DropInvalidReason | undefined;

  if (parentId === draggedId) {
    valid = false;
    reason = "self";
  } else if (parentId !== null && isDescendant(allPages, draggedId, parentId)) {
    valid = false;
    reason = "cycle";
  } else if (depth + draggedSubtreeDepth > MAX_TREE_DEPTH - 1) {
    valid = false;
    reason = "depth";
  } else {
    // No-op detection: if the preview's resolved (parent, depth) matches the
    // dragged row's current (parent, depth) AND the dragged row is adjacent
    // to the slot, the drop wouldn't change anything. Suppress the preview
    // and block the PATCH.
    const dragged = byId.get(draggedId);
    if (dragged) {
      const draggedDepth = getPageDepth(byId, draggedId);
      const adjacent =
        (slot.above?.id === draggedId || slot.below?.id === draggedId) &&
        depth === draggedDepth &&
        parentId === dragged.parent_id;
      if (adjacent) {
        valid = false;
        reason = "noop";
      }
    }
  }

  return { slot, intent, depth, parentId, valid, reason };
}

interface ComputeDropTargetArgs {
  container: HTMLElement;
  clientX: number;
  clientY: number;
  draggedId: string;
  allPages: Page[];
}

export function computeDropTarget(args: ComputeDropTargetArgs): DropTarget | null {
  const { container, clientX, clientY, draggedId, allPages } = args;
  const rects = readVisibleRowRects(container);
  const containerRect = container.getBoundingClientRect();
  return resolveDropTarget({
    rects,
    containerLeft: containerRect.left,
    containerWidth: containerRect.width,
    clientX,
    clientY,
    draggedId,
    allPages,
  });
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

  const updateFromEvent = useCallback(
    (e: React.DragEvent, container: HTMLElement) => {
      e.preventDefault();
      const dragged = draggedIdRef.current;
      if (!dragged) {
        setDropTarget(null);
        return;
      }
      const next = computeDropTarget({
        container,
        clientX: e.clientX,
        clientY: e.clientY,
        draggedId: dragged,
        allPages,
      });
      if (next) {
        e.dataTransfer.dropEffect = next.valid ? "move" : "none";
        setDropTarget(next);
      } else {
        setDropTarget(null);
      }
    },
    [allPages],
  );

  const onDragEnd = useCallback(() => {
    draggedIdRef.current = null;
    setDraggedId(null);
    setDropTarget(null);
  }, []);

  return { draggedId, dropTarget, onDragStart, updateFromEvent, onDragEnd };
}
