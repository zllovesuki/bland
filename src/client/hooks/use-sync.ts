import { useState, useEffect } from "react";
import type YProvider from "y-partyserver/provider";
import type { Awareness } from "y-protocols/awareness";

export type SyncStatus = "connected" | "connecting" | "disconnected";

export function useSyncStatus(provider: YProvider | null): {
  status: SyncStatus;
  synced: boolean;
} {
  const [status, setStatus] = useState<SyncStatus>("disconnected");
  const [synced, setSynced] = useState(false);

  useEffect(() => {
    if (!provider) {
      setStatus("disconnected");
      setSynced(false);
      return;
    }

    if (provider.wsconnected) setStatus("connected");
    else setStatus("connecting");
    setSynced(provider.synced);

    const onStatus = ({ status: s }: { status: string }) => setStatus(s as SyncStatus);
    const onSync = (isSynced: boolean) => setSynced(isSynced);

    provider.on("status", onStatus);
    provider.on("synced", onSync);

    return () => {
      provider.off("status", onStatus);
      provider.off("synced", onSync);
    };
  }, [provider]);

  return { status, synced };
}

export interface AwarenessUser {
  name: string;
  color: string;
  avatar_url?: string | null;
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

export function userColor(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = ((hash << 5) - hash + userId.charCodeAt(i)) | 0;
  }
  return COLORS[Math.abs(hash) % COLORS.length];
}
