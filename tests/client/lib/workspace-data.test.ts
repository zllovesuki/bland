import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPage, createMember, createWorkspace } from "@tests/client/util/fixtures";
import type { Workspace, Page, WorkspaceMember } from "@/shared/types";
import type { WorkspaceAccessMode, WorkspaceSnapshot } from "@/client/stores/workspace-store";

let resolveWorkspaceRoute: typeof import("@/client/lib/workspace-data").resolveWorkspaceRoute;
let resolvePageRoute: typeof import("@/client/lib/workspace-data").resolvePageRoute;
let applyResolvedRoute: typeof import("@/client/lib/workspace-data").applyResolvedRoute;

const mockPages = [createPage({ id: "p1" }), createPage({ id: "p2" })];
const mockWorkspaceMembers = [createMember({ user_id: "u1" })];

const listPagesMock = vi.fn();
const listWorkspacesMock = vi.fn();
const listMembersMock = vi.fn();
const pageContextMock = vi.fn();

beforeEach(async () => {
  vi.resetModules();
  listPagesMock.mockReset().mockResolvedValue(mockPages);
  listWorkspacesMock.mockReset().mockResolvedValue([]);
  listMembersMock.mockReset().mockResolvedValue(mockWorkspaceMembers);
  pageContextMock.mockReset();
  vi.doMock("@/client/lib/api", () => ({
    api: {
      pages: {
        list: listPagesMock,
        context: pageContextMock,
      },
      workspaces: {
        list: listWorkspacesMock,
        members: listMembersMock,
      },
    },
  }));
  const mod = await import("@/client/lib/workspace-data");
  resolveWorkspaceRoute = mod.resolveWorkspaceRoute;
  resolvePageRoute = mod.resolvePageRoute;
  applyResolvedRoute = mod.applyResolvedRoute;
});

afterEach(() => {
  vi.restoreAllMocks();
});

function createCache(
  overrides: Partial<{
    memberWorkspaces: Workspace[];
    snapshotsByWorkspaceId: Record<string, WorkspaceSnapshot>;
    activeAccessMode: WorkspaceAccessMode | null;
  }> = {},
) {
  return {
    memberWorkspaces: [],
    snapshotsByWorkspaceId: {},
    activeAccessMode: null,
    ...overrides,
  };
}

describe("resolveWorkspaceRoute", () => {
  it("resolves from live workspace list and bootstraps data", async () => {
    const liveWs = createWorkspace({ id: "ws-live", slug: "live-ws" });
    listWorkspacesMock.mockResolvedValue([liveWs]);

    const result = await resolveWorkspaceRoute("live-ws", true, createCache());

    expect(result.kind).toBe("resolved");
    if (result.kind === "resolved") {
      expect(result.source).toBe("live");
      expect(result.data.workspace).toEqual(liveWs);
      expect(result.data.accessMode).toBe("member");
      expect(result.data.pages).toEqual(mockPages);
      expect(result.data.members).toEqual(mockWorkspaceMembers);
    }
  });

  it("returns unavailable when live list lacks the slug (may be shared-access)", async () => {
    listWorkspacesMock.mockResolvedValue([createWorkspace({ id: "ws-other", slug: "other" })]);

    const result = await resolveWorkspaceRoute("missing-slug", true, createCache());

    // unavailable, not not_found -- child page route may resolve via api.pages.context
    expect(result.kind).toBe("unavailable");
  });

  it("falls back to cached snapshot when api.workspaces.list() fails", async () => {
    listWorkspacesMock.mockRejectedValue(new Error("offline"));
    const ws = createWorkspace({ id: "ws-1", slug: "cached-ws" });
    const cache = createCache({
      snapshotsByWorkspaceId: {
        "ws-1": { workspace: ws, accessMode: "member", pages: mockPages, members: [] },
      },
    });

    const result = await resolveWorkspaceRoute("cached-ws", true, cache);

    expect(result.kind).toBe("resolved");
    if (result.kind === "resolved") {
      expect(result.source).toBe("cache");
      expect(result.data.workspace).toEqual(ws);
    }
  });

  it("returns unavailable when offline with no cached data", async () => {
    listWorkspacesMock.mockRejectedValue(new Error("offline"));

    const result = await resolveWorkspaceRoute("unknown", true, createCache());

    expect(result.kind).toBe("unavailable");
  });

  it("carries liveWorkspaces on resolved result for store update", async () => {
    const workspaces = [createWorkspace({ id: "ws-1", slug: "ws-slug" })];
    listWorkspacesMock.mockResolvedValue(workspaces);

    const result = await resolveWorkspaceRoute("ws-slug", true, createCache());

    expect(result.kind).toBe("resolved");
    if (result.kind === "resolved") {
      expect(result.liveWorkspaces).toEqual(workspaces);
    }
  });
});

describe("resolvePageRoute", () => {
  it("always calls api.pages.context even when parent route resolved", async () => {
    const ws = createWorkspace({ id: "ws-1", slug: "ws-slug" });
    pageContextMock.mockResolvedValue({
      workspace: ws,
      page: createPage({ id: "page-1", workspace_id: ws.id }),
      access_mode: "member",
      can_edit: true,
    });
    const cache = createCache({
      activeAccessMode: "member",
      snapshotsByWorkspaceId: {
        "ws-1": { workspace: ws, accessMode: "member", pages: mockPages, members: mockWorkspaceMembers },
      },
    });

    const result = await resolvePageRoute("ws-slug", "page-1", cache);

    expect(result.kind).toBe("resolved");
    if (result.kind === "resolved") {
      expect(result.source).toBe("live");
      expect(result.data.workspace).toEqual(ws);
      expect(pageContextMock).toHaveBeenCalledWith("page-1");
    }
  });

  it("falls back to cached snapshot when api.pages.context fails", async () => {
    const ws = createWorkspace({ id: "ws-1", slug: "ws-slug" });
    pageContextMock.mockRejectedValue(new Error("offline"));
    listPagesMock.mockRejectedValue(new Error("offline"));
    const cache = createCache({
      snapshotsByWorkspaceId: {
        "ws-1": { workspace: ws, accessMode: "shared", pages: mockPages, members: [] },
      },
    });

    const result = await resolvePageRoute("ws-slug", "page-1", cache);

    expect(result.kind).toBe("resolved");
    if (result.kind === "resolved") {
      expect(result.source).toBe("cache");
      expect(result.data.accessMode).toBe("shared");
    }
  });

  it("bootstraps from api.pages.context when no active context", async () => {
    const ws = createWorkspace({ id: "ws-shared", slug: "shared-ws" });
    pageContextMock.mockResolvedValue({
      workspace: ws,
      page: createPage({ id: "page-7", workspace_id: ws.id }),
      access_mode: "shared",
      can_edit: false,
    });

    const result = await resolvePageRoute("shared-ws", "page-7", createCache());

    expect(result.kind).toBe("resolved");
    if (result.kind === "resolved") {
      expect(result.source).toBe("live");
      expect(result.data.accessMode).toBe("shared");
      expect(listPagesMock).toHaveBeenCalledWith(ws.id);
      expect(listMembersMock).not.toHaveBeenCalled();
    }
  });

  it("returns canonicalSlug when URL slug is stale", async () => {
    const ws = createWorkspace({ id: "ws-1", slug: "canonical-slug" });
    pageContextMock.mockResolvedValue({
      workspace: ws,
      page: createPage({ id: "page-8", workspace_id: ws.id }),
      access_mode: "member",
      can_edit: true,
    });

    const result = await resolvePageRoute("stale-slug", "page-8", createCache());

    expect(result.kind).toBe("resolved");
    if (result.kind === "resolved") {
      expect(result.data.canonicalSlug).toBe("canonical-slug");
    }
  });

  it("returns not_found when api.pages.context returns a server error", async () => {
    pageContextMock.mockRejectedValue({ error: "not_found", message: "Page not found" });

    const result = await resolvePageRoute("ws-slug", "bad-page", createCache());

    expect(result.kind).toBe("not_found");
  });

  it("returns unavailable on network error with no cached snapshot", async () => {
    pageContextMock.mockRejectedValue(new Error("Network error"));

    const result = await resolvePageRoute("ws-slug", "page-1", createCache());

    expect(result.kind).toBe("unavailable");
  });

  it("treats auth-refresh transport failure as non-definitive (falls back to cache)", async () => {
    // apiFetch rethrows structured { error: "unauthorized" } on refresh transport failure
    pageContextMock.mockRejectedValue({ error: "unauthorized", message: "Unauthorized" });
    const ws = createWorkspace({ id: "ws-1", slug: "ws-slug" });
    const cache = createCache({
      snapshotsByWorkspaceId: {
        "ws-1": { workspace: ws, accessMode: "shared", pages: mockPages, members: [] },
      },
    });

    const result = await resolvePageRoute("ws-slug", "page-1", cache);

    // Should fall through to cache, not return not_found
    expect(result.kind).toBe("resolved");
    if (result.kind === "resolved") {
      expect(result.source).toBe("cache");
    }
  });

  it("treats generic request_failed as non-definitive", async () => {
    pageContextMock.mockRejectedValue({ error: "request_failed", message: "Request failed with status 500" });

    const result = await resolvePageRoute("ws-slug", "page-1", createCache());

    // No cache available, should be unavailable not not_found
    expect(result.kind).toBe("unavailable");
  });
});

describe("applyResolvedRoute", () => {
  it("applies resolved result to store", () => {
    const store = {
      setMemberWorkspaces: vi.fn(),
      replaceWorkspaceSnapshot: vi.fn(),
      setActiveRoute: vi.fn(),
      clearActiveRoute: vi.fn(),
      setLastVisitedWorkspaceId: vi.fn(),
    };

    const ws = createWorkspace({ id: "ws-1" });
    applyResolvedRoute(store, {
      kind: "resolved",
      source: "live",
      liveWorkspaces: [ws],
      data: {
        workspaceId: "ws-1",
        workspace: ws,
        accessMode: "member",
        pages: mockPages,
        members: mockWorkspaceMembers,
      },
    });

    expect(store.setMemberWorkspaces).toHaveBeenCalledWith([ws]);
    expect(store.replaceWorkspaceSnapshot).toHaveBeenCalledWith("ws-1", {
      workspace: ws,
      accessMode: "member",
      pages: mockPages,
      members: mockWorkspaceMembers,
    });
    expect(store.setActiveRoute).toHaveBeenCalledWith("ws-1", "member");
    expect(store.setLastVisitedWorkspaceId).toHaveBeenCalledWith("ws-1");
  });

  it("clears active route on not_found", () => {
    const store = {
      setMemberWorkspaces: vi.fn(),
      replaceWorkspaceSnapshot: vi.fn(),
      setActiveRoute: vi.fn(),
      clearActiveRoute: vi.fn(),
      setLastVisitedWorkspaceId: vi.fn(),
    };

    applyResolvedRoute(store, { kind: "not_found", liveWorkspaces: [createWorkspace()] });

    expect(store.clearActiveRoute).toHaveBeenCalled();
    expect(store.setMemberWorkspaces).toHaveBeenCalled();
  });
});
