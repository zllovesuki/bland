import { describe, expect, it } from "vitest";
import {
  addSnapshotPage,
  archiveSnapshotPage,
  patchSnapshotPage,
  removeSnapshotPage,
  upsertSnapshotPage,
} from "@/client/lib/workspace-snapshot-pages";
import { createPage } from "@tests/client/util/fixtures";

describe("workspace-snapshot-pages", () => {
  it("adds a page without touching other snapshot fields", () => {
    const snapshot = {
      label: "snapshot",
      pages: [createPage({ id: "page-1" })],
    };

    const next = addSnapshotPage(snapshot, createPage({ id: "page-2" }));

    expect(next.label).toBe("snapshot");
    expect(next.pages.map((page) => page.id)).toEqual(["page-1", "page-2"]);
  });

  it("upserts a loaded page by id", () => {
    const snapshot = {
      pages: [createPage({ id: "page-1", title: "Old", icon: null })],
    };

    const next = upsertSnapshotPage(snapshot, createPage({ id: "page-1", title: "New", icon: "🌿" }));

    expect(next.pages).toHaveLength(1);
    expect(next.pages[0]).toMatchObject({ id: "page-1", title: "New", icon: "🌿" });
  });

  it("upserts a missing page by appending it", () => {
    const snapshot = {
      pages: [createPage({ id: "page-1" })],
    };

    const next = upsertSnapshotPage(snapshot, createPage({ id: "page-2" }));

    expect(next.pages.map((page) => page.id)).toEqual(["page-1", "page-2"]);
  });

  it("patches only the matching page", () => {
    const snapshot = {
      pages: [createPage({ id: "page-1", title: "Old" }), createPage({ id: "page-2", title: "Keep" })],
    };

    const next = patchSnapshotPage(snapshot, "page-1", { title: "New" });

    expect(next.pages.find((page) => page.id === "page-1")?.title).toBe("New");
    expect(next.pages.find((page) => page.id === "page-2")?.title).toBe("Keep");
  });

  it("removes archived pages and promotes their children", () => {
    const snapshot = {
      pages: [
        createPage({ id: "parent", parent_id: null }),
        createPage({ id: "child", parent_id: "parent" }),
        createPage({ id: "sibling", parent_id: null }),
      ],
    };

    const next = archiveSnapshotPage(snapshot, "parent");

    expect(next.pages.find((page) => page.id === "parent")).toBeUndefined();
    expect(next.pages.find((page) => page.id === "child")?.parent_id).toBeNull();
    expect(next.pages.find((page) => page.id === "sibling")?.parent_id).toBeNull();
  });

  it("removes a page by id", () => {
    const snapshot = {
      pages: [createPage({ id: "page-1" }), createPage({ id: "page-2" })],
    };

    const next = removeSnapshotPage(snapshot, "page-1");

    expect(next.pages.map((page) => page.id)).toEqual(["page-2"]);
  });
});
