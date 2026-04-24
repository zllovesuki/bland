import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installLocalStorageStub, restoreLocalStorage } from "@tests/client/util/storage";
import { createPage, createWorkspace, createMembershipSummary, createMember } from "@tests/client/util/fixtures";
import { STORAGE_KEYS } from "@/client/lib/constants";

let useWorkspaceStore: typeof import("@/client/stores/workspace-store").useWorkspaceStore;

beforeEach(async () => {
  installLocalStorageStub();
  vi.resetModules();
  const wsMod = await import("@/client/stores/workspace-store");
  const cacheMod = await import("@/client/lib/doc-cache-registry");
  useWorkspaceStore = wsMod.useWorkspaceStore;
  vi.spyOn(cacheMod.docCache, "clearAll").mockImplementation(() => {});
});

afterEach(() => {
  restoreLocalStorage();
  vi.restoreAllMocks();
});

describe("workspace-store", () => {
  describe("durable cache persistence", () => {
    it("rehydrates the persisted cache slice, ignoring legacy pageMetaById field", async () => {
      const workspace = createMembershipSummary({ id: "ws-1" });
      const page = createPage({ id: "p1", workspace_id: "ws-1" });
      const member = createMember({ workspace_id: "ws-1" });
      const hadWindow = "window" in globalThis;
      const originalWindow = (globalThis as Record<string, unknown>).window;

      // Persisted blob at the current schema version. Hydration preserves
      // memberWorkspaces + snapshots + last-visited while ignoring the
      // undeclared pageMetaById field.
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
                workspaceRole: "member",
                pages: [page],
                members: [member],
              },
            },
            pageMetaById: { p1: page },
            lastVisitedWorkspaceId: "ws-1",
            cacheUserId: "user-1",
          },
          version: 6,
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
        expect(state.lastVisitedWorkspaceId).toBe("ws-1");
        expect(state.cacheUserId).toBe("user-1");
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

    it("v5 -> v6 migration clears workspace-scoped caches so slug-first guest lies cannot persist", async () => {
      const hadWindow = "window" in globalThis;
      const originalWindow = (globalThis as Record<string, unknown>).window;

      // A v5 blob can carry the slug-first path's lying accessMode "member"
      // for a guest workspace. The migration clears snapshots and
      // memberWorkspaces so the next bootstrap populates workspace_role
      // authoritatively.
      localStorage.setItem(
        STORAGE_KEYS.WORKSPACE,
        JSON.stringify({
          state: {
            memberWorkspaces: [createWorkspace({ id: "ws-1" })],
            sharedInbox: [],
            sharedInboxWorkspaceSummaries: [],
            snapshotsByWorkspaceId: {
              "ws-1": {
                workspace: createWorkspace({ id: "ws-1" }),
                accessMode: "member",
                pages: [],
                members: [],
              },
            },
            pageAccessByPageId: {},
            lastVisitedWorkspaceId: "ws-1",
            lastVisitedPageIdByWorkspaceId: { "ws-1": "p-legacy" },
            cacheUserId: "user-1",
          },
          version: 5,
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

        expect(state.memberWorkspaces).toEqual([]);
        expect(state.snapshotsByWorkspaceId).toEqual({});
        expect(state.lastVisitedWorkspaceId).toBeNull();
        expect(state.lastVisitedPageIdByWorkspaceId).toEqual({});
        // cacheUserId survives the migration so the doc-cache ownership check
        // does not double-clear when the user returns.
        expect(state.cacheUserId).toBe("user-1");
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

  describe("snapshot mutations", () => {
    it("replaceWorkspaceSnapshot stores new pages in the snapshot", () => {
      const pages = [createPage({ id: "p1", workspace_id: "ws-1" })];
      useWorkspaceStore.getState().replaceWorkspaceSnapshot("ws-1", {
        workspace: createWorkspace({ id: "ws-1" }),
        accessMode: "member",
        workspaceRole: "member",
        pages,
        members: [],
      });
      expect(useWorkspaceStore.getState().snapshotsByWorkspaceId["ws-1"].pages).toEqual(pages);
    });

    it("addPageToSnapshot appends the new page", () => {
      useWorkspaceStore.getState().replaceWorkspaceSnapshot("ws-1", {
        workspace: createWorkspace({ id: "ws-1" }),
        accessMode: "member",
        workspaceRole: "member",
        pages: [],
        members: [],
      });
      const page = createPage({ id: "p1", workspace_id: "ws-1" });
      useWorkspaceStore.getState().addPageToSnapshot("ws-1", page);
      expect(useWorkspaceStore.getState().snapshotsByWorkspaceId["ws-1"].pages).toHaveLength(1);
      expect(useWorkspaceStore.getState().snapshotsByWorkspaceId["ws-1"].pages[0]).toEqual(page);
    });

    it("upsertPageInSnapshot updates an existing page without a caller-side existence check", () => {
      const existing = createPage({ id: "p1", workspace_id: "ws-1", title: "Old", icon: null });
      useWorkspaceStore.getState().replaceWorkspaceSnapshot("ws-1", {
        workspace: createWorkspace({ id: "ws-1" }),
        accessMode: "member",
        workspaceRole: "member",
        pages: [existing],
        members: [],
      });

      const incoming = { ...existing, title: "New", icon: "🌿" };
      useWorkspaceStore.getState().upsertPageInSnapshot("ws-1", incoming);

      const page = useWorkspaceStore.getState().snapshotsByWorkspaceId["ws-1"].pages[0];
      expect(page.title).toBe("New");
      expect(page.icon).toBe("🌿");
    });

    it("updatePageInSnapshot reflects updates in the workspace snapshot", () => {
      const page = createPage({ id: "p1", workspace_id: "ws-1", title: "Old" });
      useWorkspaceStore.getState().replaceWorkspaceSnapshot("ws-1", {
        workspace: createWorkspace({ id: "ws-1" }),
        accessMode: "member",
        workspaceRole: "member",
        pages: [page],
        members: [],
      });
      useWorkspaceStore.getState().updatePageInSnapshot("ws-1", "p1", { title: "New" });
      expect(useWorkspaceStore.getState().snapshotsByWorkspaceId["ws-1"].pages[0].title).toBe("New");
    });

    it("removePageFromSnapshot removes the page from the workspace snapshot", () => {
      const page = createPage({ id: "p1", workspace_id: "ws-1" });
      useWorkspaceStore.getState().replaceWorkspaceSnapshot("ws-1", {
        workspace: createWorkspace({ id: "ws-1" }),
        accessMode: "member",
        workspaceRole: "member",
        pages: [page],
        members: [],
      });
      useWorkspaceStore.getState().removePageFromSnapshot("ws-1", "p1");
      expect(useWorkspaceStore.getState().snapshotsByWorkspaceId["ws-1"].pages).toHaveLength(0);
    });

    it("archivePageInSnapshot removes page and promotes children", () => {
      const parent = createPage({ id: "parent", workspace_id: "ws-1", parent_id: null });
      const child = createPage({ id: "child", workspace_id: "ws-1", parent_id: "parent" });
      const sibling = createPage({ id: "sibling", workspace_id: "ws-1", parent_id: null });
      useWorkspaceStore.getState().replaceWorkspaceSnapshot("ws-1", {
        workspace: createWorkspace({ id: "ws-1" }),
        accessMode: "member",
        workspaceRole: "member",
        pages: [parent, child, sibling],
        members: [],
      });

      useWorkspaceStore.getState().archivePageInSnapshot("ws-1", "parent");

      const pages = useWorkspaceStore.getState().snapshotsByWorkspaceId["ws-1"].pages;
      expect(pages.find((p) => p.id === "parent")).toBeUndefined();
      expect(pages.find((p) => p.id === "child")!.parent_id).toBeNull();
      expect(pages.find((p) => p.id === "sibling")!.parent_id).toBeNull();
    });

    it("removeWorkspaceSnapshot drops the workspace snapshot only", () => {
      const page = createPage({ id: "p1", workspace_id: "ws-1" });
      const otherPage = createPage({ id: "p2", workspace_id: "ws-2" });
      useWorkspaceStore.getState().replaceWorkspaceSnapshot("ws-1", {
        workspace: createWorkspace({ id: "ws-1" }),
        accessMode: "member",
        workspaceRole: "member",
        pages: [page],
        members: [],
      });
      useWorkspaceStore.getState().replaceWorkspaceSnapshot("ws-2", {
        workspace: createWorkspace({ id: "ws-2" }),
        accessMode: "member",
        workspaceRole: "member",
        pages: [otherPage],
        members: [],
      });

      useWorkspaceStore.getState().removeWorkspaceSnapshot("ws-1");
      expect(useWorkspaceStore.getState().snapshotsByWorkspaceId["ws-1"]).toBeUndefined();
      expect(useWorkspaceStore.getState().snapshotsByWorkspaceId["ws-2"]?.pages[0]).toEqual(otherPage);
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
        workspaceRole: "member",
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
        workspaceRole: "member",
        pages: [createPage()],
        members: [],
      });

      const cacheMod = await import("@/client/lib/doc-cache-registry");

      useWorkspaceStore.getState().validateCacheOwner("user-2");

      expect(cacheMod.docCache.clearAll).toHaveBeenCalled();
      expect(useWorkspaceStore.getState().snapshotsByWorkspaceId).toEqual({});
      expect(useWorkspaceStore.getState().cacheUserId).toBe("user-2");
    });
  });

  describe("resetStore", () => {
    it("clears all cache state", () => {
      useWorkspaceStore.getState().setMemberWorkspaces([createMembershipSummary()]);

      useWorkspaceStore.getState().resetStore();

      const state = useWorkspaceStore.getState();
      expect(state.memberWorkspaces).toEqual([]);
      expect(state.snapshotsByWorkspaceId).toEqual({});
    });

    it("updates cacheUserId when provided", () => {
      useWorkspaceStore.getState().validateCacheOwner("user-1");
      useWorkspaceStore.getState().resetStore("user-2");
      expect(useWorkspaceStore.getState().cacheUserId).toBe("user-2");
    });
  });

  describe("member workspace mutations", () => {
    it("upsertMemberWorkspace adds new workspace", () => {
      const ws = createMembershipSummary({ id: "ws-1" });
      useWorkspaceStore.getState().upsertMemberWorkspace(ws);
      expect(useWorkspaceStore.getState().memberWorkspaces).toEqual([ws]);
    });

    it("upsertMemberWorkspace updates existing workspace", () => {
      const ws = createMembershipSummary({ id: "ws-1", name: "Old" });
      useWorkspaceStore.getState().setMemberWorkspaces([ws]);
      const updated = createMembershipSummary({ id: "ws-1", name: "New" });
      useWorkspaceStore.getState().upsertMemberWorkspace(updated);
      expect(useWorkspaceStore.getState().memberWorkspaces).toEqual([updated]);
    });

    it("patchMemberWorkspace merges plain Workspace updates without overwriting role", () => {
      useWorkspaceStore.getState().setMemberWorkspaces([createMembershipSummary({ id: "ws-1", role: "guest" })]);
      const plainPatch = createWorkspace({ id: "ws-1", name: "Renamed" });
      useWorkspaceStore.getState().patchMemberWorkspace("ws-1", plainPatch);
      expect(useWorkspaceStore.getState().memberWorkspaces[0]).toMatchObject({
        id: "ws-1",
        name: "Renamed",
        role: "guest",
      });
    });

    it("removeMemberWorkspace filters by id", () => {
      useWorkspaceStore
        .getState()
        .setMemberWorkspaces([createMembershipSummary({ id: "ws-1" }), createMembershipSummary({ id: "ws-2" })]);
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
        workspaceRole: "member",
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
        workspaceRole: "member",
        pages: [],
        members: [],
      });
      useWorkspaceStore.getState().removeWorkspaceSnapshot("ws-1");
      expect(useWorkspaceStore.getState().lastVisitedWorkspaceId).toBe("ws-2");
    });
  });

  describe("cached page access", () => {
    it("upsertPageAccess stores the per-page access mode", () => {
      useWorkspaceStore.getState().upsertPageAccess("page-1", "view");
      expect(useWorkspaceStore.getState().pageAccessByPageId["page-1"]).toBe("view");
      useWorkspaceStore.getState().upsertPageAccess("page-1", "edit");
      expect(useWorkspaceStore.getState().pageAccessByPageId["page-1"]).toBe("edit");
    });

    it("resetStore clears persisted page access", () => {
      useWorkspaceStore.getState().upsertPageAccess("page-1", "edit");
      useWorkspaceStore.getState().resetStore();
      expect(useWorkspaceStore.getState().pageAccessByPageId).toEqual({});
    });

    it("migrates v4 persisted state by seeding an empty pageAccessByPageId map", async () => {
      const hadWindow = "window" in globalThis;
      const originalWindow = (globalThis as Record<string, unknown>).window;

      localStorage.setItem(
        STORAGE_KEYS.WORKSPACE,
        JSON.stringify({
          state: {
            memberWorkspaces: [],
            sharedInbox: [],
            snapshotsByWorkspaceId: {},
            lastVisitedWorkspaceId: null,
            lastVisitedPageIdByWorkspaceId: {},
            cacheUserId: "user-1",
          },
          version: 4,
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

        expect(state.pageAccessByPageId).toEqual({});
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
});
