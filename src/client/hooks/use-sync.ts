import { useCallback, useSyncExternalStore } from "react";
import type YProvider from "y-partyserver/provider";
import type { Awareness } from "y-protocols/awareness";
import { getDocSyncStatus, type SyncStatus } from "@/client/lib/doc-sync-provider";

export type { SyncStatus } from "@/client/lib/doc-sync-provider";

export function useSyncStatus(
  provider: YProvider | null,
  online: boolean,
): {
  status: SyncStatus;
  synced: boolean;
} {
  const subscribe = useCallback(
    (callback: () => void) => {
      if (!provider) return () => {};

      provider.on("status", callback);
      provider.on("synced", callback);

      return () => {
        provider.off("status", callback);
        provider.off("synced", callback);
      };
    },
    [provider],
  );

  const getSnapshot = useCallback(() => getSyncSnapshotKey(provider), [provider]);
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, () => DISCONNECTED_SYNC_SNAPSHOT);
  const [providerStatus, synced] = parseSyncSnapshotKey(snapshot);

  return {
    status: online ? providerStatus : "disconnected",
    synced,
  };
}

export interface AwarenessUser {
  userId: string | null;
}

export interface AwarenessState {
  user?: AwarenessUser;
  [key: string]: unknown;
}

export function useAwareness(awareness: Awareness | null): Map<number, AwarenessState> {
  const subscribe = useCallback(
    (callback: () => void) => {
      if (!awareness) return () => {};

      const handleChange = () => {
        callback();
      };

      awareness.on("change", handleChange);
      return () => awareness.off("change", handleChange);
    },
    [awareness],
  );

  const getSnapshot = useCallback(() => getAwarenessSnapshot(awareness), [awareness]);

  return useSyncExternalStore(subscribe, getSnapshot, () => EMPTY_MAP);
}

const EMPTY_MAP = new Map<number, AwarenessState>();
const DISCONNECTED_SYNC_SNAPSHOT = "disconnected:0";

function getSyncSnapshotKey(provider: YProvider | null): string {
  if (!provider) return DISCONNECTED_SYNC_SNAPSHOT;
  return `${getDocSyncStatus(provider, true)}:${provider.synced ? "1" : "0"}`;
}

function parseSyncSnapshotKey(key: string): [SyncStatus, boolean] {
  const [status, synced] = key.split(":");
  return [(status as SyncStatus) || "disconnected", synced === "1"];
}

interface AwarenessSnapshotCache {
  snapshot: Map<number, AwarenessState>;
}

const awarenessSnapshotCaches = new WeakMap<Awareness, AwarenessSnapshotCache>();

function getAwarenessSnapshotCache(awareness: Awareness): AwarenessSnapshotCache {
  let cache = awarenessSnapshotCaches.get(awareness);
  if (!cache) {
    cache = {
      snapshot: EMPTY_MAP,
    };
    awarenessSnapshotCaches.set(awareness, cache);
  }
  return cache;
}

function getAwarenessSnapshot(awareness: Awareness | null): Map<number, AwarenessState> {
  if (!awareness) return EMPTY_MAP;

  const cache = getAwarenessSnapshotCache(awareness);
  const states = awareness.getStates() as Map<number, AwarenessState>;
  if (!areAwarenessSnapshotsEqual(cache.snapshot, states)) {
    cache.snapshot = new Map(states);
  }
  return cache.snapshot;
}

function areAwarenessSnapshotsEqual(previous: Map<number, AwarenessState>, next: Map<number, AwarenessState>): boolean {
  if (previous.size !== next.size) return false;
  for (const [clientId, state] of next) {
    if (!Object.is(previous.get(clientId), state)) return false;
  }
  return true;
}

const COLORS = ["#3b82f6", "#ef4444", "#10b981", "#f59e0b", "#9d6ee8", "#ec4899", "#06b6d4", "#f97316"];

function hashToColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
  }
  return COLORS[Math.abs(hash) % COLORS.length];
}

export function awarenessColor(userId: string | null, clientId: number): string {
  return hashToColor(userId ?? `anon:${clientId}`);
}
