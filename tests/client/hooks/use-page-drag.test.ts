import { describe, expect, it } from "vitest";
import { createPage } from "@tests/client/util/fixtures";
import {
  getSubtreeDepth,
  isDescendant,
  computePosition,
  resolveParent,
  resolveInsertionIndex,
  resolveDropTarget,
  type DropSlot,
  type RowRect,
} from "@/client/hooks/use-page-drag";
import type { Page } from "@/shared/types";

const ROW_HEIGHT = 32;
const CONTAINER_LEFT = 0;
const CONTAINER_WIDTH = 240;
const ROOT_X = 20;
const SIBLING_X = 120;
const CHILD_X = 200;

function rect(id: string, depth: number, index: number): RowRect {
  return {
    id,
    depth,
    top: index * ROW_HEIGHT,
    bottom: (index + 1) * ROW_HEIGHT,
  };
}

function midpointY(index: number): number {
  return index * ROW_HEIGHT + ROW_HEIGHT / 2;
}

describe("getSubtreeDepth", () => {
  it("returns 0 for a leaf page", () => {
    const pages = [createPage({ id: "a" })];
    expect(getSubtreeDepth(pages, "a")).toBe(0);
  });

  it("returns 1 for a parent with only direct children", () => {
    const pages = [
      createPage({ id: "a" }),
      createPage({ id: "b", parent_id: "a" }),
      createPage({ id: "c", parent_id: "a" }),
    ];
    expect(getSubtreeDepth(pages, "a")).toBe(1);
  });

  it("returns the depth of the deepest descendant", () => {
    const pages = [
      createPage({ id: "a" }),
      createPage({ id: "b", parent_id: "a" }),
      createPage({ id: "c", parent_id: "b" }),
      createPage({ id: "d", parent_id: "c" }),
    ];
    expect(getSubtreeDepth(pages, "a")).toBe(3);
  });

  it("ignores archived descendants", () => {
    const pages = [
      createPage({ id: "a" }),
      createPage({ id: "b", parent_id: "a" }),
      createPage({ id: "c", parent_id: "b", archived_at: "2026-04-01T00:00:00Z" }),
    ];
    expect(getSubtreeDepth(pages, "a")).toBe(1);
  });
});

describe("isDescendant", () => {
  const pages = [
    createPage({ id: "a" }),
    createPage({ id: "b", parent_id: "a" }),
    createPage({ id: "c", parent_id: "b" }),
    createPage({ id: "x" }),
  ];

  it("returns true for a direct child", () => {
    expect(isDescendant(pages, "a", "b")).toBe(true);
  });

  it("returns true for a grandchild", () => {
    expect(isDescendant(pages, "a", "c")).toBe(true);
  });

  it("returns false for unrelated pages", () => {
    expect(isDescendant(pages, "a", "x")).toBe(false);
  });

  it("returns false for the page itself", () => {
    expect(isDescendant(pages, "a", "a")).toBe(false);
  });
});

describe("computePosition", () => {
  const siblings = [
    createPage({ id: "a", position: 1 }),
    createPage({ id: "b", position: 2 }),
    createPage({ id: "c", position: 3 }),
  ];

  it("returns 1 for an empty sibling list", () => {
    expect(computePosition([], 0)).toBe(1);
  });

  it("returns below-first for insertion at the start", () => {
    expect(computePosition(siblings, 0)).toBe(0);
  });

  it("returns above-last for insertion at the end", () => {
    expect(computePosition(siblings, siblings.length)).toBe(4);
  });

  it("returns the midpoint between neighbors for interior insertions", () => {
    expect(computePosition(siblings, 1)).toBe(1.5);
    expect(computePosition(siblings, 2)).toBe(2.5);
  });
});

describe("resolveParent", () => {
  const pages: Page[] = [
    createPage({ id: "root1" }),
    createPage({ id: "root2" }),
    createPage({ id: "a", parent_id: "root1" }),
    createPage({ id: "b", parent_id: "a" }),
    createPage({ id: "c", parent_id: "b" }),
  ];
  const byId = new Map(pages.map((p) => [p.id, p]));

  it("returns null when depth is 0", () => {
    const slot: DropSlot = { above: { id: "root1", depth: 0 }, below: null };
    expect(resolveParent(slot, 0, byId)).toBeNull();
  });

  it("returns null when above is absent (top cap)", () => {
    const slot: DropSlot = { above: null, below: { id: "root1", depth: 0 } };
    expect(resolveParent(slot, 0, byId)).toBeNull();
  });

  it("nests as child of above when depth = above.depth + 1", () => {
    const slot: DropSlot = { above: { id: "a", depth: 1 }, below: null };
    expect(resolveParent(slot, 2, byId)).toBe("a");
  });

  it("returns above's parent when depth = above.depth (sibling)", () => {
    const slot: DropSlot = { above: { id: "a", depth: 1 }, below: null };
    expect(resolveParent(slot, 1, byId)).toBe("root1");
  });

  it("walks up ancestors when depth < above.depth (outdent)", () => {
    const slot: DropSlot = { above: { id: "c", depth: 3 }, below: null };
    expect(resolveParent(slot, 2, byId)).toBe("a");
    expect(resolveParent(slot, 1, byId)).toBe("root1");
    expect(resolveParent(slot, 0, byId)).toBeNull();
  });
});

describe("resolveInsertionIndex", () => {
  const pages: Page[] = [
    createPage({ id: "r1", position: 1 }),
    createPage({ id: "r2", position: 2 }),
    createPage({ id: "r3", position: 3 }),
    createPage({ id: "a", parent_id: "r1", position: 1 }),
    createPage({ id: "b", parent_id: "r1", position: 2 }),
    createPage({ id: "deep", parent_id: "a", position: 1 }),
  ];
  const byId = new Map(pages.map((p) => [p.id, p]));

  it("returns 0 when above is null (top of list)", () => {
    const slot: DropSlot = { above: null, below: { id: "r1", depth: 0 } };
    const siblings = pages.filter((p) => p.parent_id === null);
    expect(resolveInsertionIndex(slot, null, byId, siblings)).toBe(0);
  });

  it("appends as last child when above is the new parent", () => {
    const slot: DropSlot = { above: { id: "r1", depth: 0 }, below: null };
    const siblings = pages.filter((p) => p.parent_id === "r1").sort((x, y) => x.position - y.position);
    expect(resolveInsertionIndex(slot, "r1", byId, siblings)).toBe(2);
  });

  it("places after above when above is a direct sibling of the new parent's child list", () => {
    const slot: DropSlot = { above: { id: "r1", depth: 0 }, below: { id: "r2", depth: 0 } };
    const siblings = pages.filter((p) => p.parent_id === null).sort((x, y) => x.position - y.position);
    expect(resolveInsertionIndex(slot, null, byId, siblings)).toBe(1);
  });

  it("prefers below so a gap before the first child inserts at index 0", () => {
    const slot: DropSlot = { above: { id: "r1", depth: 0 }, below: { id: "a", depth: 1 } };
    const siblings = pages.filter((p) => p.parent_id === "r1").sort((x, y) => x.position - y.position);
    expect(resolveInsertionIndex(slot, "r1", byId, siblings)).toBe(0);
  });

  it("walks up from below to insert before the visible descendant's root ancestor", () => {
    const slot: DropSlot = { above: { id: "r1", depth: 0 }, below: { id: "deep", depth: 2 } };
    const siblings = pages.filter((p) => p.parent_id === null).sort((x, y) => x.position - y.position);
    expect(resolveInsertionIndex(slot, null, byId, siblings)).toBe(0);
  });

  it("walks up from deeply-nested above to the new parent's child-level ancestor", () => {
    const slot: DropSlot = { above: { id: "deep", depth: 2 }, below: null };
    const siblings = pages.filter((p) => p.parent_id === null).sort((x, y) => x.position - y.position);
    expect(resolveInsertionIndex(slot, null, byId, siblings)).toBe(1);
  });
});

describe("resolveDropTarget", () => {
  function buildFlatTree(): { pages: Page[]; rects: RowRect[] } {
    const pages: Page[] = [
      createPage({ id: "r1", position: 1 }),
      createPage({ id: "r2", position: 2 }),
      createPage({ id: "r3", position: 3 }),
    ];
    const rects = [rect("r1", 0, 0), rect("r2", 0, 1), rect("r3", 0, 2)];
    return { pages, rects };
  }

  function buildNestedTree(): { pages: Page[]; rects: RowRect[] } {
    const pages: Page[] = [
      createPage({ id: "r1", position: 1 }),
      createPage({ id: "a", parent_id: "r1", position: 1 }),
      createPage({ id: "b", parent_id: "a", position: 1 }),
      createPage({ id: "c", parent_id: "b", position: 1 }),
    ];
    const rects = [rect("r1", 0, 0), rect("a", 1, 1), rect("b", 2, 2), rect("c", 3, 3)];
    return { pages, rects };
  }

  it("returns a root-only slot when the tree is empty", () => {
    const result = resolveDropTarget({
      rects: [],
      containerLeft: CONTAINER_LEFT,
      containerWidth: CONTAINER_WIDTH,
      clientX: 0,
      clientY: 0,
      draggedId: "anything",
      allPages: [],
    });
    expect(result.slot).toEqual({ above: null, below: null });
    expect(result.intent).toBe("root");
    expect(result.depth).toBe(0);
    expect(result.parentId).toBeNull();
  });

  it("produces a top-cap slot when pointer is above the first row", () => {
    const { pages, rects } = buildFlatTree();
    const result = resolveDropTarget({
      rects,
      containerLeft: CONTAINER_LEFT,
      containerWidth: CONTAINER_WIDTH,
      clientX: ROOT_X,
      clientY: -4,
      draggedId: "r3",
      allPages: pages,
    });
    expect(result.slot.above).toBeNull();
    expect(result.slot.below).toEqual({ id: "r1", depth: 0 });
    expect(result.intent).toBe("root");
    expect(result.depth).toBe(0);
    expect(result.parentId).toBeNull();
  });

  it("produces a bottom-cap slot when pointer is below the last row", () => {
    const { pages, rects } = buildFlatTree();
    const result = resolveDropTarget({
      rects,
      containerLeft: CONTAINER_LEFT,
      containerWidth: CONTAINER_WIDTH,
      clientX: CHILD_X,
      clientY: rects[rects.length - 1].bottom + 10,
      draggedId: "r1",
      allPages: pages,
    });
    expect(result.slot.above).toEqual({ id: "r3", depth: 0 });
    expect(result.slot.below).toBeNull();
  });

  it("uses Y-midpoint to pick before vs after a row", () => {
    const { pages, rects } = buildFlatTree();
    const before = resolveDropTarget({
      rects,
      containerLeft: CONTAINER_LEFT,
      containerWidth: CONTAINER_WIDTH,
      clientX: ROOT_X,
      clientY: rects[1].top + 4,
      draggedId: "r3",
      allPages: pages,
    });
    expect(before.slot.above).toEqual({ id: "r1", depth: 0 });
    expect(before.slot.below).toEqual({ id: "r2", depth: 0 });

    const after = resolveDropTarget({
      rects,
      containerLeft: CONTAINER_LEFT,
      containerWidth: CONTAINER_WIDTH,
      clientX: ROOT_X,
      clientY: rects[1].bottom - 4,
      draggedId: "r3",
      allPages: pages,
    });
    expect(after.slot.above).toEqual({ id: "r2", depth: 0 });
    expect(after.slot.below).toEqual({ id: "r3", depth: 0 });
  });

  it("collapses root→sibling when anchor is already at depth 0", () => {
    // Lower half of r1 (depth 0) with pointer in root zone: root and sibling
    // both resolve to (depth 0, parent null), so the resolver picks "sibling"
    // for a more informative chip message.
    const { pages, rects } = buildFlatTree();
    const result = resolveDropTarget({
      rects,
      containerLeft: CONTAINER_LEFT,
      containerWidth: CONTAINER_WIDTH,
      clientX: ROOT_X,
      clientY: rects[0].bottom - 2,
      draggedId: "r3",
      allPages: pages,
    });
    expect(result.intent).toBe("sibling");
    expect(result.depth).toBe(0);
    expect(result.parentId).toBeNull();
  });

  it("resolves sibling zone on a nested anchor as sibling of anchor", () => {
    const { pages, rects } = buildNestedTree();
    const result = resolveDropTarget({
      rects,
      containerLeft: CONTAINER_LEFT,
      containerWidth: CONTAINER_WIDTH,
      clientX: SIBLING_X,
      clientY: midpointY(2) + 2,
      draggedId: "extra",
      allPages: [...pages, createPage({ id: "extra" })],
    });
    expect(result.intent).toBe("sibling");
    expect(result.depth).toBe(2);
    expect(result.parentId).toBe("a");
  });

  it("resolves child zone on a nested anchor as child of anchor", () => {
    const { pages, rects } = buildNestedTree();
    const result = resolveDropTarget({
      rects,
      containerLeft: CONTAINER_LEFT,
      containerWidth: CONTAINER_WIDTH,
      clientX: CHILD_X,
      clientY: midpointY(2) + 2,
      draggedId: "extra",
      allPages: [...pages, createPage({ id: "extra" })],
    });
    expect(result.intent).toBe("child");
    expect(result.depth).toBe(3);
    expect(result.parentId).toBe("b");
  });

  it("resolves root zone on a nested anchor as depth 0", () => {
    // The "unnest in one gesture" flow: pointer is over a depth-2 row but X is
    // in the root third, so the drop resolves to root regardless of anchor depth.
    const { pages, rects } = buildNestedTree();
    const result = resolveDropTarget({
      rects,
      containerLeft: CONTAINER_LEFT,
      containerWidth: CONTAINER_WIDTH,
      clientX: ROOT_X,
      clientY: midpointY(2) + 2,
      draggedId: "extra",
      allPages: [...pages, createPage({ id: "extra" })],
    });
    expect(result.intent).toBe("root");
    expect(result.depth).toBe(0);
    expect(result.parentId).toBeNull();
  });

  it("unnests a deep last-row subpage via root zone at the bottom cap", () => {
    const { pages, rects } = buildNestedTree();
    const atRoot = resolveDropTarget({
      rects,
      containerLeft: CONTAINER_LEFT,
      containerWidth: CONTAINER_WIDTH,
      clientX: ROOT_X,
      clientY: rects[rects.length - 1].bottom + 12,
      draggedId: "c",
      allPages: pages,
    });
    expect(atRoot.slot.above).toEqual({ id: "c", depth: 3 });
    expect(atRoot.slot.below).toBeNull();
    expect(atRoot.intent).toBe("root");
    expect(atRoot.depth).toBe(0);
    expect(atRoot.parentId).toBeNull();
    expect(atRoot.valid).toBe(true);
  });

  it("flags noop when dragging to own adjacent slot at same depth", () => {
    const { pages, rects } = buildFlatTree();
    const result = resolveDropTarget({
      rects,
      containerLeft: CONTAINER_LEFT,
      containerWidth: CONTAINER_WIDTH,
      clientX: ROOT_X,
      clientY: rects[1].top + 2,
      draggedId: "r1",
      allPages: pages,
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("noop");
  });

  it("flags cycle when drop would nest a page inside its own subtree", () => {
    // Drag 'a' into child zone of 'b' — 'b' is a's descendant, so making b the
    // new parent of a creates a cycle.
    const { pages, rects } = buildNestedTree();
    const result = resolveDropTarget({
      rects,
      containerLeft: CONTAINER_LEFT,
      containerWidth: CONTAINER_WIDTH,
      clientX: CHILD_X,
      clientY: midpointY(2) + 1,
      draggedId: "a",
      allPages: pages,
    });
    expect(result.parentId).toBe("b");
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("cycle");
  });

  it("flags depth when the move would exceed MAX_TREE_DEPTH", () => {
    const pages: Page[] = [];
    const rects: RowRect[] = [];
    for (let i = 0; i < 10; i++) {
      const id = `d${i}`;
      pages.push(createPage({ id, parent_id: i === 0 ? null : `d${i - 1}`, position: 1 }));
      rects.push(rect(id, i, i));
    }
    const extraId = "extra";
    pages.push(createPage({ id: extraId }));

    const result = resolveDropTarget({
      rects,
      containerLeft: CONTAINER_LEFT,
      containerWidth: CONTAINER_WIDTH,
      clientX: CHILD_X,
      clientY: rects[rects.length - 1].bottom - 1,
      draggedId: extraId,
      allPages: pages,
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("depth");
  });

  it("flags self when the resolved parent is the dragged page itself", () => {
    // Drag r1 into child zone of r1 — parent would be r1, but dragged is r1 → self.
    const pages: Page[] = [createPage({ id: "r1", position: 1 }), createPage({ id: "r2", position: 2 })];
    const rects = [rect("r1", 0, 0), rect("r2", 0, 1)];
    const result = resolveDropTarget({
      rects,
      containerLeft: CONTAINER_LEFT,
      containerWidth: CONTAINER_WIDTH,
      clientX: CHILD_X,
      clientY: rects[0].bottom - 1,
      draggedId: "r1",
      allPages: pages,
    });
    expect(result.parentId).toBe("r1");
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("self");
  });
});
