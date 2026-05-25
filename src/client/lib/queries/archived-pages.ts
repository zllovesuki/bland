import { queryOptions } from "@tanstack/react-query";
import { api } from "@/client/lib/api";

export const archivedPagesQueryKey = (workspaceId: string) => ["workspace-archived-pages", workspaceId] as const;

export const archivedPagesQueryOptions = (workspaceId: string) =>
  queryOptions({
    queryKey: archivedPagesQueryKey(workspaceId),
    queryFn: () => api.pages.archived(workspaceId),
    staleTime: 10_000,
  });
