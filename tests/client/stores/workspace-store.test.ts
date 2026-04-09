import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installLocalStorageStub, restoreLocalStorage } from "@tests/client/util/storage";
import { createPage } from "@tests/client/util/fixtures";

let useWorkspaceStore: typeof import("@/client/stores/workspace-store").useWorkspaceStore;
let clearAllCachedDocs: typeof import("@/client/lib/doc-cache-hints").clearAllCachedDocs;

beforeEach(async () => {
  installLocalStorageStub();
  vi.resetModules();
  const wsMod = await import("@/client/stores/workspace-store");
  const cacheMod = await import("@/client/lib/doc-cache-hints");
  useWorkspaceStore = wsMod.useWorkspaceStore;
  clearAllCachedDocs = cacheMod.clearAllCachedDocs;
  vi.spyOn(cacheMod, "clearAllCachedDocs").mockImplementation(() => {});
});

afterEach(() => {
  restoreLocalStorage();
  vi.restoreAllMocks();
});

describe("workspace-store", () => {
  describe("validateCacheOwner", () => {
    it("sets cacheUserId on first call", () => {
      useWorkspaceStore.getState().validateCacheOwner("user-1");
      expect(useWorkspaceStore.getState().cacheUserId).toBe("user-1");
    });

    it("no-ops when same user validates again", () => {
      useWorkspaceStore.getState().validateCacheOwner("user-1");
      const pages = [createPage()];
      useWorkspaceStore.getState().setPages(pages);

      useWorkspaceStore.getState().validateCacheOwner("user-1");
      expect(useWorkspaceStore.getState().pages).toEqual(pages);
    });

    it("clears state and doc cache when different user logs in", async () => {
      useWorkspaceStore.getState().validateCacheOwner("user-1");
      useWorkspaceStore.getState().setPages([createPage()]);

      // Re-import to get the spied version
      const cacheMod = await import("@/client/lib/doc-cache-hints");

      useWorkspaceStore.getState().validateCacheOwner("user-2");

      expect(cacheMod.clearAllCachedDocs).toHaveBeenCalled();
      expect(useWorkspaceStore.getState().pages).toEqual([]);
      expect(useWorkspaceStore.getState().cacheUserId).toBe("user-2");
    });

    it("no-ops when called with null and no prior user", () => {
      useWorkspaceStore.getState().validateCacheOwner(null);
      expect(useWorkspaceStore.getState().cacheUserId).toBeNull();
    });
  });

  describe("archivePage", () => {
    it("removes the page and promotes its children to root", () => {
      const parent = createPage({ id: "parent", parent_id: null });
      const child = createPage({ id: "child", parent_id: "parent" });
      const sibling = createPage({ id: "sibling", parent_id: null });
      useWorkspaceStore.getState().setPages([parent, child, sibling]);

      useWorkspaceStore.getState().archivePage("parent");

      const pages = useWorkspaceStore.getState().pages;
      expect(pages.find((p) => p.id === "parent")).toBeUndefined();
      expect(pages.find((p) => p.id === "child")!.parent_id).toBeNull();
      expect(pages.find((p) => p.id === "sibling")!.parent_id).toBeNull();
    });
  });

  describe("resetWorkspaceState", () => {
    it("clears workspaces, pages, members, and context", () => {
      useWorkspaceStore.getState().setPages([createPage()]);
      useWorkspaceStore.getState().setAccessMode("member");

      useWorkspaceStore.getState().resetWorkspaceState();

      const state = useWorkspaceStore.getState();
      expect(state.workspaces).toEqual([]);
      expect(state.pages).toEqual([]);
      expect(state.members).toEqual([]);
      expect(state.currentWorkspace).toBeNull();
      expect(state.accessMode).toBeNull();
    });

    it("updates cacheUserId when provided", () => {
      useWorkspaceStore.getState().validateCacheOwner("user-1");
      useWorkspaceStore.getState().resetWorkspaceState("user-2");
      expect(useWorkspaceStore.getState().cacheUserId).toBe("user-2");
    });
  });

  describe("page mutations", () => {
    it("addPage appends to the list", () => {
      const p1 = createPage({ id: "p1" });
      const p2 = createPage({ id: "p2" });
      useWorkspaceStore.getState().setPages([p1]);
      useWorkspaceStore.getState().addPage(p2);
      expect(useWorkspaceStore.getState().pages).toHaveLength(2);
    });

    it("updatePage merges partial updates", () => {
      useWorkspaceStore.getState().setPages([createPage({ id: "p1", title: "Old" })]);
      useWorkspaceStore.getState().updatePage("p1", { title: "New" });
      expect(useWorkspaceStore.getState().pages[0].title).toBe("New");
    });

    it("removePage filters by id", () => {
      useWorkspaceStore.getState().setPages([createPage({ id: "p1" }), createPage({ id: "p2" })]);
      useWorkspaceStore.getState().removePage("p1");
      expect(useWorkspaceStore.getState().pages).toHaveLength(1);
      expect(useWorkspaceStore.getState().pages[0].id).toBe("p2");
    });
  });
});
