import { describe, expect, it } from "vitest";
import { createPage } from "@tests/client/util/fixtures";
import {
  buildPageMap,
  getAncestorIds,
  getSortedSiblings,
  resolveIndent,
  resolveMoveDown,
  resolveMoveRelative,
  resolveMoveToRoot,
  resolveMoveUp,
  resolveOutdent,
} from "@/client/lib/page-tree-model";

describe("getSortedSiblings", () => {
  it("filters by parent, excludes the moved page, and ignores archived rows", () => {
    const pages = [
      createPage({ id: "a", parent_id: null, position: 2 }),
      createPage({ id: "b", parent_id: null, position: 1 }),
      createPage({ id: "c", parent_id: null, position: 3, archived_at: "2026-04-01T00:00:00Z" }),
      createPage({ id: "child", parent_id: "a", position: 1 }),
    ];

    expect(getSortedSiblings(pages, null, "a").map((page) => page.id)).toEqual(["b"]);
  });
});

describe("getAncestorIds", () => {
  it("returns the parent chain excluding the starting page itself", () => {
    const pages = [
      createPage({ id: "root" }),
      createPage({ id: "parent", parent_id: "root" }),
      createPage({ id: "leaf", parent_id: "parent" }),
    ];
    const byId = buildPageMap(pages);

    expect([...getAncestorIds(byId, "leaf")]).toEqual(["parent", "root"]);
    expect([...getAncestorIds(byId, "root")]).toEqual([]);
    expect([...getAncestorIds(byId, null)]).toEqual([]);
  });
});

describe("page move model", () => {
  const pages = [
    createPage({ id: "a1", title: "A1", position: 1 }),
    createPage({ id: "a2", title: "A2", position: 2 }),
    createPage({ id: "a3", title: "A3", position: 3 }),
    createPage({ id: "b1", title: "B1", parent_id: "a1", position: 1 }),
    createPage({ id: "b2", title: "B2", parent_id: "a1", position: 2 }),
    createPage({ id: "c1", title: "C1", parent_id: "a2", position: 1 }),
  ];

  it("moves a page up within its sibling list", () => {
    const result = resolveMoveUp(pages, pages[1]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.proposal.parentId).toBeNull();
    expect(result.proposal.insertionIndex).toBe(0);
  });

  it("moves a page down within its sibling list", () => {
    const result = resolveMoveDown(pages, pages[0]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.proposal.parentId).toBeNull();
    expect(result.proposal.insertionIndex).toBe(1);
  });

  it("indents into the previous sibling as the last child", () => {
    const result = resolveIndent(pages, pages[1]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.proposal.parentId).toBe("a1");
    expect(result.proposal.insertionIndex).toBe(2);
  });

  it("outdents to after the former parent subtree", () => {
    const result = resolveOutdent(pages, pages[3]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.proposal.parentId).toBeNull();
    expect(result.proposal.insertionIndex).toBe(1);
  });

  it("disables move up for the first sibling in a level", () => {
    const result = resolveMoveUp(pages, pages[0]);
    expect(result).toEqual({
      ok: false,
      reason: "boundary",
      message: "Already first in this level",
    });
  });

  it("resolves before/inside/after relations against a target page", () => {
    const before = resolveMoveRelative({ allPages: pages, page: pages[2], targetPage: pages[1], relation: "before" });
    const inside = resolveMoveRelative({ allPages: pages, page: pages[0], targetPage: pages[1], relation: "inside" });
    const after = resolveMoveRelative({ allPages: pages, page: pages[0], targetPage: pages[1], relation: "after" });

    expect(before.ok && before.proposal.previewLabel).toBe("Move before A2");
    expect(inside.ok && inside.proposal.parentId).toBe("a2");
    expect(after.ok && after.proposal.previewLabel).toBe("Move after A2");
  });

  it("resolves root top and bottom placements", () => {
    const top = resolveMoveToRoot(pages, pages[3], "top");
    const bottom = resolveMoveToRoot(pages, pages[3], "bottom");

    expect(top.ok && top.proposal.insertionIndex).toBe(0);
    expect(bottom.ok && bottom.proposal.insertionIndex).toBe(3);
  });
});
