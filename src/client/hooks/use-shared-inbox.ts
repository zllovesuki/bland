import { useEffect, useState } from "react";
import { api } from "@/client/lib/api";
import { useAuthStore, selectIsAuthenticated } from "@/client/stores/auth-store";
import { useWorkspaceStore } from "@/client/stores/workspace-store";
import type { SharedWithMeItem } from "@/shared/types";

/**
 * Coalesces only truly concurrent `api.shares.sharedWithMe()` calls into one
 * network request. Subsequent calls (after the in-flight promise resolves)
 * refetch — the canonical source of truth is always the server, and the
 * window of possible concurrent callers (`EmptyWorkspaceView` -> navigate ->
 * `SharedWithMeView` mount) is short enough that the in-flight dedup
 * usually catches it. Auth/session changes cleanly invalidate state because
 * no time-based cache layer hides behind this fetcher.
 */
let pendingFetch: Promise<SharedWithMeItem[]> | null = null;

export async function fetchSharedInbox(): Promise<SharedWithMeItem[]> {
  if (pendingFetch) return pendingFetch;
  pendingFetch = (async () => {
    try {
      const items = await api.shares.sharedWithMe();
      useWorkspaceStore.getState().setSharedInbox(items);
      return items;
    } finally {
      pendingFetch = null;
    }
  })();
  return pendingFetch;
}

export type SharedInboxStatus = "idle" | "loading" | "error";

export interface SharedInboxView {
  items: SharedWithMeItem[];
  status: SharedInboxStatus;
  refresh: () => Promise<void>;
}

export function useSharedInbox(): SharedInboxView {
  const items = useWorkspaceStore((s) => s.sharedInbox);
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const [status, setStatus] = useState<SharedInboxStatus>(
    items.length > 0 ? "idle" : isAuthenticated ? "loading" : "error",
  );

  useEffect(() => {
    if (!isAuthenticated) {
      setStatus(useWorkspaceStore.getState().sharedInbox.length > 0 ? "idle" : "error");
      return;
    }

    let cancelled = false;
    // Show cached items immediately (idle) while we refresh in the background;
    // only flip to loading when there is nothing to render.
    setStatus(useWorkspaceStore.getState().sharedInbox.length > 0 ? "idle" : "loading");
    fetchSharedInbox()
      .then(() => {
        if (!cancelled) setStatus("idle");
      })
      .catch(() => {
        if (cancelled) return;
        setStatus(useWorkspaceStore.getState().sharedInbox.length > 0 ? "idle" : "error");
      });

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  const refresh = async () => {
    setStatus("loading");
    try {
      await fetchSharedInbox();
      setStatus("idle");
    } catch {
      setStatus(useWorkspaceStore.getState().sharedInbox.length > 0 ? "idle" : "error");
    }
  };

  return { items, status, refresh };
}
