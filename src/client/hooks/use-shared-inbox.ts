import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/client/lib/query-client";
import { sharedInboxQueryKey, sharedInboxQueryOptions } from "@/client/lib/queries/shared-inbox";
import { useAuthStore, selectIsAuthenticated } from "@/client/stores/auth-store";
import { useWorkspaceStore } from "@/client/stores/workspace-store";
import { api } from "@/client/lib/api";
import type { SharedPagesResponse, SharedWithMeItem, SharedInboxWorkspaceSummary } from "@/shared/types";

/**
 * Imperative one-shot fetch used by pre-navigation decision flows (e.g.
 * `EmptyWorkspaceView` deciding whether to auto-redirect to the shared inbox).
 * Goes through the shared QueryClient so in-flight calls dedupe with any
 * reactive `useSharedInbox()` subscriber, and mirrors the resolved data into
 * Zustand so the persisted cache stays aligned. `staleTime: 0` forces a
 * fresh fetch each call — decision flows should not rely on stale data.
 */
export async function fetchSharedInbox(): Promise<SharedPagesResponse> {
  const response = await queryClient.fetchQuery({
    queryKey: sharedInboxQueryKey,
    queryFn: () => api.shares.sharedWithMe(),
    staleTime: 0,
    retry: false,
  });
  useWorkspaceStore.getState().setSharedInbox(response.items, response.workspace_summaries);
  return response;
}

export type SharedInboxStatus = "idle" | "loading" | "error";

export interface SharedInboxView {
  /** Cross-workspace items only — pages shared with the user in workspaces
   *  where they are not a member. */
  items: SharedWithMeItem[];
  /** Same-workspace summary: the user belongs to these workspaces and can
   *  find the shared pages inside the normal workspace tree. */
  workspaceSummaries: SharedInboxWorkspaceSummary[];
  status: SharedInboxStatus;
  refresh: () => Promise<void>;
}

export function useSharedInbox(): SharedInboxView {
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const cachedItems = useWorkspaceStore((s) => s.sharedInbox);
  const cachedSummaries = useWorkspaceStore((s) => s.sharedInboxWorkspaceSummaries);
  const setSharedInbox = useWorkspaceStore((s) => s.setSharedInbox);

  const query = useQuery({
    ...sharedInboxQueryOptions,
    enabled: isAuthenticated,
  });

  useEffect(() => {
    if (query.data) {
      setSharedInbox(query.data.items, query.data.workspace_summaries);
    }
  }, [query.data, setSharedInbox]);

  const items = query.data?.items ?? cachedItems;
  const workspaceSummaries = query.data?.workspace_summaries ?? cachedSummaries;

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

  return { items, workspaceSummaries, status, refresh };
}
