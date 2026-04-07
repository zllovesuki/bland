import { describe, expect, it } from "vitest";

import { MAX_TREE_DEPTH } from "@/shared/constants";
import {
  getPageAncestorChain,
  getPageAncestorDepthFromChain,
  getPageSubtreeMaxDepth,
  validatePageMove,
  type PageAncestorRow,
} from "@/worker/lib/page-tree";
import { createDbMock } from "@tests/worker/util/db";

function createChain(ids: string[], lastParentId: string | null = null): PageAncestorRow[] {
  return ids.map((id, index) => ({
    id,
    parent_id: index === ids.length - 1 ? lastParentId : ids[index + 1],
    title: `Page ${index}`,
    icon: null,
    depth: index,
  }));
}

describe("worker page tree helpers", () => {
  it("returns ancestor rows from the shared query helper", async () => {
    const chain = createChain(["page-1", "page-2", "page-3"]);
    const db = createDbMock(chain);

    await expect(getPageAncestorChain(db, "page-1", "workspace-1")).resolves.toEqual(chain);
    expect(db.all).toHaveBeenCalledTimes(1);
  });

  it("computes ancestor depth from a valid chain", () => {
    expect(getPageAncestorDepthFromChain(createChain(["page-1", "page-2", "page-3"]))).toBe(2);
  });

  it("rejects duplicate ancestors as a cycle", () => {
    expect(getPageAncestorDepthFromChain(createChain(["page-1", "page-2", "page-1"]))).toBeNull();
  });

  it("rejects truncated ancestor chains that still have more parents above the depth limit", () => {
    const ids = Array.from({ length: MAX_TREE_DEPTH + 1 }, (_, index) => `page-${index}`);
    expect(getPageAncestorDepthFromChain(createChain(ids, "page-overflow"))).toBeNull();
  });

  it("reads subtree depth from the recursive helper query", async () => {
    const db = createDbMock([{ max_depth: 3 }]);

    await expect(getPageSubtreeMaxDepth(db, "page-1", "workspace-1")).resolves.toBe(3);
    expect(db.all).toHaveBeenCalledTimes(1);
  });

  it("returns zero subtree depth when the query has no descendants", async () => {
    const db = createDbMock([{ max_depth: null }]);

    await expect(getPageSubtreeMaxDepth(db, "page-1", "workspace-1")).resolves.toBe(0);
  });

  it("rejects moving a page under itself without querying the database", async () => {
    const db = createDbMock();

    await expect(validatePageMove(db, "page-1", "page-1", "workspace-1")).resolves.toEqual({
      ok: false,
      reason: "self_parent",
    });
    expect(db.all).not.toHaveBeenCalled();
  });

  it("rejects moving a page under one of its descendants", async () => {
    const db = createDbMock(createChain(["child-page", "page-1", "root-page"]));

    await expect(validatePageMove(db, "page-1", "child-page", "workspace-1")).resolves.toEqual({
      ok: false,
      reason: "cycle",
    });
    expect(db.all).toHaveBeenCalledTimes(1);
  });

  it("rejects moves that would exceed the maximum nesting depth", async () => {
    const db = createDbMock(
      createChain([
        "new-parent",
        "ancestor-1",
        "ancestor-2",
        "ancestor-3",
        "ancestor-4",
        "ancestor-5",
        "ancestor-6",
        "root-page",
      ]),
      [{ max_depth: 2 }],
    );

    await expect(validatePageMove(db, "page-1", "new-parent", "workspace-1")).resolves.toEqual({
      ok: false,
      reason: "depth_exceeded",
    });
    expect(db.all).toHaveBeenCalledTimes(2);
  });

  it("accepts moves that stay within the depth limit", async () => {
    const db = createDbMock(createChain(["new-parent", "ancestor-1", "root-page"]), [{ max_depth: 2 }]);

    await expect(validatePageMove(db, "page-1", "new-parent", "workspace-1")).resolves.toEqual({ ok: true });
    expect(db.all).toHaveBeenCalledTimes(2);
  });
});
