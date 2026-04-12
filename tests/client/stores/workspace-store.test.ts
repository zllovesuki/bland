import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installLocalStorageStub, restoreLocalStorage } from "@tests/client/util/storage";
import { createPage, createWorkspace, createMember } from "@tests/client/util/fixtures";
import { STORAGE_KEYS } from "@/client/lib/constants";

let useWorkspaceStore: typeof import("@/client/stores/workspace-store").useWorkspaceStore;
let selectActiveWorkspace: typeof import("@/client/stores/workspace-store").selectActiveWorkspace;
let selectActivePages: typeof import("@/client/stores/workspace-store").selectActivePages;
let selectActiveMembers: typeof import("@/client/stores/workspace-store").selectActiveMembers;
let clearAllCachedDocs: typeof import("@/client/lib/doc-cache-hints").clearAllCachedDocs;

beforeEach(async () => {
  installLocalStorageStub();
  vi.resetModules();
  const wsMod = await import("@/client/stores/workspace-store");
  const cacheMod = await import("@/client/lib/doc-cache-hints");
  useWorkspaceStore = wsMod.useWorkspaceStore;
  selectActiveWorkspace = wsMod.selectActiveWorkspace;
  selectActivePages = wsMod.selectActivePages;
  selectActiveMembers = wsMod.selectActiveMembers;
  clearAllCachedDocs = cacheMod.clearAllCachedDocs;
  vi.spyOn(cacheMod, "clearAllCachedDocs").mockImplementation(() => {});
});

afterEach(() => {
  restoreLocalStorage();
  vi.restoreAllMocks();
});

describe("workspace-store", () => {
  describe("route slice is not persisted", () => {
    it("activeWorkspaceId defaults to null", () => {
      expect(useWorkspaceStore.getState().activeWorkspaceId).toBeNull();
    });

    it("activeAccessMode defaults to null", () => {
      expect(useWorkspaceStore.getState().activeAccessMode).toBeNull();
    });

    it("activeRouteSource defaults to null", () => {
      expect(useWorkspaceStore.getState().activeRouteSource).toBeNull();
    });

    it("setActiveRoute sets both fields", () => {
      useWorkspaceStore.getState().setActiveRoute("ws-1", "member", "live");
      const state = useWorkspaceStore.getState();
      expect(state.activeWorkspaceId).toBe("ws-1");
      expect(state.activeAccessMode).toBe("member");
      expect(state.activeRouteSource).toBe("live");
    });

    it("clearActiveRoute resets both fields", () => {
      useWorkspaceStore.getState().setActiveRoute("ws-1", "member", "live");
      useWorkspaceStore.getState().clearActiveRoute();
      const state = useWorkspaceStore.getState();
      expect(state.activeWorkspaceId).toBeNull();
      expect(state.activeAccessMode).toBeNull();
      expect(state.activeRouteSource).toBeNull();
    });

    it("rehydrates the persisted cache slice without restoring route state", async () => {
      const workspace = createWorkspace({ id: "ws-1" });
      const page = createPage({ id: "p1", workspace_id: "ws-1" });
      const member = createMember({ workspace_id: "ws-1" });
      const hadWindow = "window" in globalThis;
      const originalWindow = (globalThis as Record<string, unknown>).window;

      localStorage.setItem(
        STORAGE_KEYS.WORKSPACE,
        JSON.stringify({
          state: {
            memberWorkspaces: [workspace],
            sharedInbox: [],
            snapshotsByWorkspaceId: {
              "ws-1": {
                workspace,
                accessMode: "member",
                pages: [page],
                members: [member],
              },
            },
            pageMetaById: { p1: page },
            lastVisitedWorkspaceId: "ws-1",
            cacheUserId: "user-1",
          },
          version: 2,
        }),
      );

      Object.defineProperty(globalThis, "window", {
        value: { localStorage },
        writable: true,
        configurable: true,
      });

      try {
        vi.resetModules();
        const mod = await import("@/client/stores/workspace-store");
        await vi.dynamicImportSettled();
        const state = mod.useWorkspaceStore.getState();

        expect(state.memberWorkspaces).toEqual([workspace]);
        expect(state.snapshotsByWorkspaceId["ws-1"]?.pages).toEqual([page]);
        expect(state.snapshotsByWorkspaceId["ws-1"]?.members).toEqual([member]);
        expect(state.pageMetaById).toEqual({ p1: page });
        expect(state.lastVisitedWorkspaceId).toBe("ws-1");
        expect(state.cacheUserId).toBe("user-1");
        expect(state.activeWorkspaceId).toBeNull();
        expect(state.activeAccessMode).toBeNull();
        expect(state.activeRouteSource).toBeNull();
      } finally {
        if (hadWindow) {
          Object.defineProperty(globalThis, "window", {
            value: originalWindow,
            writable: true,
            configurable: true,
          });
        } else {
          delete (globalThis as Record<string, unknown>).window;
        }
      }
    });
  });

  describe("selectors", () => {
    it("selectActiveWorkspace returns null when no active route", () => {
      expect(selectActiveWorkspace(useWorkspaceStore.getState())).toBeNull();
    });

    it("selectActiveWorkspace returns the workspace from active snapshot", () => {
      const ws = createWorkspace({ id: "ws-1" });
      useWorkspaceStore.getState().replaceWorkspaceSnapshot("ws-1", {
        workspace: ws,
        accessMode: "member",
        pages: [],
        members: [],
      });
      useWorkspaceStore.getState().setActiveRoute("ws-1", "member", "live");
      expect(selectActiveWorkspace(useWorkspaceStore.getState())).toEqual(ws);
    });

    it("selectActivePages returns pages from active snapshot", () => {
      const pages = [createPage({ id: "p1" }), createPage({ id: "p2" })];
      useWorkspaceStore.getState().replaceWorkspaceSnapshot("ws-1", {
        workspace: createWorkspace({ id: "ws-1" }),
        accessMode: "member",
        pages,
        members: [],
      });
      useWorkspaceStore.getState().setActiveRoute("ws-1", "member", "live");
      expect(selectActivePages(useWorkspaceStore.getState())).toEqual(pages);
    });
  });

  describe("snapshot mutations", () => {
    it("replaceWorkspaceSnapshot updates pageMetaById", () => {
      const pages = [createPage({ id: "p1", workspace_id: "ws-1" })];
      useWorkspaceStore.getState().replaceWorkspaceSnapshot("ws-1", {
        workspace: createWorkspace({ id: "ws-1" }),
        accessMode: "member",
        pages,
        members: [],
      });
      expect(useWorkspaceStore.getState().pageMetaById["p1"]).toEqual(pages[0]);
    });

    it("addPageToSnapshot also updates pageMetaById", () => {
      useWorkspaceStore.getState().replaceWorkspaceSnapshot("ws-1", {
        workspace: createWorkspace({ id: "ws-1" }),
        accessMode: "member",
        pages: [],
        members: [],
      });
      const page = createPage({ id: "p1", workspace_id: "ws-1" });
      useWorkspaceStore.getState().addPageToSnapshot("ws-1", page);
      expect(useWorkspaceStore.getState().pageMetaById["p1"]).toEqual(page);
      expect(useWorkspaceStore.getState().snapshotsByWorkspaceId["ws-1"].pages).toHaveLength(1);
    });

    it("updatePageInSnapshot updates both snapshot and pageMetaById", () => {
      const page = createPage({ id: "p1", workspace_id: "ws-1", title: "Old" });
      useWorkspaceStore.getState().replaceWorkspaceSnapshot("ws-1", {
        workspace: createWorkspace({ id: "ws-1" }),
        accessMode: "member",
        pages: [page],
        members: [],
      });
      useWorkspaceStore.getState().updatePageInSnapshot("ws-1", "p1", { title: "New" });
      expect(useWorkspaceStore.getState().snapshotsByWorkspaceId["ws-1"].pages[0].title).toBe("New");
      expect(useWorkspaceStore.getState().pageMetaById["p1"].title).toBe("New");
    });

    it("removePageFromSnapshot removes from both snapshot and pageMetaById", () => {
      const page = createPage({ id: "p1", workspace_id: "ws-1" });
      useWorkspaceStore.getState().replaceWorkspaceSnapshot("ws-1", {
        workspace: createWorkspace({ id: "ws-1" }),
        accessMode: "member",
        pages: [page],
        members: [],
      });
      useWorkspaceStore.getState().removePageFromSnapshot("ws-1", "p1");
      expect(useWorkspaceStore.getState().snapshotsByWorkspaceId["ws-1"].pages).toHaveLength(0);
      expect(useWorkspaceStore.getState().pageMetaById["p1"]).toBeUndefined();
    });

    it("archivePageInSnapshot removes page and promotes children", () => {
      const parent = createPage({ id: "parent", workspace_id: "ws-1", parent_id: null });
      const child = createPage({ id: "child", workspace_id: "ws-1", parent_id: "parent" });
      const sibling = createPage({ id: "sibling", workspace_id: "ws-1", parent_id: null });
      useWorkspaceStore.getState().replaceWorkspaceSnapshot("ws-1", {
        workspace: createWorkspace({ id: "ws-1" }),
        accessMode: "member",
        pages: [parent, child, sibling],
        members: [],
      });

      useWorkspaceStore.getState().archivePageInSnapshot("ws-1", "parent");

      const pages = useWorkspaceStore.getState().snapshotsByWorkspaceId["ws-1"].pages;
      expect(pages.find((p) => p.id === "parent")).toBeUndefined();
      expect(pages.find((p) => p.id === "child")!.parent_id).toBeNull();
      expect(pages.find((p) => p.id === "sibling")!.parent_id).toBeNull();
      expect(useWorkspaceStore.getState().pageMetaById["parent"]).toBeUndefined();
    });

    it("removeWorkspaceSnapshot scrubs pageMetaById for that workspace", () => {
      const page = createPage({ id: "p1", workspace_id: "ws-1" });
      const otherPage = createPage({ id: "p2", workspace_id: "ws-2" });
      useWorkspaceStore.getState().replaceWorkspaceSnapshot("ws-1", {
        workspace: createWorkspace({ id: "ws-1" }),
        accessMode: "member",
        pages: [page],
        members: [],
      });
      useWorkspaceStore.getState().replaceWorkspaceSnapshot("ws-2", {
        workspace: createWorkspace({ id: "ws-2" }),
        accessMode: "member",
        pages: [otherPage],
        members: [],
      });

      useWorkspaceStore.getState().removeWorkspaceSnapshot("ws-1");
      expect(useWorkspaceStore.getState().pageMetaById["p1"]).toBeUndefined();
      expect(useWorkspaceStore.getState().pageMetaById["p2"]).toEqual(otherPage);
    });
  });

  describe("validateCacheOwner", () => {
    it("sets cacheUserId on first call", () => {
      useWorkspaceStore.getState().validateCacheOwner("user-1");
      expect(useWorkspaceStore.getState().cacheUserId).toBe("user-1");
    });

    it("no-ops when same user validates again", () => {
      useWorkspaceStore.getState().validateCacheOwner("user-1");
      const ws = createWorkspace({ id: "ws-1" });
      useWorkspaceStore.getState().replaceWorkspaceSnapshot("ws-1", {
        workspace: ws,
        accessMode: "member",
        pages: [createPage()],
        members: [],
      });

      useWorkspaceStore.getState().validateCacheOwner("user-1");
      expect(useWorkspaceStore.getState().snapshotsByWorkspaceId["ws-1"]).toBeDefined();
    });

    it("clears state and doc cache when different user logs in", async () => {
      useWorkspaceStore.getState().validateCacheOwner("user-1");
      useWorkspaceStore.getState().replaceWorkspaceSnapshot("ws-1", {
        workspace: createWorkspace({ id: "ws-1" }),
        accessMode: "member",
        pages: [createPage()],
        members: [],
      });

      const cacheMod = await import("@/client/lib/doc-cache-hints");

      useWorkspaceStore.getState().validateCacheOwner("user-2");

      expect(cacheMod.clearAllCachedDocs).toHaveBeenCalled();
      expect(useWorkspaceStore.getState().snapshotsByWorkspaceId).toEqual({});
      expect(useWorkspaceStore.getState().cacheUserId).toBe("user-2");
    });
  });

  describe("resetStore", () => {
    it("clears all cache and route state", () => {
      useWorkspaceStore.getState().setMemberWorkspaces([createWorkspace()]);
      useWorkspaceStore.getState().setActiveRoute("ws-1", "member", "cache");

      useWorkspaceStore.getState().resetStore();

      const state = useWorkspaceStore.getState();
      expect(state.memberWorkspaces).toEqual([]);
      expect(state.snapshotsByWorkspaceId).toEqual({});
      expect(state.pageMetaById).toEqual({});
      expect(state.activeWorkspaceId).toBeNull();
      expect(state.activeAccessMode).toBeNull();
      expect(state.activeRouteSource).toBeNull();
    });

    it("updates cacheUserId when provided", () => {
      useWorkspaceStore.getState().validateCacheOwner("user-1");
      useWorkspaceStore.getState().resetStore("user-2");
      expect(useWorkspaceStore.getState().cacheUserId).toBe("user-2");
    });
  });

  describe("member workspace mutations", () => {
    it("upsertMemberWorkspace adds new workspace", () => {
      const ws = createWorkspace({ id: "ws-1" });
      useWorkspaceStore.getState().upsertMemberWorkspace(ws);
      expect(useWorkspaceStore.getState().memberWorkspaces).toEqual([ws]);
    });

    it("upsertMemberWorkspace updates existing workspace", () => {
      const ws = createWorkspace({ id: "ws-1", name: "Old" });
      useWorkspaceStore.getState().setMemberWorkspaces([ws]);
      const updated = createWorkspace({ id: "ws-1", name: "New" });
      useWorkspaceStore.getState().upsertMemberWorkspace(updated);
      expect(useWorkspaceStore.getState().memberWorkspaces).toEqual([updated]);
    });

    it("removeMemberWorkspace filters by id", () => {
      useWorkspaceStore
        .getState()
        .setMemberWorkspaces([createWorkspace({ id: "ws-1" }), createWorkspace({ id: "ws-2" })]);
      useWorkspaceStore.getState().removeMemberWorkspace("ws-1");
      expect(useWorkspaceStore.getState().memberWorkspaces).toHaveLength(1);
      expect(useWorkspaceStore.getState().memberWorkspaces[0].id).toBe("ws-2");
    });
  });

  describe("lastVisitedWorkspaceId", () => {
    it("removeWorkspaceSnapshot clears lastVisitedWorkspaceId if it matches", () => {
      useWorkspaceStore.getState().setLastVisitedWorkspaceId("ws-1");
      useWorkspaceStore.getState().replaceWorkspaceSnapshot("ws-1", {
        workspace: createWorkspace({ id: "ws-1" }),
        accessMode: "member",
        pages: [],
        members: [],
      });
      useWorkspaceStore.getState().removeWorkspaceSnapshot("ws-1");
      expect(useWorkspaceStore.getState().lastVisitedWorkspaceId).toBeNull();
    });

    it("removeWorkspaceSnapshot preserves lastVisitedWorkspaceId for other workspaces", () => {
      useWorkspaceStore.getState().setLastVisitedWorkspaceId("ws-2");
      useWorkspaceStore.getState().replaceWorkspaceSnapshot("ws-1", {
        workspace: createWorkspace({ id: "ws-1" }),
        accessMode: "member",
        pages: [],
        members: [],
      });
      useWorkspaceStore.getState().removeWorkspaceSnapshot("ws-1");
      expect(useWorkspaceStore.getState().lastVisitedWorkspaceId).toBe("ws-2");
    });
  });
});
