import { describe, expect, it } from "vitest";
import { createPage } from "@tests/client/util/fixtures";
import { buildPageTreeIndex } from "@/client/lib/page-tree-model";
import {
  getActiveDescendantIds,
  getArchivePageConfirmMessage,
  shouldNavigateAwayAfterArchive,
} from "@/client/lib/page-archive";

describe("page archive helpers", () => {
  it("counts every active descendant and ignores archived descendants", () => {
    const index = buildPageTreeIndex([
      createPage({ id: "root", title: "Root" }),
      createPage({ id: "child-a", parent_id: "root", position: 1 }),
      createPage({ id: "grandchild", parent_id: "child-a", position: 1 }),
      createPage({ id: "child-b", parent_id: "root", position: 2 }),
      createPage({
        id: "archived-child",
        parent_id: "root",
        position: 3,
        archived_at: "2026-04-01T00:00:00.000Z",
        archive_root_id: "archived-child",
      }),
    ]);

    expect(getActiveDescendantIds(index, "root")).toEqual(["child-a", "grandchild", "child-b"]);
  });

  it("uses archive copy without child-promotion language", () => {
    expect(getArchivePageConfirmMessage("Roadmap", 0)).toBe('"Roadmap" will be archived.');
    expect(getArchivePageConfirmMessage("Roadmap", 1)).toBe('"Roadmap" and 1 subpage will be archived.');
    expect(getArchivePageConfirmMessage("Roadmap", 3)).toBe('"Roadmap" and 3 subpages will be archived.');
  });

  it("navigates away when the active route is any archived descendant", () => {
    expect(shouldNavigateAwayAfterArchive("grandchild", ["root", "child", "grandchild"])).toBe(true);
    expect(shouldNavigateAwayAfterArchive("other", ["root", "child", "grandchild"])).toBe(false);
  });
});
