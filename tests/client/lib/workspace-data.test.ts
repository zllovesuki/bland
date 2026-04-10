import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPage, createMember, createWorkspace } from "@tests/client/util/fixtures";
import type { WorkspaceAccessMode } from "@/client/lib/workspace-data";
import type { Page, Workspace, WorkspaceMember } from "@/shared/types";

let loadWorkspaceRouteData: typeof import("@/client/lib/workspace-data").loadWorkspaceRouteData;
let loadPageRouteData: typeof import("@/client/lib/workspace-data").loadPageRouteData;
let bootstrapWorkspaceData: typeof import("@/client/lib/workspace-data").bootstrapWorkspaceData;

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
  bootstrapWorkspaceData = mod.bootstrapWorkspaceData;
  loadWorkspaceRouteData = mod.loadWorkspaceRouteData;
  loadPageRouteData = mod.loadPageRouteData;
});

afterEach(() => {
  vi.restoreAllMocks();
});

function createMockStore() {
  return {
    setAccessMode: vi.fn(),
    setPages: vi.fn(),
    setMembers: vi.fn(),
  };
}

interface MockRouteStore {
  accessMode: WorkspaceAccessMode | null;
  workspaces: Workspace[];
  setAccessMode: (mode: WorkspaceAccessMode | null) => void;
  setPages: (pages: Page[]) => void;
  setMembers: (members: WorkspaceMember[]) => void;
  setWorkspaces: (workspaces: Workspace[]) => void;
  setCurrentWorkspace: (workspace: Workspace | null) => void;
  clearWorkspaceContext: () => void;
}

function createRouteStore(overrides: Partial<MockRouteStore> = {}) {
  return {
    accessMode: null as WorkspaceAccessMode | null,
    workspaces: [],
    setAccessMode: vi.fn<(mode: WorkspaceAccessMode | null) => void>(),
    setPages: vi.fn<(pages: Page[]) => void>(),
    setMembers: vi.fn<(members: WorkspaceMember[]) => void>(),
    setWorkspaces: vi.fn<(workspaces: Workspace[]) => void>(),
    setCurrentWorkspace: vi.fn<(workspace: Workspace | null) => void>(),
    clearWorkspaceContext: vi.fn<() => void>(),
    ...overrides,
  };
}

describe("bootstrapWorkspaceData", () => {
  it("fetches only pages for shared access mode", async () => {
    const store = createMockStore();
    await bootstrapWorkspaceData(store, "ws-1", "shared");

    expect(store.setAccessMode).toHaveBeenCalledWith("shared");
    expect(store.setPages).toHaveBeenCalledWith(mockPages);
    expect(store.setMembers).toHaveBeenCalledWith([]);
  });

  it("fetches pages and members for member access mode", async () => {
    const store = createMockStore();
    await bootstrapWorkspaceData(store, "ws-1", "member");

    expect(store.setAccessMode).toHaveBeenCalledWith("member");
    expect(store.setPages).toHaveBeenCalledWith(mockPages);
    expect(store.setMembers).toHaveBeenCalledWith(mockWorkspaceMembers);
  });

  it("skips store writes when shouldSkipApply returns true (shared)", async () => {
    const store = createMockStore();
    await bootstrapWorkspaceData(store, "ws-1", "shared", () => true);

    expect(store.setAccessMode).toHaveBeenCalledWith("shared");
    expect(store.setPages).not.toHaveBeenCalled();
  });

  it("skips store writes when shouldSkipApply returns true (member)", async () => {
    const store = createMockStore();
    await bootstrapWorkspaceData(store, "ws-1", "member", () => true);

    expect(store.setAccessMode).toHaveBeenCalledWith("member");
    expect(store.setPages).not.toHaveBeenCalled();
    expect(store.setMembers).not.toHaveBeenCalled();
  });

  it("applies writes when shouldSkipApply returns false", async () => {
    const store = createMockStore();
    await bootstrapWorkspaceData(store, "ws-1", "member", () => false);

    expect(store.setPages).toHaveBeenCalledWith(mockPages);
    expect(store.setMembers).toHaveBeenCalledWith(mockWorkspaceMembers);
  });
});

describe("loadWorkspaceRouteData", () => {
  it("uses live workspaces when available and bootstraps the matched workspace", async () => {
    const liveWorkspace = createWorkspace({ id: "ws-live", slug: "live-workspace" });
    listWorkspacesMock.mockResolvedValue([createWorkspace({ id: "ws-other", slug: "other" }), liveWorkspace]);
    const store = createRouteStore({
      workspaces: [createWorkspace({ id: "ws-cached", slug: "cached-workspace" })],
    });

    await loadWorkspaceRouteData(store, "live-workspace", true);

    expect(listWorkspacesMock).toHaveBeenCalledOnce();
    expect(store.setWorkspaces).toHaveBeenCalledWith([
      createWorkspace({ id: "ws-other", slug: "other" }),
      liveWorkspace,
    ]);
    expect(store.setCurrentWorkspace).toHaveBeenCalledWith(liveWorkspace);
    expect(store.setAccessMode).toHaveBeenCalledWith("member");
    expect(listPagesMock).toHaveBeenCalledWith(liveWorkspace.id);
    expect(listMembersMock).toHaveBeenCalledWith(liveWorkspace.id);
    expect(store.setPages).toHaveBeenCalledWith(mockPages);
    expect(store.setMembers).toHaveBeenCalledWith(mockWorkspaceMembers);
    expect(store.clearWorkspaceContext).not.toHaveBeenCalled();
  });

  it("falls back to cached workspaces when api.workspaces.list() fails", async () => {
    const cachedWorkspace = createWorkspace({ id: "ws-cached", slug: "cached-workspace" });
    listWorkspacesMock.mockRejectedValue(new Error("offline"));
    const store = createRouteStore({
      workspaces: [cachedWorkspace],
    });

    await loadWorkspaceRouteData(store, "cached-workspace", true);

    expect(listWorkspacesMock).toHaveBeenCalledOnce();
    expect(store.setWorkspaces).not.toHaveBeenCalled();
    expect(store.setCurrentWorkspace).toHaveBeenCalledWith(cachedWorkspace);
    expect(store.setAccessMode).toHaveBeenCalledWith("member");
    expect(listPagesMock).toHaveBeenCalledWith(cachedWorkspace.id);
    expect(listMembersMock).toHaveBeenCalledWith(cachedWorkspace.id);
    expect(store.clearWorkspaceContext).not.toHaveBeenCalled();
  });

  it("clears workspace context when the remote list succeeds, the slug is missing, and isAuthenticated is true", async () => {
    listWorkspacesMock.mockResolvedValue([createWorkspace({ id: "ws-other", slug: "other" })]);
    const store = createRouteStore({
      workspaces: [createWorkspace({ id: "ws-cached", slug: "missing-workspace" })],
    });

    await loadWorkspaceRouteData(store, "missing-workspace", true);

    expect(store.setWorkspaces).toHaveBeenCalledWith([createWorkspace({ id: "ws-other", slug: "other" })]);
    expect(store.clearWorkspaceContext).toHaveBeenCalledOnce();
    expect(store.setCurrentWorkspace).not.toHaveBeenCalled();
    expect(store.setAccessMode).not.toHaveBeenCalled();
  });

  it("does not clear context on a remote miss when isAuthenticated is false", async () => {
    listWorkspacesMock.mockResolvedValue([createWorkspace({ id: "ws-other", slug: "other" })]);
    const store = createRouteStore({
      workspaces: [createWorkspace({ id: "ws-cached", slug: "missing-workspace" })],
    });

    await loadWorkspaceRouteData(store, "missing-workspace", false);

    expect(store.setWorkspaces).toHaveBeenCalledWith([createWorkspace({ id: "ws-other", slug: "other" })]);
    expect(store.clearWorkspaceContext).not.toHaveBeenCalled();
    expect(store.setCurrentWorkspace).not.toHaveBeenCalled();
    expect(store.setAccessMode).not.toHaveBeenCalled();
  });
});

describe("loadPageRouteData", () => {
  it("returns early when accessMode is already set", async () => {
    const store = createRouteStore({ accessMode: "member" });

    await expect(loadPageRouteData(store, "current-slug", "page-1")).resolves.toEqual({});

    expect(pageContextMock).not.toHaveBeenCalled();
    expect(store.setCurrentWorkspace).not.toHaveBeenCalled();
    expect(store.setAccessMode).not.toHaveBeenCalled();
    expect(listPagesMock).not.toHaveBeenCalled();
    expect(listMembersMock).not.toHaveBeenCalled();
  });

  it("bootstraps from api.pages.context(pageId)", async () => {
    const workspace = createWorkspace({ id: "ws-shared", slug: "shared-workspace" });
    pageContextMock.mockResolvedValue({
      workspace,
      page: createPage({ id: "page-7", workspace_id: workspace.id }),
      access_mode: "shared",
      can_edit: false,
    });
    const store = createRouteStore();

    await expect(loadPageRouteData(store, "shared-workspace", "page-7")).resolves.toEqual({});

    expect(pageContextMock).toHaveBeenCalledWith("page-7");
    expect(store.setCurrentWorkspace).toHaveBeenCalledWith(workspace);
    expect(store.setAccessMode).toHaveBeenCalledWith("shared");
    expect(listPagesMock).toHaveBeenCalledWith(workspace.id);
    expect(listMembersMock).not.toHaveBeenCalled();
    expect(store.setPages).toHaveBeenCalledWith(mockPages);
    expect(store.setMembers).toHaveBeenCalledWith([]);
  });

  it("returns canonicalWorkspaceSlug when the current slug is stale", async () => {
    const workspace = createWorkspace({ id: "ws-member", slug: "canonical-workspace" });
    pageContextMock.mockResolvedValue({
      workspace,
      page: createPage({ id: "page-8", workspace_id: workspace.id }),
      access_mode: "member",
      can_edit: true,
    });
    const store = createRouteStore();

    await expect(loadPageRouteData(store, "stale-workspace", "page-8")).resolves.toEqual({
      canonicalWorkspaceSlug: "canonical-workspace",
    });

    expect(pageContextMock).toHaveBeenCalledWith("page-8");
    expect(store.setCurrentWorkspace).toHaveBeenCalledWith(workspace);
    expect(store.setAccessMode).toHaveBeenCalledWith("member");
    expect(listPagesMock).toHaveBeenCalledWith(workspace.id);
    expect(listMembersMock).toHaveBeenCalledWith(workspace.id);
  });
});
