import { liveQuery, type Subscription } from "dexie";
import { docCache } from "@/client/lib/doc-cache-registry";
import { queryClient } from "@/client/lib/query-client";
import { SESSION_MODES, type SessionMode } from "@/client/lib/constants";
import { useAuthStore } from "./auth-store";
import { db, type MemberWorkspaceRow, type WorkspacePageRow, type WorkspaceReplicaRow } from "./db/bland-db";
import { applyWorkspaceDirectoryProjection, resetWorkspaceDirectoryProjection } from "./workspace-directory";
import {
  applyWorkspaceReplicaProjection,
  resetWorkspaceReplicaProjection,
  type WorkspaceReplicaProjection,
} from "./workspace-replica";
import {
  applyWorkspaceNavigationProjection,
  resetWorkspaceNavigationProjection,
  type WorkspaceNavigationProjection,
} from "./workspace-navigation";
import { applySharedInboxProjection, resetSharedInboxProjection, type SharedInboxState } from "./shared-inbox";
import { workspaceLifecycleCommands } from "./db/workspace-lifecycle";

const subscriptions: Subscription[] = [];

function stopSubscriptions(): void {
  while (subscriptions.length > 0) {
    const sub = subscriptions.pop();
    sub?.unsubscribe();
  }
}

async function readDirectoryProjection(): Promise<MemberWorkspaceRow[]> {
  return db.memberWorkspaces.orderBy("rank").toArray();
}

async function readReplicaProjection(): Promise<WorkspaceReplicaProjection> {
  const [replicas, pages, members, pageAccess] = await Promise.all([
    db.workspaceReplicas.toArray() as Promise<WorkspaceReplicaRow[]>,
    db.workspacePages.toArray() as Promise<WorkspacePageRow[]>,
    db.workspaceMembers.toArray(),
    db.pageAccess.toArray(),
  ]);
  return { replicas, pages, members, pageAccess };
}

async function readNavigationProjection(): Promise<WorkspaceNavigationProjection> {
  const [lastVisitedMeta, lastVisitedPages] = await Promise.all([
    db.workspaceMeta.get("lastVisitedWorkspaceId"),
    db.lastVisitedPages.toArray(),
  ]);
  return {
    lastVisitedWorkspaceId: lastVisitedMeta?.value ?? null,
    lastVisitedPages,
  };
}

async function readSharedInboxProjection(): Promise<SharedInboxState> {
  const [itemRows, summaryRows] = await Promise.all([
    db.sharedInboxItems.orderBy("rank").toArray(),
    db.sharedInboxWorkspaceSummaries.orderBy("rank").toArray(),
  ]);
  return {
    items: itemRows.map((row) => row.item),
    workspaceSummaries: summaryRows.map((row) => row.summary),
  };
}

function attachSubscriptions(): void {
  subscriptions.push(
    liveQuery(() => readDirectoryProjection()).subscribe({
      next: (rows) => applyWorkspaceDirectoryProjection(rows),
    }),
  );
  subscriptions.push(
    liveQuery(() => readReplicaProjection()).subscribe({
      next: (projection) => applyWorkspaceReplicaProjection(projection),
    }),
  );
  subscriptions.push(
    liveQuery(() => readNavigationProjection()).subscribe({
      next: (projection) => applyWorkspaceNavigationProjection(projection),
    }),
  );
  subscriptions.push(
    liveQuery(() => readSharedInboxProjection()).subscribe({
      next: (projection) => applySharedInboxProjection(projection),
    }),
  );
}

function resetAllProjections(): void {
  resetWorkspaceDirectoryProjection();
  resetWorkspaceReplicaProjection();
  resetWorkspaceNavigationProjection();
  resetSharedInboxProjection();
}

/**
 * Pure predicate: does the current navigation destination need the local
 * workspace replica loaded? Pre-login / share-token / invite paths do not
 * and must not pay Dexie hydration cost.
 */
export function getNeedsLocalWorkspace(pathname: string, sessionMode: SessionMode): boolean {
  if (sessionMode === SESSION_MODES.ANONYMOUS) return false;
  if (pathname.startsWith("/login")) return false;
  if (pathname.startsWith("/invite/")) return false;
  if (pathname.startsWith("/s/")) return false;
  return true;
}

/**
 * Ensure Dexie is open, owner-validated against the current user, and the
 * four projection stores are seeded before the caller mounts React. On
 * owner mismatch, clears every local table (preserving the meta row
 * structure) and drops dependent caches (`docCache`, `queryClient`).
 *
 * When `needsLocal` is false (anonymous / share / login / invite), this is
 * a no-op: the projection stores stay at their empty defaults and Dexie
 * remains closed.
 */
export async function ensureWorkspaceLocalOwner(userId: string | null, needsLocal: boolean): Promise<void> {
  if (!needsLocal) return;
  stopSubscriptions();

  if (!db.isOpen()) {
    await db.open();
  }

  const ownerMeta = await db.workspaceMeta.get("owner");
  const currentOwner = ownerMeta?.value ?? null;

  if (currentOwner && currentOwner !== userId) {
    await workspaceLifecycleCommands.clearAllLocal();
    docCache.clearAll();
    queryClient.clear();
    resetAllProjections();
  }

  await db.workspaceMeta.put({ key: "owner", value: userId });

  const [directory, replica, navigation, sharedInbox] = await Promise.all([
    readDirectoryProjection(),
    readReplicaProjection(),
    readNavigationProjection(),
    readSharedInboxProjection(),
  ]);
  applyWorkspaceDirectoryProjection(directory);
  applyWorkspaceReplicaProjection(replica);
  applyWorkspaceNavigationProjection(navigation);
  applySharedInboxProjection(sharedInbox);

  attachSubscriptions();
}

/**
 * Logout / hard reset path. Stops subscriptions, clears every local table,
 * clears dependent caches, and resets the projection stores to their empty
 * defaults. Leaves Dexie open so a subsequent login can re-seed without
 * paying the open cost twice.
 */
export async function resetWorkspaceLocalOwner(): Promise<void> {
  stopSubscriptions();

  if (!db.isOpen()) {
    await db.open();
  }

  await workspaceLifecycleCommands.clearAllLocal();
  await db.workspaceMeta.put({ key: "owner", value: null });
  docCache.clearAll();
  queryClient.clear();
  resetAllProjections();
  desiredState = null;
}

/**
 * Test / HMR escape hatch. Stops liveQuery subscriptions without touching
 * Dexie contents or projection state.
 */
export function teardownWorkspaceLocalOwner(): void {
  stopSubscriptions();
}

// Serializes overlapping hydrations so auth transitions don't race inside
// Dexie (owner-change clear + seed + subscribe is not reentrant-safe).
let hydrationChain: Promise<void> = Promise.resolve();
// Last state we asked `ensureWorkspaceLocalOwner` for. Used to make
// `scheduleHydration` idempotent: intra-workspace navigation calls from the
// router's `onResolved` subscription are no-ops, so we don't tear down and
// re-attach liveQuery subscriptions on every route transition.
let desiredState: { userId: string | null; needsLocal: boolean } | null = null;

function scheduleHydration(): void {
  const { user, sessionMode } = useAuthStore.getState();
  const userId = user?.id ?? null;
  const pathname = globalThis.location?.pathname ?? "/";
  const needsLocal = getNeedsLocalWorkspace(pathname, sessionMode);

  if (desiredState && desiredState.userId === userId && desiredState.needsLocal === needsLocal) {
    return;
  }

  desiredState = { userId, needsLocal };
  hydrationChain = hydrationChain.catch(() => {}).then(() => ensureWorkspaceLocalOwner(userId, needsLocal));
}

/**
 * Imperative trigger for route changes: re-evaluate `getNeedsLocalWorkspace`
 * against the current pathname and hydrate the replica if a previously
 * skipped route now needs it. Used by the router's `onResolved` hook so a
 * user booting on `/login` and navigating to `/workspaceSlug/...` still
 * sees populated projections without a full reload. Returns the hydration
 * chain so consumers that must observe settled projections before their
 * one-shot cache reads can await it.
 */
export function rehydrateWorkspaceLocalOwner(): Promise<void> {
  scheduleHydration();
  return hydrationChain;
}

/**
 * Local surfaces (EmptyWorkspaceView, WorkspaceViewProvider) call this at
 * the top of their async read paths so an in-app transition from a non-local
 * route (`/login`, `/s/$token`) does not race the router-driven rehydrate.
 * Does not re-schedule; just awaits whatever the current chain holds.
 */
export function waitForWorkspaceLocalHydration(): Promise<void> {
  return hydrationChain;
}

/**
 * Re-hydrate the workspace replica whenever the auth session identity
 * changes -- e.g., a background `refreshSession()` completes after bootstrap,
 * a user logs in on the login page, or `markLocalOnly` flips back to
 * authenticated. Callers should invoke this exactly once (main.tsx).
 */
export function installWorkspaceLocalOwnerAutoHydrator(): () => void {
  let lastUserId: string | null = useAuthStore.getState().user?.id ?? null;
  let lastMode = useAuthStore.getState().sessionMode;

  return useAuthStore.subscribe((state) => {
    const userId = state.user?.id ?? null;
    const mode = state.sessionMode;
    if (userId === lastUserId && mode === lastMode) return;
    lastUserId = userId;
    lastMode = mode;
    scheduleHydration();
  });
}
