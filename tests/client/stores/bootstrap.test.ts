import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFreshDb, deleteDb } from "@tests/client/util/idb";
import { createMembershipSummary, createPage } from "@tests/client/util/fixtures";
import { SESSION_MODES } from "@/client/lib/constants";
import type { BlandDatabase } from "@/client/stores/db/bland-db";

let db: BlandDatabase;
let bootstrap: typeof import("@/client/stores/bootstrap");
let replicaCommands: typeof import("@/client/stores/db/workspace-replica").replicaCommands;
let directoryCommands: typeof import("@/client/stores/db/workspace-directory").directoryCommands;
let directoryStore: typeof import("@/client/stores/workspace-directory").useWorkspaceDirectoryStore;
let replicaStore: typeof import("@/client/stores/workspace-replica").useWorkspaceReplicaStore;
let navigationStore: typeof import("@/client/stores/workspace-navigation").useWorkspaceNavigationStore;

const docCacheClear = vi.fn();
const queryClientClear = vi.fn();

beforeEach(async () => {
  vi.resetModules();
  docCacheClear.mockReset();
  queryClientClear.mockReset();
  db = createFreshDb();
  vi.doMock("@/client/stores/db/bland-db", async () => {
    const actual = await vi.importActual<typeof import("@/client/stores/db/bland-db")>("@/client/stores/db/bland-db");
    return { ...actual, db };
  });
  vi.doMock("@/client/lib/doc-cache-registry", () => ({
    docCache: { clearAll: docCacheClear, has: () => false, mark: () => {}, remove: () => {} },
  }));
  vi.doMock("@/client/lib/query-client", () => ({
    queryClient: { clear: queryClientClear },
  }));

  bootstrap = await import("@/client/stores/bootstrap");
  replicaCommands = (await import("@/client/stores/db/workspace-replica")).replicaCommands;
  directoryCommands = (await import("@/client/stores/db/workspace-directory")).directoryCommands;
  directoryStore = (await import("@/client/stores/workspace-directory")).useWorkspaceDirectoryStore;
  replicaStore = (await import("@/client/stores/workspace-replica")).useWorkspaceReplicaStore;
  navigationStore = (await import("@/client/stores/workspace-navigation")).useWorkspaceNavigationStore;
});

afterEach(async () => {
  bootstrap.teardownWorkspaceLocalOwner();
  await deleteDb(db);
  vi.restoreAllMocks();
});

describe("getNeedsLocalWorkspace", () => {
  it("returns false for anonymous sessions regardless of path", () => {
    expect(bootstrap.getNeedsLocalWorkspace("/", SESSION_MODES.ANONYMOUS)).toBe(false);
    expect(bootstrap.getNeedsLocalWorkspace("/my-workspace", SESSION_MODES.ANONYMOUS)).toBe(false);
  });

  it("returns false on login / invite / share-token routes", () => {
    expect(bootstrap.getNeedsLocalWorkspace("/login", SESSION_MODES.AUTHENTICATED)).toBe(false);
    expect(bootstrap.getNeedsLocalWorkspace("/invite/abc", SESSION_MODES.AUTHENTICATED)).toBe(false);
    expect(bootstrap.getNeedsLocalWorkspace("/s/xyz", SESSION_MODES.LOCAL_ONLY)).toBe(false);
  });

  it("returns true on authenticated / local-only / expired sessions for workspace-ish paths", () => {
    expect(bootstrap.getNeedsLocalWorkspace("/", SESSION_MODES.AUTHENTICATED)).toBe(true);
    expect(bootstrap.getNeedsLocalWorkspace("/profile", SESSION_MODES.AUTHENTICATED)).toBe(true);
    expect(bootstrap.getNeedsLocalWorkspace("/shared-with-me", SESSION_MODES.AUTHENTICATED)).toBe(true);
    expect(bootstrap.getNeedsLocalWorkspace("/my-workspace", SESSION_MODES.LOCAL_ONLY)).toBe(true);
    expect(bootstrap.getNeedsLocalWorkspace("/my-workspace/page", SESSION_MODES.EXPIRED)).toBe(true);
  });
});

describe("ensureWorkspaceLocalOwner", () => {
  it("no-ops when needsLocal is false: does not open Dexie or seed stores", async () => {
    await bootstrap.ensureWorkspaceLocalOwner("user-1", false);
    expect(db.isOpen()).toBe(false);
    expect(directoryStore.getState().workspaces).toEqual([]);
  });

  it("first call with a userId writes the owner meta row and seeds empty projections", async () => {
    await bootstrap.ensureWorkspaceLocalOwner("user-1", true);
    expect((await db.workspaceMeta.get("owner"))?.value).toBe("user-1");
    expect(directoryStore.getState().workspaces).toEqual([]);
  });

  it("same-owner reopen preserves persisted data", async () => {
    await bootstrap.ensureWorkspaceLocalOwner("user-1", true);
    await directoryCommands.upsert(createMembershipSummary({ id: "ws-1" }));

    bootstrap.teardownWorkspaceLocalOwner();
    await bootstrap.ensureWorkspaceLocalOwner("user-1", true);

    expect(directoryStore.getState().workspaces.map((w) => w.id)).toEqual(["ws-1"]);
    expect(docCacheClear).not.toHaveBeenCalled();
    expect(queryClientClear).not.toHaveBeenCalled();
  });

  it("owner change clears every local table, drops dependent caches, and rewrites the owner row", async () => {
    await bootstrap.ensureWorkspaceLocalOwner("user-1", true);
    await directoryCommands.upsert(createMembershipSummary({ id: "ws-1" }));
    await replicaCommands.replaceWorkspace({
      workspace: createMembershipSummary({ id: "ws-1" }),
      accessMode: "member",
      workspaceRole: "member",
      pages: [createPage({ id: "p1", workspace_id: "ws-1" })],
      members: [],
    });

    bootstrap.teardownWorkspaceLocalOwner();
    await bootstrap.ensureWorkspaceLocalOwner("user-2", true);

    expect((await db.workspaceMeta.get("owner"))?.value).toBe("user-2");
    expect(await db.memberWorkspaces.count()).toBe(0);
    expect(await db.workspaceReplicas.count()).toBe(0);
    expect(await db.workspacePages.count()).toBe(0);
    expect(docCacheClear).toHaveBeenCalledTimes(1);
    expect(queryClientClear).toHaveBeenCalledTimes(1);
    expect(directoryStore.getState().workspaces).toEqual([]);
    expect(replicaStore.getState().replicas.size).toBe(0);
  });

  it("bulk-reads existing Dexie rows into the projection on first call", async () => {
    await directoryCommands.upsert(createMembershipSummary({ id: "ws-1", slug: "seeded" }));
    await bootstrap.ensureWorkspaceLocalOwner("user-1", true);
    expect(directoryStore.getState().workspaces.map((w) => w.slug)).toEqual(["seeded"]);
  });
});

describe("resetWorkspaceLocalOwner", () => {
  it("clears every table, drops dependent caches, resets projections, and writes owner=null", async () => {
    // Seed Dexie before the first hydration so ensureWorkspaceLocalOwner's
    // bulk read picks up the row; this avoids racing liveQuery in-test.
    await directoryCommands.upsert(createMembershipSummary({ id: "ws-1" }));
    await bootstrap.ensureWorkspaceLocalOwner("user-1", true);
    expect(directoryStore.getState().workspaces.length).toBe(1);

    await bootstrap.resetWorkspaceLocalOwner();

    expect((await db.workspaceMeta.get("owner"))?.value).toBeNull();
    expect(await db.memberWorkspaces.count()).toBe(0);
    expect(directoryStore.getState().workspaces).toEqual([]);
    expect(navigationStore.getState().lastVisitedWorkspaceId).toBeNull();
    expect(docCacheClear).toHaveBeenCalled();
    expect(queryClientClear).toHaveBeenCalled();
  });
});

describe("rehydrateWorkspaceLocalOwner (route-change bridge)", () => {
  const originalLocationDescriptor = Object.getOwnPropertyDescriptor(globalThis, "location");

  function stubPathname(pathname: string): void {
    Object.defineProperty(globalThis, "location", {
      configurable: true,
      writable: true,
      value: { pathname },
    });
  }

  afterEach(() => {
    if (originalLocationDescriptor) {
      Object.defineProperty(globalThis, "location", originalLocationDescriptor);
    } else {
      delete (globalThis as { location?: unknown }).location;
    }
  });

  it("hydrates projections when the user navigates from a non-local path into a local one", async () => {
    // Boot on `/login` where needsLocal is false: ensureWorkspaceLocalOwner is
    // a no-op and Dexie stays closed.
    stubPathname("/login");
    const authMod = await import("@/client/stores/auth-store");
    authMod.useAuthStore.setState({
      accessToken: "tok",
      user: { id: "user-1", email: "e", name: "n", avatar_url: null, created_at: "t" },
      sessionMode: "authenticated" as const,
      refreshState: "idle",
    });
    await bootstrap.rehydrateWorkspaceLocalOwner();

    // Seed a row directly via the real db (transparently opens Dexie).
    await directoryCommands.upsert(createMembershipSummary({ id: "ws-1", slug: "live" }));
    expect(directoryStore.getState().workspaces).toEqual([]);

    // Simulate route change into a workspace path.
    stubPathname("/live");
    await bootstrap.rehydrateWorkspaceLocalOwner();
    expect(directoryStore.getState().workspaces.map((w) => w.slug)).toEqual(["live"]);
  });

  it("is idempotent across intra-workspace navigation (same owner, still local)", async () => {
    stubPathname("/ws-a/page-1");
    const authMod = await import("@/client/stores/auth-store");
    authMod.useAuthStore.setState({
      accessToken: "tok",
      user: { id: "user-1", email: "e", name: "n", avatar_url: null, created_at: "t" },
      sessionMode: "authenticated" as const,
      refreshState: "idle",
    });
    // First call: actually hydrates.
    await bootstrap.rehydrateWorkspaceLocalOwner();
    const ownerRowAfterFirst = await db.workspaceMeta.get("owner");
    expect(ownerRowAfterFirst?.value).toBe("user-1");

    // Spy on ensureWorkspaceLocalOwner via a proxy: subsequent calls should
    // not tear down subscriptions, so we sentinel-write a row then ensure it
    // survives multiple rehydrate calls (a re-seed would emit a new projection
    // reference; we don't assert that here, but the db state check confirms
    // there's no clearAllLocal re-run).
    await directoryCommands.upsert(createMembershipSummary({ id: "ws-a", slug: "ws-a" }));

    stubPathname("/ws-a/page-2");
    await bootstrap.rehydrateWorkspaceLocalOwner();
    stubPathname("/ws-a");
    await bootstrap.rehydrateWorkspaceLocalOwner();
    stubPathname("/shared-with-me");
    await bootstrap.rehydrateWorkspaceLocalOwner();

    // Owner row untouched, seeded directory row untouched.
    expect((await db.workspaceMeta.get("owner"))?.value).toBe("user-1");
    expect((await db.memberWorkspaces.get("ws-a"))?.slug).toBe("ws-a");
  });

  it("re-hydrates when transitioning from non-local to local", async () => {
    stubPathname("/login");
    const authMod = await import("@/client/stores/auth-store");
    authMod.useAuthStore.setState({
      accessToken: "tok",
      user: { id: "user-1", email: "e", name: "n", avatar_url: null, created_at: "t" },
      sessionMode: "authenticated" as const,
      refreshState: "idle",
    });
    await bootstrap.rehydrateWorkspaceLocalOwner();
    // needsLocal=false path; db isn't even opened.
    expect(db.isOpen()).toBe(false);

    stubPathname("/ws-a");
    await bootstrap.rehydrateWorkspaceLocalOwner();
    expect(db.isOpen()).toBe(true);
    expect((await db.workspaceMeta.get("owner"))?.value).toBe("user-1");
  });
});
