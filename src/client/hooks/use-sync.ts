import { useEffect, useState } from "react";
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
  const [providerStatus, setProviderStatus] = useState<SyncStatus>(() => getDocSyncStatus(provider, true));
  const [synced, setSynced] = useState(provider?.synced ?? false);

  useEffect(() => {
    if (!provider) {
      setProviderStatus("disconnected");
      setSynced(false);
      return;
    }

    setProviderStatus(getDocSyncStatus(provider, true));
    setSynced(provider.synced);

    const onStatus = () => setProviderStatus(getDocSyncStatus(provider, true));
    const onSynced = (next: boolean) => setSynced(next);

    provider.on("status", onStatus);
    provider.on("synced", onSynced);

    return () => {
      provider.off("status", onStatus);
      provider.off("synced", onSynced);
    };
  }, [provider]);

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
  const [states, setStates] = useState<Map<number, AwarenessState>>(EMPTY_MAP);

  useEffect(() => {
    if (!awareness) {
      setStates(EMPTY_MAP);
      return;
    }

    const update = () => setStates(new Map(awareness.getStates() as Map<number, AwarenessState>));
    update();
    awareness.on("change", update);
    return () => awareness.off("change", update);
  }, [awareness]);

  return states;
}

const EMPTY_MAP = new Map<number, AwarenessState>();

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
