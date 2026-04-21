import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/client/lib/query-client";
import { sharedInboxQueryKey, sharedInboxQueryOptions } from "@/client/lib/queries/shared-inbox";
import { useAuthStore, selectIsAuthenticated } from "@/client/stores/auth-store";
import { useWorkspaceStore } from "@/client/stores/workspace-store";
import { api } from "@/client/lib/api";
import type { SharedWithMeItem } from "@/shared/types";

/**
 * Imperative one-shot fetch used by pre-navigation decision flows (e.g.
 * `EmptyWorkspaceView` deciding whether to auto-redirect to the shared inbox).
 * Goes through the shared QueryClient so in-flight calls dedupe with any
 * reactive `useSharedInbox()` subscriber, and mirrors the resolved data into
 * Zustand so the persisted cache stays aligned. `staleTime: 0` forces a
 * fresh fetch each call — decision flows should not rely on stale data.
 */
export async function fetchSharedInbox(): Promise<SharedWithMeItem[]> {
  const items = await queryClient.fetchQuery({
    queryKey: sharedInboxQueryKey,
    queryFn: () => api.shares.sharedWithMe(),
    staleTime: 0,
    retry: false,
  });
  useWorkspaceStore.getState().setSharedInbox(items);
  return items;
}

export type SharedInboxStatus = "idle" | "loading" | "error";

export interface SharedInboxView {
  items: SharedWithMeItem[];
  status: SharedInboxStatus;
  refresh: () => Promise<void>;
}

export function useSharedInbox(): SharedInboxView {
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const cachedItems = useWorkspaceStore((s) => s.sharedInbox);
  const setSharedInbox = useWorkspaceStore((s) => s.setSharedInbox);

  const query = useQuery({
    ...sharedInboxQueryOptions,
    enabled: isAuthenticated,
  });

  // Mirror query results into Zustand so the persisted inbox cache stays in
  // sync with whatever the network returned. Consumers that read Zustand
  // directly (e.g. the auto-redirect path) see the same data without needing
  // to subscribe to the Query cache.
  useEffect(() => {
    if (query.data) {
      setSharedInbox(query.data);
    }
  }, [query.data, setSharedInbox]);

  const items = query.data ?? cachedItems;

  let status: SharedInboxStatus;
  if (!isAuthenticated) {
    status = items.length > 0 ? "idle" : "error";
  } else if (query.isError) {
    status = items.length > 0 ? "idle" : "error";
  } else if (query.isPending) {
    status = items.length > 0 ? "idle" : "loading";
  } else {
    status = "idle";
  }

  const refresh = async () => {
    await query.refetch();
  };

  return { items, status, refresh };
}
