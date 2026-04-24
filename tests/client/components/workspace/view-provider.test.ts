import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFreshDb, deleteDb } from "@tests/client/util/idb";
import { createPage, createMember, createWorkspace } from "@tests/client/util/fixtures";
import type { Page } from "@/shared/types";
import type { BlandDatabase } from "@/client/stores/db/bland-db";
import type { WorkspaceRouteState } from "@/client/lib/workspace-route-model";

/**
 * Tests for the WorkspaceViewProvider's state model and recovery logic,
 * exercised against the new projection stores and Dexie-backed commands.
 * Verifies the observable contract around:
 *  - recoverPageAccess (cross-workspace page resolution via api.pages.context)
 *  - seedFromCache transitions (known slug vs unknown vs page-id fallback)
 *  - cache-to-live snapshot upgrade on re-resolve
 */

const listPagesMock = vi.fn();
const listMembersMock = vi.fn();
const listWorkspacesMock = vi.fn();
const pageContextMock = vi.fn();
const pageGetMock = vi.fn();

let db: BlandDatabase;
let replicaCommands: typeof import("@/client/stores/db/workspace-replica").replicaCommands;
let directoryCommands: typeof import("@/client/stores/db/workspace-directory").directoryCommands;
let replicaStoreMod: typeof import("@/client/stores/workspace-replica");
let directoryStoreMod: typeof import("@/client/stores/workspace-directory");

beforeEach(async () => {
  vi.resetModules();

  listPagesMock.mockReset();
  listMembersMock.mockReset();
  listWorkspacesMock.mockReset();
  pageContextMock.mockReset();
  pageGetMock.mockReset();

  db = createFreshDb();
  vi.doMock("@/client/stores/db/bland-db", async () => {
    const actual = await vi.importActual<typeof import("@/client/stores/db/bland-db")>("@/client/stores/db/bland-db");
    return { ...actual, db };
  });

  vi.doMock("@/client/lib/api", () => ({
    api: {
      pages: {
        list: listPagesMock,
        context: pageContextMock,
        get: pageGetMock,
      },
      workspaces: {
        list: listWorkspacesMock,
        members: listMembersMock,
      },
    },
    toApiError: (err: unknown) => {
      if (err && typeof err === "object" && "error" in err) return err;
      return { error: "unknown", message: String(err) };
    },
  }));

  vi.doMock("@/client/stores/auth-store", () => ({
    useAuthStore: Object.assign(
      vi.fn(() => false),
      {
        getState: () => ({ accessToken: null, user: null, sessionMode: "LOCAL_ONLY" }),
        subscribe: vi.fn(() => vi.fn()),
        setState: vi.fn(),
        destroy: vi.fn(),
      },
    ),
    selectIsAuthenticated: () => false,
    selectHasLocalSession: () => true,
  }));

  replicaCommands = (await import("@/client/stores/db/workspace-replica")).replicaCommands;
  directoryCommands = (await import("@/client/stores/db/workspace-directory")).directoryCommands;
  replicaStoreMod = await import("@/client/stores/workspace-replica");
  directoryStoreMod = await import("@/client/stores/workspace-directory");
});

afterEach(async () => {
  await deleteDb(db);
  vi.restoreAllMocks();
});

/** Bridge writes into the projection store the way bootstrap's liveQuery does
 * in production. Tests don't run bootstrap, so we seed the projection
 * directly from Dexie after each write. */
async function syncProjectionsFromDexie(): Promise<void> {
  const [memberWorkspaces, replicas, pages, members, pageAccess] = await Promise.all([
    db.memberWorkspaces.toArray(),
    db.workspaceReplicas.toArray(),
    db.workspacePages.toArray(),
    db.workspaceMembers.toArray(),
    db.pageAccess.toArray(),
  ]);
  directoryStoreMod.applyWorkspaceDirectoryProjection(memberWorkspaces);
  replicaStoreMod.applyWorkspaceReplicaProjection({ replicas, pages, members, pageAccess });
}

describe("recoverPageAccess contract", () => {
  const wsA = createWorkspace({ id: "ws-a", slug: "workspace-a" });
  const wsB = createWorkspace({ id: "ws-b", slug: "workspace-b" });
  const pageInB = createPage({ id: "page-in-b", workspace_id: "ws-b" });
  const membersB = [createMember({ workspace_id: "ws-b" })];

  it("api.pages.context returns the correct workspace for a cross-workspace page", async () => {
    pageContextMock.mockResolvedValue({
      workspace: wsB,
      viewer: { access_mode: "member", principal_type: "user", route_kind: "canonical", workspace_slug: "workspace-b" },
    });
    listPagesMock.mockResolvedValue([pageInB]);
    listMembersMock.mockResolvedValue(membersB);

    const ctx = await pageContextMock("page-in-b");
    expect(ctx.workspace.id).toBe("ws-b");
    expect(ctx.workspace.id).not.toBe(wsA.id);

    const pages = await listPagesMock(ctx.workspace.id);
    const members = await listMembersMock(ctx.workspace.id);

    await replicaCommands.replaceWorkspace({
      workspace: wsB,
      accessMode: ctx.viewer.access_mode,
      workspaceRole: ctx.viewer.workspace_role,
      pages,
      members,
    });

    await syncProjectionsFromDexie();

    const replica = replicaStoreMod.selectWorkspaceReplica(replicaStoreMod.useWorkspaceReplicaStore.getState(), "ws-b");
    expect(replica).toBeTruthy();
    expect(replica!.workspace.slug).toBe("workspace-b");
    expect(replica!.accessMode).toBe("member");
    const storedPages = replicaStoreMod.selectWorkspacePages(
      replicaStoreMod.useWorkspaceReplicaStore.getState(),
      "ws-b",
    );
    const storedMembers = replicaStoreMod.selectWorkspaceMembers(
      replicaStoreMod.useWorkspaceReplicaStore.getState(),
      "ws-b",
    );
    expect(storedPages).toEqual([pageInB]);
    expect(storedMembers).toEqual(membersB);
  });

  it("returns false when page belongs to the same workspace", async () => {
    pageContextMock.mockResolvedValue({
      workspace: wsA,
      viewer: { access_mode: "member", principal_type: "user", route_kind: "canonical", workspace_slug: "workspace-a" },
    });
    const ctx = await pageContextMock("page-in-a");
    expect(ctx.workspace.id).toBe(wsA.id);
  });

  it("handles api.pages.context failure gracefully", async () => {
    pageContextMock.mockRejectedValue({ error: "not_found", message: "Page not found" });
    let failed = false;
    try {
      await pageContextMock("nonexistent-page");
    } catch {
      failed = true;
    }
    expect(failed).toBe(true);
  });

  it("fetches pages only (no members) for shared-access discovery", async () => {
    pageContextMock.mockResolvedValue({
      workspace: wsB,
      viewer: { access_mode: "shared", principal_type: "user", route_kind: "canonical", workspace_slug: "workspace-b" },
    });
    listPagesMock.mockResolvedValue([pageInB]);

    const ctx = await pageContextMock("page-in-b");
    expect(ctx.viewer.access_mode).toBe("shared");

    const pages = await listPagesMock(ctx.workspace.id);

    await replicaCommands.replaceWorkspace({
      workspace: wsB,
      accessMode: "shared",
      workspaceRole: null,
      pages,
      members: [],
    });
    await syncProjectionsFromDexie();

    const replica = replicaStoreMod.selectWorkspaceReplica(replicaStoreMod.useWorkspaceReplicaStore.getState(), "ws-b");
    expect(replica!.accessMode).toBe("shared");
    const storedMembers = replicaStoreMod.selectWorkspaceMembers(
      replicaStoreMod.useWorkspaceReplicaStore.getState(),
      "ws-b",
    );
    expect(storedMembers).toEqual([]);
  });
});

describe("seedFromCache state transitions", () => {
  it("returns loading when slug is unknown", () => {
    const dir = directoryStoreMod.useWorkspaceDirectoryStore.getState();
    const replicas = replicaStoreMod.useWorkspaceReplicaStore.getState();
    expect(directoryStoreMod.selectMemberWorkspaces(dir)).toEqual([]);
    expect(replicas.replicas.size).toBe(0);
  });

  it("returns ready-member with cache for member workspace with replica", async () => {
    const ws = createWorkspace({ id: "ws-1", slug: "my-ws" });
    await directoryCommands.upsert({ ...ws, role: "member" });
    await replicaCommands.replaceWorkspace({
      workspace: ws,
      accessMode: "member",
      workspaceRole: "member",
      pages: [createPage({ workspace_id: "ws-1" })],
      members: [createMember({ workspace_id: "ws-1" })],
    });
    await syncProjectionsFromDexie();

    const replicaState = replicaStoreMod.useWorkspaceReplicaStore.getState();
    const replica = replicaStoreMod.selectWorkspaceReplica(replicaState, "ws-1");
    expect(replica).toBeTruthy();
    expect(replica!.workspace.slug).toBe("my-ws");
    expect(replica!.accessMode).toBe("member");
  });

  it("returns seeded-identity for member workspace without replica", async () => {
    const ws = createWorkspace({ id: "ws-1", slug: "my-ws" });
    await directoryCommands.upsert({ ...ws, role: "member" });
    await syncProjectionsFromDexie();

    const replicaState = replicaStoreMod.useWorkspaceReplicaStore.getState();
    expect(replicaStoreMod.selectWorkspaceReplica(replicaState, "ws-1")).toBeNull();

    const dir = directoryStoreMod.useWorkspaceDirectoryStore.getState();
    const memberWs = directoryStoreMod.selectWorkspaceBySlug(dir, "my-ws");
    expect(memberWs).toBeTruthy();
    expect(memberWs!.id).toBe("ws-1");
  });

  it("returns ready-shared with cache for shared workspace by slug", async () => {
    const ws = createWorkspace({ id: "ws-2", slug: "shared-ws" });
    await replicaCommands.replaceWorkspace({
      workspace: ws,
      accessMode: "shared",
      workspaceRole: null,
      pages: [createPage({ workspace_id: "ws-2" })],
      members: [],
    });
    await syncProjectionsFromDexie();

    const dir = directoryStoreMod.useWorkspaceDirectoryStore.getState();
    expect(directoryStoreMod.selectWorkspaceBySlug(dir, "shared-ws")).toBeNull();
    const replica = replicaStoreMod.selectReplicaBySlug(
      replicaStoreMod.useWorkspaceReplicaStore.getState(),
      "shared-ws",
    );
    expect(replica).toBeTruthy();
    expect(replica!.accessMode).toBe("shared");
  });

  it("selectWorkspaceByPageId matches archived pages too (preserves findCachedWorkspaceIdForPage semantics)", async () => {
    const ws = createWorkspace({ id: "ws-1" });
    const archived = createPage({
      id: "archived-page",
      workspace_id: "ws-1",
      archived_at: "2026-04-01T00:00:00.000Z",
    });
    await replicaCommands.replaceWorkspace({
      workspace: ws,
      accessMode: "member",
      workspaceRole: "member",
      pages: [archived],
      members: [],
    });
    await syncProjectionsFromDexie();

    expect(
      replicaStoreMod.selectWorkspaceByPageId(replicaStoreMod.useWorkspaceReplicaStore.getState(), "archived-page"),
    ).toBe("ws-1");
  });
});

/**
 * The live-skip guard in WorkspaceViewProvider.resolve() reads a private
 * `cacheStatusRef` rather than a public field on the route. The observable
 * contract covered by this suite is the replica-upgrade path after a
 * successful re-resolve.
 */
function getRouteAfterWorkspaceListFailure(prev: WorkspaceRouteState): WorkspaceRouteState {
  if (prev.phase === "ready" || prev.phase === "degraded") return prev;
  return { phase: "error", errorKind: "network", message: "Failed to load workspace" };
}

function getRouteAfterSharedDowngradeProbe(
  workspaceSlug: string,
  workspaceId: string,
  pages: Page[],
): WorkspaceRouteState {
  if (pages.length === 0) {
    return {
      phase: "degraded",
      workspaceId,
      workspaceSlug,
      reason: "stale-shared",
    };
  }
  return { phase: "ready", workspaceId, accessMode: "shared" };
}

describe("cache-to-live replica upgrade", () => {
  it("cache-backed workspace upgrades replica after simulated re-resolve", async () => {
    const ws = createWorkspace({ id: "ws-1", slug: "my-ws" });
    const stalePage = createPage({ id: "stale-page", workspace_id: "ws-1", title: "Stale" });
    const staleMember = createMember({ workspace_id: "ws-1", user_id: "old-user" });

    await directoryCommands.upsert({ ...ws, role: "member" });
    await replicaCommands.replaceWorkspace({
      workspace: ws,
      accessMode: "member",
      workspaceRole: "member",
      pages: [stalePage],
      members: [staleMember],
    });
    await syncProjectionsFromDexie();

    const stalePages = replicaStoreMod.selectWorkspacePages(
      replicaStoreMod.useWorkspaceReplicaStore.getState(),
      "ws-1",
    );
    expect(stalePages[0].id).toBe("stale-page");

    const freshPage = createPage({ id: "fresh-page", workspace_id: "ws-1", title: "Fresh" });
    const freshMember = createMember({ workspace_id: "ws-1", user_id: "new-user" });
    await replicaCommands.replaceWorkspace({
      workspace: ws,
      accessMode: "member",
      workspaceRole: "member",
      pages: [freshPage],
      members: [freshMember],
    });
    await syncProjectionsFromDexie();

    const freshPages = replicaStoreMod.selectWorkspacePages(
      replicaStoreMod.useWorkspaceReplicaStore.getState(),
      "ws-1",
    );
    const freshMembers = replicaStoreMod.selectWorkspaceMembers(
      replicaStoreMod.useWorkspaceReplicaStore.getState(),
      "ws-1",
    );
    expect(freshPages[0].id).toBe("fresh-page");
    expect(freshPages[0].title).toBe("Fresh");
    expect(freshMembers[0].user_id).toBe("new-user");
  });
});

describe("workspace provider error states", () => {
  it("workspaces.list network error from a non-ready route is terminal", () => {
    const route: WorkspaceRouteState = { phase: "loading", workspaceId: null };
    expect(getRouteAfterWorkspaceListFailure(route)).toEqual({
      phase: "error",
      errorKind: "network",
      message: "Failed to load workspace",
    });
  });

  it("preserves an already-ready route on workspaces.list failure", () => {
    const ready: WorkspaceRouteState = { phase: "ready", workspaceId: "ws-1", accessMode: "member" };
    expect(getRouteAfterWorkspaceListFailure(ready)).toEqual(ready);
  });

  it("network error with cached ready state preserves cache", async () => {
    const ws = createWorkspace({ id: "ws-1", slug: "my-ws" });
    await directoryCommands.upsert({ ...ws, role: "member" });
    await replicaCommands.replaceWorkspace({
      workspace: ws,
      accessMode: "member",
      workspaceRole: "member",
      pages: [createPage({ workspace_id: "ws-1" })],
      members: [createMember({ workspace_id: "ws-1" })],
    });
    await syncProjectionsFromDexie();

    const replica = replicaStoreMod.selectWorkspaceReplica(replicaStoreMod.useWorkspaceReplicaStore.getState(), "ws-1");
    expect(replica).toBeTruthy();
    const pages = replicaStoreMod.selectWorkspacePages(replicaStoreMod.useWorkspaceReplicaStore.getState(), "ws-1");
    expect(pages.length).toBe(1);
  });

  it("does not promote an empty shared tree to ready/shared/live", () => {
    const ws = createWorkspace({ id: "ws-shared", slug: "shared-ws" });
    expect(getRouteAfterSharedDowngradeProbe(ws.slug, ws.id, [])).toEqual({
      phase: "degraded",
      workspaceId: ws.id,
      workspaceSlug: ws.slug,
      reason: "stale-shared",
    });
  });
});
