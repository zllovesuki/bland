import { beforeEach, describe, expect, it } from "vitest";

import { MAX_TREE_DEPTH } from "@/shared/constants";
import {
  getPageAncestorChain,
  getPageAncestorDepthFromChain,
  getPageSubtreeMaxDepth,
  validatePageMove,
} from "@/worker/lib/page-tree";
import { getDb, resetD1Tables } from "@tests/worker/helpers/db";
import { seedPage, seedUser, seedWorkspace } from "@tests/worker/helpers/seeds";

async function seedChain(workspaceId: string, createdBy: string, ids: string[]): Promise<void> {
  // ids[0] is the leaf, ids[last] is the root. Pages are written from root to
  // leaf so each parent exists before its child inserts the foreign-key row.
  for (let i = ids.length - 1; i >= 0; i--) {
    const parentId = i === ids.length - 1 ? null : ids[i + 1];
    await seedPage({
      id: ids[i],
      workspace_id: workspaceId,
      created_by: createdBy,
      parent_id: parentId,
      title: `Page ${i}`,
      position: i,
    });
  }
}

describe("worker page tree helpers (real D1)", () => {
  beforeEach(async () => {
    await resetD1Tables();
  });

  it("returns ancestor rows from the recursive query helper", async () => {
    const user = await seedUser();
    const ws = await seedWorkspace({ owner_id: user.id });
    await seedChain(ws.id, user.id, ["leaf", "mid", "root"]);

    const chain = await getPageAncestorChain(getDb(), "leaf", ws.id);
    expect(chain.map((row) => ({ id: row.id, parent_id: row.parent_id, depth: row.depth }))).toEqual([
      { id: "leaf", parent_id: "mid", depth: 0 },
      { id: "mid", parent_id: "root", depth: 1 },
      { id: "root", parent_id: null, depth: 2 },
    ]);
  });

  it("computes ancestor depth from a valid chain", async () => {
    const user = await seedUser();
    const ws = await seedWorkspace({ owner_id: user.id });
    await seedChain(ws.id, user.id, ["leaf", "mid", "root"]);

    const chain = await getPageAncestorChain(getDb(), "leaf", ws.id);
    expect(getPageAncestorDepthFromChain(chain)).toBe(2);
  });

  it("returns zero ancestor depth for a top-level page", async () => {
    const user = await seedUser();
    const ws = await seedWorkspace({ owner_id: user.id });
    const page = await seedPage({ workspace_id: ws.id, created_by: user.id });

    const chain = await getPageAncestorChain(getDb(), page.id, ws.id);
    expect(getPageAncestorDepthFromChain(chain)).toBe(0);
  });

  it("rejects chains that still have more parents above the depth limit", async () => {
    // Synthetic chain: chain.length = MAX_TREE_DEPTH + 1 with a non-null
    // parent_id on the final row. That shape signals a truncated recursive
    // query, so the helper must reject with null.
    const chain = Array.from({ length: MAX_TREE_DEPTH + 1 }, (_, index) => ({
      id: `p-${index}`,
      parent_id: index === MAX_TREE_DEPTH ? "above-limit" : `p-${index + 1}`,
      title: `Page ${index}`,
      icon: null,
      depth: index,
    }));
    expect(getPageAncestorDepthFromChain(chain)).toBeNull();
  });

  it("reads subtree depth from the recursive descendants query", async () => {
    const user = await seedUser();
    const ws = await seedWorkspace({ owner_id: user.id });
    const root = await seedPage({ workspace_id: ws.id, created_by: user.id, title: "root" });
    const a = await seedPage({ workspace_id: ws.id, created_by: user.id, parent_id: root.id, title: "a" });
    const b = await seedPage({ workspace_id: ws.id, created_by: user.id, parent_id: a.id, title: "b" });
    await seedPage({ workspace_id: ws.id, created_by: user.id, parent_id: b.id, title: "c" });

    await expect(getPageSubtreeMaxDepth(getDb(), root.id, ws.id)).resolves.toBe(3);
  });

  it("returns zero subtree depth for a leaf page with no descendants", async () => {
    const user = await seedUser();
    const ws = await seedWorkspace({ owner_id: user.id });
    const page = await seedPage({ workspace_id: ws.id, created_by: user.id });

    await expect(getPageSubtreeMaxDepth(getDb(), page.id, ws.id)).resolves.toBe(0);
  });

  it("rejects moving a page under itself without querying descendants", async () => {
    const user = await seedUser();
    const ws = await seedWorkspace({ owner_id: user.id });
    const page = await seedPage({ workspace_id: ws.id, created_by: user.id });

    await expect(validatePageMove(getDb(), page.id, page.id, ws.id)).resolves.toEqual({
      ok: false,
      reason: "self_parent",
    });
  });

  it("rejects moving a page under one of its descendants", async () => {
    const user = await seedUser();
    const ws = await seedWorkspace({ owner_id: user.id });
    const root = await seedPage({ workspace_id: ws.id, created_by: user.id, title: "root" });
    const child = await seedPage({ workspace_id: ws.id, created_by: user.id, parent_id: root.id, title: "child" });

    await expect(validatePageMove(getDb(), root.id, child.id, ws.id)).resolves.toEqual({
      ok: false,
      reason: "cycle",
    });
  });

  it("rejects moves that would exceed the maximum nesting depth", async () => {
    const user = await seedUser();
    const ws = await seedWorkspace({ owner_id: user.id });
    // Build a long ancestor chain (MAX_TREE_DEPTH + 2 levels from root to new-parent)
    // so that adding any subtree would exceed MAX_TREE_DEPTH.
    const chainIds = Array.from({ length: MAX_TREE_DEPTH + 1 }, (_, i) => `anc-${i}`);
    await seedChain(ws.id, user.id, chainIds);
    const movable = await seedPage({ workspace_id: ws.id, created_by: user.id, title: "movable" });

    await expect(validatePageMove(getDb(), movable.id, chainIds[0], ws.id)).resolves.toEqual({
      ok: false,
      reason: "depth_exceeded",
    });
  });

  it("accepts moves that stay within the depth limit", async () => {
    const user = await seedUser();
    const ws = await seedWorkspace({ owner_id: user.id });
    const root = await seedPage({ workspace_id: ws.id, created_by: user.id, title: "root" });
    const mid = await seedPage({ workspace_id: ws.id, created_by: user.id, parent_id: root.id, title: "mid" });
    const movable = await seedPage({ workspace_id: ws.id, created_by: user.id, title: "movable" });

    await expect(validatePageMove(getDb(), movable.id, mid.id, ws.id)).resolves.toEqual({ ok: true });
  });
});
